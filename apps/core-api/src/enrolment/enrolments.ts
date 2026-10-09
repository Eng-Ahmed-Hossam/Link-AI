import { sql } from 'kysely';
import type { PaymentProvider } from '../adapters/payments';
import type { Config } from '../config';
import type { Search } from '../market/search';
import type { Children } from '../org/children';
import { Effects, type Money } from '../payments/money';
import { writeAudit } from '../platform/audit';
import type { Database, RlsContext, Tx } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import type { Logger } from '../platform/logger';
import { enqueue } from '../platform/outbox';
import { Problem, forbidden, notFound } from '../platform/problem';
import { addMonth } from '../platform/time';
import {
  COMMITTED,
  ENROLMENT_COLUMNS,
  type EnrolmentRow,
  LIVE,
  type Method,
  type Plan,
  loadEnrolment,
  nextPeriodSessions,
  paidSessions,
  seatSessions,
  sessionById,
  sessionsBetween,
} from './coverage';
import type { Seats } from './seats';

type Lang = 'ar' | 'en';
const money = (amountPt: number) => ({ amountPt, currency: 'EGP' as const });

/**
 * Reservation and enrolment (MKT-ENR, BR-ENR, docs/08 §4): a hold on one seat in every covered
 * session, checkout through the provider, the 8 states, the waitlist and the teacher's
 * confirmation step. Parents act through GUARDIAN RLS; state changes from money (webhooks, jobs)
 * run as SYSTEM in `Money` and the jobs.
 */
export class Enrolments {
  constructor(
    private readonly db: Database,
    private readonly seats: Seats,
    private readonly money: Money,
    private readonly provider: PaymentProvider,
    private readonly search: Search,
    private readonly children: Children,
    private readonly config: Config,
    private readonly log: Logger,
  ) {}

  // ── Create: the hold (MKT-ENR-02) ───────────────────────────────────────────────
  async create(
    userId: string,
    body: {
      groupId: string;
      studentId: string;
      paymentPlan: Plan;
      firstSessionId?: string;
      sessionId?: string;
      sharePhone: boolean;
    },
    lang: Lang,
    requestId?: string,
    reuseHoldId?: string,
  ) {
    const id = reuseHoldId ?? uuidv7();
    const plan = await this.db.asUser(userId, async (tx, ctx) => {
      if (!ctx.guardianId) throw forbidden('Only parents reserve seats.');
      const child = await tx
        .selectFrom('org.students')
        .select('id')
        .where('id', '=', body.studentId)
        .executeTakeFirst();
      if (!child) throw notFound('child');
      const g = await tx
        .selectFrom('market.public_groups')
        .select([
          'id',
          'centre_id',
          'teacher_id',
          'seat_cap',
          'monthly_fee_pt',
          'session_fee_pt',
          'offers_monthly_recurring',
        ])
        .where('id', '=', body.groupId)
        .executeTakeFirst();
      if (!g) throw notFound('group');
      if (body.paymentPlan === 'monthly_recurring' && !g.offers_monthly_recurring)
        throw new Problem(
          422,
          'plan_not_offered',
          'This teacher does not offer the monthly plan for this group.',
        );
      const live = await sql<{ n: number }>`
        SELECT count(*)::int AS n FROM market.enrolments
        WHERE student_id = ${body.studentId} AND group_id = ${g.id}
          AND status IN ('pending_payment', 'awaiting_teacher', 'confirmed', 'past_due')`.execute(
        tx,
      );
      if (live.rows[0]!.n > 0)
        throw new Problem(409, 'already_enrolled', 'This child already has a place in this group.');
      const firstId = body.paymentPlan === 'per_session' ? body.sessionId : body.firstSessionId;
      if (!firstId)
        throw new Problem(422, 'validation_failed', 'Choose the first session.', {
          errors: [
            {
              field: body.paymentPlan === 'per_session' ? 'sessionId' : 'firstSessionId',
              code: 'required',
            },
          ],
        });
      // Session times are read as SYSTEM; the group was checked public above, the session below.
      const first = await this.db.asSystem((sys) => sessionById(sys, firstId));
      const inGroup = await tx
        .selectFrom('market.public_group_sessions')
        .select(['id', 'group_id'])
        .where('id', '=', firstId)
        .executeTakeFirst();
      if (!first || inGroup?.group_id !== g.id || first.startsAt <= new Date())
        throw new Problem(
          422,
          'validation_failed',
          'Choose a session of this group that has not started.',
          {
            errors: [{ field: 'sessionId', code: 'unknown_session' }],
          },
        );
      const teacher = await this.db.asSystem((sys) =>
        sys
          .selectFrom('org.teachers')
          .select('settings')
          .where('id', '=', g.teacher_id!)
          .executeTakeFirstOrThrow(),
      );
      const periodStart = body.paymentPlan === 'per_session' ? null : first.day;
      const periodEnd = periodStart ? addMonth(periodStart) : null;
      const row: EnrolmentRow = {
        id,
        reference: '',
        student_id: body.studentId,
        guardian_id: ctx.guardianId,
        group_id: g.id!,
        centre_id: g.centre_id!,
        teacher_id: g.teacher_id!,
        status: 'pending_payment',
        payment_plan: body.paymentPlan,
        method: null,
        price_pt: String(body.paymentPlan === 'per_session' ? g.session_fee_pt : g.monthly_fee_pt), // OD-39
        first_session_id: first.id,
        session_id: body.paymentPlan === 'per_session' ? first.id : null,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        hold_expires_at: new Date(Date.now() + this.config.HOLD_SECONDS * 1000),
        teacher_reviews: !!(teacher.settings as { reviewEachEnrolment?: boolean })
          .reviewEachEnrolment,
        phone_shared: body.sharePhone,
        plan_cancelled_at: null,
        status_changed_at: new Date(),
        created_at: new Date(),
      };
      const sessions = await this.db.asSystem((sys) => seatSessions(sys, row));
      return { row, seatCap: g.seat_cap!, sessions };
    });

    // BR-ENR-02: a hold in EVERY covered session, atomically, or none (409 names the full one).
    const g = { groupId: plan.row.group_id, centreId: plan.row.centre_id, seatCap: plan.seatCap };
    const ids = plan.sessions.map((s) => s.id);
    const held = await this.seats.acquire(g, id, ids, this.config.HOLD_SECONDS * 1000);
    if (!held.ok) {
      const full = plan.sessions.find((s) => s.id === held.fullSessionId);
      throw new Problem(
        409,
        'seat_unavailable',
        'A session this plan covers is full. You can join the waitlist.',
        {
          errors: [
            {
              field: 'sessionId',
              code: 'full',
              sessionId: held.fullSessionId,
              startsAt: full?.startsAt.toISOString(),
            },
          ],
        },
      );
    }
    try {
      await this.db.asUser(userId, async (tx, ctx) => {
        let consentId: string | null = null;
        if (plan.row.phone_shared) {
          consentId = uuidv7();
          await tx
            .insertInto('org.consent_events')
            .values({
              id: consentId,
              user_id: userId,
              guardian_id: ctx.guardianId,
              student_id: plan.row.student_id,
              kind: 'share_phone_with_teacher',
              granted: true,
              version: 'draft-2026-10',
              source: 'checkout',
              context: JSON.stringify({ groupId: plan.row.group_id }),
            })
            .execute();
        }
        const r = plan.row;
        await tx
          .insertInto('market.enrolments')
          .values({
            id: r.id,
            student_id: r.student_id,
            guardian_id: r.guardian_id,
            group_id: r.group_id,
            centre_id: r.centre_id,
            teacher_id: r.teacher_id,
            status: 'pending_payment',
            payment_plan: r.payment_plan,
            price_pt: r.price_pt,
            first_session_id: r.first_session_id,
            session_id: r.session_id,
            current_period_start: r.current_period_start,
            current_period_end: r.current_period_end,
            hold_expires_at: r.hold_expires_at,
            teacher_reviews: r.teacher_reviews,
            phone_shared: r.phone_shared,
            consent_event_id: consentId,
            waitlist_entry_id: reuseHoldId ?? null,
          })
          .execute();
        await enqueue(tx, {
          type: 'enrolment.held',
          aggregateType: 'enrolment',
          aggregateId: r.id,
          centreId: r.centre_id,
          data: { enrolmentId: r.id, groupId: r.group_id, sessions: ids.length },
          requestId,
        });
        await writeAudit(tx, {
          actorId: userId,
          actorType: 'user',
          centreId: r.centre_id,
          action: 'enrolment.held',
          objectType: 'enrolment',
          objectRef: r.id,
          after: { status: 'pending_payment', plan: r.payment_plan, sessions: ids.length },
          requestId,
        });
      });
    } catch (err) {
      await this.seats.release(g, id, ids);
      throw err;
    }
    return this.get(userId, id, lang);
  }

  /** POST /v1/enrolments/{id}/checkout (MKT-ENR-03/04/05). */
  async checkout(userId: string, id: string, method: Method, idemKey: string, lang: Lang) {
    const e = await this.db.asUser(userId, (tx) => this.own(tx, id));
    return this.money.checkout(userId, e, method, idemKey, lang);
  }

  private async own(tx: Tx, id: string) {
    const e = await loadEnrolment(tx, id);
    // RLS shows a parent their own children's rows only; anything else is "not found" (07 §1).
    if (!e) throw notFound('enrolment');
    return e;
  }

  // ── Reads (MKT-ENR-06/07, 07 P-7) ───────────────────────────────────────────────
  get(userId: string, id: string, lang: Lang) {
    return this.db.asUser(userId, async (tx, ctx) => {
      const e = await this.own(tx, id);
      if (
        e.guardian_id !== ctx.guardianId &&
        ctx.teacherId !== e.teacher_id &&
        !ctx.centreIds.includes(e.centre_id)
      )
        throw notFound('enrolment');
      return (await this.dtos(tx, [e], lang))[0]!;
    });
  }

  mine(userId: string, lang: Lang) {
    return this.db.asUser(userId, async (tx, ctx) => {
      if (!ctx.guardianId) return { data: [], nextCursor: null };
      const rows = (await tx
        .selectFrom('market.enrolments as e')
        .select([...ENROLMENT_COLUMNS])
        .where('e.guardian_id', '=', ctx.guardianId)
        .orderBy('e.created_at', 'desc')
        .execute()) as EnrolmentRow[];
      return { data: await this.dtos(tx, rows, lang), nextCursor: null };
    });
  }

  private async dtos(tx: Tx, rows: EnrolmentRow[], lang: Lang) {
    if (!rows.length) return [];
    const groups = await this.search.groupSummaries(
      tx,
      [...new Set(rows.map((e) => e.group_id))],
      lang,
    );
    const kids = await tx
      .selectFrom('org.students')
      .select(['id', 'display_name', 'curriculum_id', 'school_year_id'])
      .where(
        'id',
        'in',
        rows.map((e) => e.student_id),
      )
      .execute();
    const ids = rows.map((e) => e.id);
    const payments = await tx
      .selectFrom('ledger.payments')
      .select([
        'enrolment_id',
        'status',
        'amount_pt',
        'method',
        'card_last4',
        'succeeded_at',
        'fawry_reference',
        'expires_at',
        'created_at',
      ])
      .where('enrolment_id', 'in', ids)
      .orderBy('created_at', 'desc')
      .execute();
    const refunds = await tx
      .selectFrom('ledger.refunds')
      .select(['id', 'enrolment_id', 'status', 'amount_pt', 'policy', 'created_at'])
      .where('enrolment_id', 'in', ids)
      .orderBy('created_at', 'desc')
      .execute();
    const reviews = await tx
      .selectFrom('market.reviews')
      .select(['enrolment_id', 'target_type'])
      .where('enrolment_id', 'in', ids)
      .execute();
    const out = [];
    for (const e of rows) {
      const group =
        groups.find((g) => g.id === e.group_id) ?? (await this.groupFallback(tx, e, lang));
      const kid = kids.find((k) => k.id === e.student_id);
      const first = await sessionById(tx, e.first_session_id);
      const paid = await paidSessions(tx, e);
      const pays = payments.filter((p) => p.enrolment_id === e.id);
      const ok = pays.find((p) =>
        ['succeeded', 'refunded', 'partially_refunded'].includes(p.status),
      );
      const latest = pays[0];
      const fawry = pays.find((p) => p.fawry_reference && p.status === 'pending');
      const refund = refunds.find((r) => r.enrolment_id === e.id);
      const started = !!first && first.startsAt <= new Date();
      const reviewed = reviews.filter((r) => r.enrolment_id === e.id).length;
      out.push({
        id: e.id,
        reference: e.reference,
        status: e.status,
        plan: e.payment_plan,
        method: e.method,
        group,
        // Teachers and front desks see the name once paid (BR-ENR-07), through enrolment_people.
        student: kid
          ? await this.children.view(tx, kid, lang)
          : {
              id: e.student_id,
              displayName:
                (
                  await tx
                    .selectFrom('market.enrolment_people')
                    .select('student_name')
                    .where('enrolment_id', '=', e.id)
                    .executeTakeFirst()
                )?.student_name ?? '',
              curriculum: group.curriculum,
              schoolYear: group.schoolYear,
            },
        price: money(Number(e.price_pt)),
        holdExpiresAt: e.status === 'pending_payment' ? e.hold_expires_at!.toISOString() : null,
        sessionIds: paid.map((s) => s.id),
        firstSession: {
          id: e.first_session_id,
          startsAt: (first?.startsAt ?? new Date()).toISOString(),
        },
        phoneShared: e.phone_shared,
        teacherReviewsEnrolments: e.teacher_reviews,
        renewsOn:
          e.payment_plan === 'monthly_recurring' &&
          !e.plan_cancelled_at &&
          ['confirmed', 'awaiting_teacher'].includes(e.status)
            ? e.current_period_end
            : null,
        payment: ok
          ? {
              amount: money(Number(ok.amount_pt)),
              method: ok.method as Method,
              cardLast4: ok.card_last4,
              paidAt: new Date(ok.succeeded_at!).toISOString(),
            }
          : null,
        lastPaymentFailed: e.status === 'pending_payment' && latest?.status === 'failed',
        fawry:
          e.status === 'pending_payment' && fawry
            ? {
                reference: fawry.fawry_reference!,
                expiresAt: new Date(fawry.expires_at!).toISOString(),
              }
            : null,
        refund: refund
          ? {
              id: refund.id,
              status: refund.status,
              amount: money(Number(refund.amount_pt)),
              policy: refund.policy,
              createdAt: new Date(refund.created_at).toISOString(),
            }
          : null,
        firstSessionStarted: started,
        // BR-REV-01: verified parent of a confirmed enrolment, after the first session. BR-REV-02.
        canReview: started && ['confirmed', 'past_due', 'ended'].includes(e.status) && reviewed < 2,
      });
    }
    return out;
  }

  /** A closed or hidden group still shows on the parent's own enrolment. */
  private async groupFallback(tx: Tx, e: EnrolmentRow, lang: Lang): Promise<never> {
    void tx;
    void lang;
    throw notFound(`group of enrolment ${e.reference}`);
  }

  // ── Parent actions (MKT-ENR-08, BR-PMT-05, BR-REF-02/03) ────────────────────────
  /** Cancel: before paying (nothing to refund) or before the first session (refund requested). */
  async cancel(userId: string, id: string, lang: Lang, requestId?: string) {
    const effects = new Effects();
    const e = await this.db.asUser(userId, async (tx) => {
      const e = await this.own(tx, id);
      const first = await sessionById(tx, e.first_session_id);
      const before = !!first && first.startsAt > new Date();
      if (
        e.status !== 'pending_payment' &&
        (!['confirmed', 'awaiting_teacher'].includes(e.status) || !before)
      )
        throw new Problem(
          409,
          'after_first_session',
          'After the first session, ask Link to review a refund instead.',
        );
      const sessions = (await seatSessions(tx, e)).map((s) => s.id);
      await tx
        .updateTable('market.enrolments')
        .set({
          status: 'cancelled',
          status_changed_at: new Date(),
          cancelled_at: new Date(),
          cancel_reason: 'parent',
          plan_cancelled_at: e.plan_cancelled_at ?? new Date(),
        })
        .where('id', '=', e.id)
        .execute();
      await enqueue(tx, {
        type: 'enrolment.cancelled',
        aggregateType: 'enrolment',
        aggregateId: e.id,
        centreId: e.centre_id,
        data: { enrolmentId: e.id, paid: e.status !== 'pending_payment' },
        requestId,
      });
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId: e.centre_id,
        action: 'enrolment.cancelled',
        objectType: 'enrolment',
        objectRef: e.id,
        before: { status: e.status },
        after: { status: 'cancelled' },
        requestId,
      });
      const g = { groupId: e.group_id, centreId: e.centre_id };
      if (e.status === 'pending_payment') {
        effects.add(() => this.seats.release(g, e.id, sessions));
        const open = await tx
          .selectFrom('ledger.payments')
          .select(['provider_ref', 'method'])
          .where('enrolment_id', '=', e.id)
          .where('status', 'in', ['created', 'pending'])
          .execute();
        for (const p of open)
          if (p.provider_ref)
            effects.add(() => this.provider.expire(p.provider_ref!, p.method as Method));
      } else effects.add(() => this.seats.uncommit(g, sessions));
      effects.add(() => this.offerNext(e.group_id));
      return e;
    });
    if (e.status !== 'pending_payment') {
      // BR-REF-02 / OD-42: a full refund, requested and auto-eligible; Link ops approve it.
      await this.requestRefund(
        e,
        'before_first_session',
        userId,
        true,
        'Parent cancelled before the first session',
      );
      await this.revokeMandate(e, effects);
    }
    await effects.run(this.log);
    return this.get(userId, id, lang);
  }

  /** BR-PMT-05: stop the next renewal; the paid month stays. */
  async cancelPlan(userId: string, id: string, lang: Lang, requestId?: string) {
    const effects = new Effects();
    await this.db.asUser(userId, async (tx) => {
      const e = await this.own(tx, id);
      if (e.payment_plan !== 'monthly_recurring' || e.plan_cancelled_at) return;
      const next = (await nextPeriodSessions(tx, e)).map((s) => s.id);
      await tx
        .updateTable('market.enrolments')
        .set({ plan_cancelled_at: new Date() })
        .where('id', '=', e.id)
        .execute();
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId: e.centre_id,
        action: 'enrolment.plan_cancelled',
        objectType: 'enrolment',
        objectRef: e.id,
        requestId,
      });
      // The next period's seat is no longer kept (BR-ENR-13).
      if (COMMITTED.includes(e.status))
        effects.add(() =>
          this.seats.uncommit({ groupId: e.group_id, centreId: e.centre_id }, next),
        );
      effects.add(() => this.revokeMandate(e, effects));
    });
    await effects.run(this.log);
    await effects.run(this.log);
    return this.get(userId, id, lang);
  }

  /** BR-REF-03: after the first session a refund is a dispute for Link ops. */
  async disputeRefund(userId: string, id: string, reason: string | undefined, lang: Lang) {
    const e = await this.db.asUser(userId, (tx) => this.own(tx, id));
    await this.requestRefund(
      e,
      'dispute',
      userId,
      false,
      reason?.trim() || 'Parent asked for a refund review',
    );
    return this.get(userId, id, lang);
  }

  /** A refund request Link ops decide (status `requested`; nothing posts until approval). */
  private async requestRefund(
    e: EnrolmentRow,
    policy: 'before_first_session' | 'dispute',
    userId: string,
    auto: boolean,
    reason: string,
  ) {
    await this.db.asSystem(async (sys) => {
      const p = await sys
        .selectFrom('ledger.payments')
        .select(['id', 'amount_pt'])
        .where('enrolment_id', '=', e.id)
        .where('status', 'in', ['succeeded', 'partially_refunded'])
        .orderBy('succeeded_at', 'desc')
        .executeTakeFirst();
      if (!p) return;
      await sys
        .insertInto('ledger.refunds')
        .values({
          id: uuidv7(),
          payment_id: p.id,
          amount_pt: p.amount_pt,
          policy,
          status: 'requested',
          auto_eligible: auto,
          enrolment_id: e.id,
          reason,
          requested_by: userId,
          idempotency_key: `refund:${p.id}:${policy}`,
        })
        .onConflict((oc) => oc.column('idempotency_key').doNothing())
        .execute();
      await enqueue(sys, {
        type: 'refund.requested',
        aggregateType: 'enrolment',
        aggregateId: e.id,
        centreId: e.centre_id,
        data: { enrolmentId: e.id, paymentId: p.id, policy },
      });
    });
  }

  private async revokeMandate(e: EnrolmentRow, effects: Effects) {
    const m = await this.db.asSystem(async (sys) =>
      sys
        .updateTable('ledger.payment_mandates')
        .set({ status: 'revoked' })
        .where('enrolment_id', '=', e.id)
        .where('status', '=', 'active')
        .returning('provider_token_ref')
        .executeTakeFirst(),
    );
    if (m) effects.add(() => this.provider.revokeMandate(m.provider_token_ref));
  }

  // ── Teacher (J06, MKT-ENR-10, OD-08) ─────────────────────────────────────────────
  teacherList(userId: string, lang: Lang) {
    return this.db.asUser(userId, async (tx, ctx) => {
      if (!ctx.teacherId) throw forbidden('Teachers only.');
      const rows = await tx
        .selectFrom('market.enrolments as e')
        .innerJoin('market.enrolment_people as p', 'p.enrolment_id', 'e.id')
        .innerJoin('market.groups as g', 'g.id', 'e.group_id')
        .innerJoin('market.room_bookings as b', 'b.id', 'g.room_booking_id')
        .innerJoin('market.rooms_seen_by_teacher as r', 'r.id', 'b.room_id')
        .innerJoin('market.centres_seen_by_teacher as c', 'c.id', 'e.centre_id')
        .innerJoin('ref.subjects as s', 's.id', 'g.subject_id')
        .innerJoin('ref.school_years as y', 'y.id', 'g.school_year_id')
        .select([
          'e.id',
          'e.status',
          'e.payment_plan',
          'e.method',
          'e.created_at',
          'e.price_pt',
          'p.student_name',
          'p.guardian_name',
          'g.id as group_id',
          'c.name as centre_name',
          'r.name as room_name',
          's.name_en',
          's.name_ar',
          'y.short_name_en',
          'y.short_name_ar',
        ])
        .where('e.teacher_id', '=', ctx.teacherId)
        .orderBy('e.created_at', 'desc')
        .execute();
      const paid = await tx
        .selectFrom('ledger.payments')
        .select(['enrolment_id', 'amount_pt'])
        .where(
          'enrolment_id',
          'in',
          rows.length ? rows.map((r) => r.id) : ['00000000-0000-0000-0000-000000000000'],
        )
        .where('status', 'in', ['succeeded', 'partially_refunded', 'refunded'])
        .execute();
      return rows.map((r) => ({
        id: r.id,
        student: r.student_name!,
        parent: r.guardian_name ?? '',
        group: {
          id: r.group_id,
          name: `${lang === 'ar' ? r.name_ar : r.name_en} • ${(lang === 'ar' ? r.short_name_ar : r.short_name_en) ?? ''}`,
          centre: r.centre_name ?? '',
          room: r.room_name ?? '',
        },
        plan: r.payment_plan as Plan,
        method: r.method as Method | null,
        status: r.status,
        paid: (() => {
          const p = paid.find((x) => x.enrolment_id === r.id);
          return p ? money(Number(p.amount_pt)) : null;
        })(),
        createdAt: new Date(r.created_at).toISOString(),
        canDecide: r.status === 'awaiting_teacher',
      }));
    });
  }

  /** Accept, or decline with an automatic full refund (BR-ENR-11, BR-REF-07 compensation). */
  async decide(userId: string, id: string, accept: boolean, lang: Lang, requestId?: string) {
    const effects = new Effects();
    const decided = await this.db.asUser(userId, async (tx, ctx) => {
      // Not this teacher's enrolment (or not a teacher): it does not exist for them (07 §1).
      if (!ctx.teacherId) throw notFound('enrolment');
      const e = await loadEnrolment(tx, id);
      if (!e || e.teacher_id !== ctx.teacherId) throw notFound('enrolment');
      if (e.status !== 'awaiting_teacher')
        throw new Problem(409, 'not_awaiting_teacher', 'This enrolment is not waiting for you.');
      const next = accept ? 'confirmed' : 'declined';
      await tx
        .updateTable('market.enrolments')
        .set({ status: next, status_changed_at: new Date() })
        .where('id', '=', e.id)
        .execute();
      await enqueue(tx, {
        type: `enrolment.${next}`,
        aggregateType: 'enrolment',
        aggregateId: e.id,
        centreId: e.centre_id,
        data: { enrolmentId: e.id, groupId: e.group_id },
        requestId,
      });
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId: e.centre_id,
        action: `enrolment.${next}`,
        objectType: 'enrolment',
        objectRef: e.id,
        before: { status: e.status },
        after: { status: next },
        requestId,
      });
      if (!accept) {
        const sessions = (await seatSessions(tx, e)).map((s) => s.id);
        effects.add(() =>
          this.seats.uncommit({ groupId: e.group_id, centreId: e.centre_id }, sessions),
        );
        effects.add(() => this.offerNext(e.group_id));
      }
      return e;
    });
    if (!accept)
      await this.db.asSystem(async (sys) => {
        const p = await sys
          .selectFrom('ledger.payments')
          .select('id')
          .where('enrolment_id', '=', id)
          .where('status', 'in', ['succeeded', 'partially_refunded'])
          .execute();
        for (const x of p)
          await this.money.autoRefund(
            sys,
            x.id,
            'teacher_declined',
            effects,
            'Teacher declined the enrolment',
          );
      });
    if (!accept) await this.revokeMandate(decided, effects);
    await effects.run(this.log);
    return this.teacherList(userId, lang);
  }

  // ── Waitlist (MKT-ENR-09, BR-ENR-10, OD-23) ─────────────────────────────────────
  async joinWaitlist(userId: string, groupId: string, studentId: string) {
    const id = await this.db.asUser(userId, async (tx, ctx) => {
      if (!ctx.guardianId) throw forbidden('Only parents join a waitlist.');
      const child = await tx
        .selectFrom('org.students')
        .select('id')
        .where('id', '=', studentId)
        .executeTakeFirst();
      if (!child) throw notFound('child');
      const g = await tx
        .selectFrom('market.public_groups')
        .select(['id', 'centre_id'])
        .where('id', '=', groupId)
        .executeTakeFirst();
      if (!g) throw notFound('group');
      const existing = await tx
        .selectFrom('market.waitlist_entries')
        .select('id')
        .where('group_id', '=', groupId)
        .where('student_id', '=', studentId)
        .where('status', 'in', ['waiting', 'offered'])
        .executeTakeFirst();
      if (existing) return existing.id;
      const entryId = uuidv7();
      await tx
        .insertInto('market.waitlist_entries')
        .values({
          id: entryId,
          group_id: groupId,
          centre_id: g.centre_id!,
          student_id: studentId,
          guardian_id: ctx.guardianId,
        })
        .execute();
      await enqueue(tx, {
        type: 'waitlist.joined',
        aggregateType: 'waitlist_entry',
        aggregateId: entryId,
        centreId: g.centre_id,
        data: { entryId, groupId },
      });
      return entryId;
    });
    // A seat may already be free (a cancellation before anyone waited).
    await this.offerNext(groupId);
    return this.entry(userId, id);
  }

  private async entry(userId: string, id: string) {
    return this.db.asUser(userId, async (tx) => {
      const w = await tx
        .selectFrom('market.waitlist_entries')
        .select(['id', 'status', 'group_id', 'created_at'])
        .where('id', '=', id)
        .executeTakeFirst();
      if (!w) throw notFound('waitlist entry');
      const ahead = await this.db.asSystem((sys) =>
        sys
          .selectFrom('market.waitlist_entries')
          .select(sql<number>`count(*)::int`.as('n'))
          .where('group_id', '=', w.group_id)
          .where('status', 'in', ['waiting', 'offered'])
          .where('created_at', '<', w.created_at)
          .executeTakeFirstOrThrow(),
      );
      return { id: w.id, status: w.status as 'waiting', position: ahead.n + 1 };
    });
  }

  /**
   * When a seat frees up, the next family in line gets a 24-hour offer that counts as a hold
   * (BR-ENR-10): the seat of one month from the next session. Nothing happens if no seat is free.
   */
  async offerNext(groupId: string) {
    const next = await this.db.asSystem(async (sys) => {
      const w = await sys
        .selectFrom('market.waitlist_entries')
        .select(['id', 'centre_id'])
        .where('group_id', '=', groupId)
        .where('status', '=', 'waiting')
        .orderBy('created_at')
        .limit(1)
        .executeTakeFirst();
      if (!w) return null;
      const g = await sys
        .selectFrom('market.groups')
        .select(['seat_cap', 'status'])
        .where('id', '=', groupId)
        .executeTakeFirstOrThrow();
      if (g.status !== 'published') return null;
      const first = await sql<{ day: string }>`
        SELECT market.session_day(starts_at)::text AS day FROM market.group_sessions
        WHERE group_id = ${groupId} AND starts_at > now() AND status = 'scheduled' ORDER BY starts_at LIMIT 1`.execute(
        sys,
      );
      const day = first.rows[0]?.day;
      if (!day) return null;
      const sessions = await sessionsBetween(sys, groupId, day, addMonth(day));
      return { w, seatCap: g.seat_cap, sessions };
    });
    if (!next) return false;
    const ttl = 24 * 3600 * 1000; // OD-23
    const g = { groupId, centreId: next.w.centre_id, seatCap: next.seatCap };
    const ids = next.sessions.map((s) => s.id);
    const held = await this.seats.acquire(g, next.w.id, ids, ttl);
    if (!held.ok) return false;
    try {
      await this.db.asSystem(async (sys) => {
        const done = await sys
          .updateTable('market.waitlist_entries')
          .set({
            status: 'offered',
            offered_at: new Date(),
            offer_expires_at: new Date(Date.now() + ttl),
            offered_sessions: ids,
          })
          .where('id', '=', next.w.id)
          .where('status', '=', 'waiting')
          .returning('id')
          .executeTakeFirst();
        if (!done) throw new Error('entry moved');
        await enqueue(sys, {
          type: 'waitlist.offered',
          aggregateType: 'waitlist_entry',
          aggregateId: next.w.id,
          centreId: next.w.centre_id,
          data: { entryId: next.w.id, groupId },
        });
      });
    } catch (err) {
      await this.seats.release(g, next.w.id, ids);
      this.log.warn({ err, groupId }, 'waitlist offer not made');
      return false;
    }
    return true;
  }

  /** POST /v1/waitlist/{id}/accept: the offer's seat becomes a hold for checkout. */
  async acceptOffer(
    userId: string,
    entryId: string,
    body: { paymentPlan: Plan; method: Method },
    idemKey: string,
    lang: Lang,
  ) {
    const w = await this.db.asUser(userId, async (tx) => {
      const w = await tx
        .selectFrom('market.waitlist_entries')
        .select(['id', 'group_id', 'student_id', 'status', 'offer_expires_at', 'offered_sessions'])
        .where('id', '=', entryId)
        .executeTakeFirst();
      if (!w) throw notFound('waitlist entry');
      if (w.status !== 'offered' || !w.offer_expires_at || w.offer_expires_at <= new Date())
        throw new Problem(409, 'offer_expired', 'This offer has ended.');
      return w;
    });
    // The enrolment takes the entry's ID, so the offer's hold simply continues as its hold.
    const first = w.offered_sessions![0]!;
    await this.db.asSystem((sys) =>
      sys
        .updateTable('market.waitlist_entries')
        .set({ status: 'converted', enrolment_id: null })
        .where('id', '=', entryId)
        .execute(),
    );
    try {
      await this.create(
        userId,
        {
          groupId: w.group_id,
          studentId: w.student_id,
          paymentPlan: body.paymentPlan,
          ...(body.paymentPlan === 'per_session'
            ? { sessionId: first }
            : { firstSessionId: first }),
          sharePhone: false,
        },
        lang,
        undefined,
        entryId,
      );
    } catch (err) {
      await this.db.asSystem((sys) =>
        sys
          .updateTable('market.waitlist_entries')
          .set({ status: 'offered' })
          .where('id', '=', entryId)
          .execute(),
      );
      throw err;
    }
    await this.db.asSystem((sys) =>
      sys
        .updateTable('market.waitlist_entries')
        .set({ enrolment_id: entryId })
        .where('id', '=', entryId)
        .execute(),
    );
    return this.checkout(userId, entryId, body.method, idemKey, lang);
  }

  /** DELETE /v1/waitlist/{id}: leave the line; an open offer goes to the next family. */
  async leaveWaitlist(userId: string, entryId: string) {
    const w = await this.db.asUser(userId, async (tx) => {
      const w = await tx
        .selectFrom('market.waitlist_entries')
        .select(['id', 'group_id', 'centre_id', 'status', 'offered_sessions'])
        .where('id', '=', entryId)
        .executeTakeFirst();
      if (!w) throw notFound('waitlist entry');
      if (['waiting', 'offered'].includes(w.status))
        await tx
          .updateTable('market.waitlist_entries')
          .set({ status: 'left' })
          .where('id', '=', entryId)
          .execute();
      return w;
    });
    if (w.status === 'offered') {
      await this.seats.release(
        { groupId: w.group_id, centreId: w.centre_id },
        w.id,
        w.offered_sessions ?? [],
      );
      await this.offerNext(w.group_id);
    }
  }

  /** Guardians' view of whether a context is a parent (used by controllers). */
  static isParent(ctx: RlsContext) {
    return !!ctx.guardianId;
  }
}

export { LIVE };
