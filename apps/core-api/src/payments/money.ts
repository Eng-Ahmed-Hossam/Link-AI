import { sql } from 'kysely';
import type { PaymentProvider, ProviderEvent } from '../adapters/payments';
import type { Config } from '../config';
import {
  type EnrolmentRow,
  type Method,
  METHODS,
  loadEnrolment,
  seatSessions,
} from '../enrolment/coverage';
import type { Seats } from '../enrolment/seats';
import { ACCOUNT, balance, post, reverse } from '../ledger/ledger';
import {
  fee,
  p1Capture,
  p2Release,
  p5Settlement,
  p7RefundApproved,
  p7RefundConfirmed,
  refundSplit,
} from '../ledger/postings';
import { feeRule } from '../ledger/rules';
import { writeAudit } from '../platform/audit';
import type { Database, Tx } from '../platform/db';
import { isUuid, uuidv7 } from '../platform/ids';
import type { Logger } from '../platform/logger';
import { enqueue } from '../platform/outbox';
import { Problem, notFound, pgConstraint } from '../platform/problem';
import { addDays, cairoToday } from '../platform/time';

/** Work that must happen only after the database transaction committed (Redis, provider calls). */
export class Effects {
  private readonly list: (() => Promise<unknown>)[] = [];
  add(f: () => Promise<unknown>) {
    this.list.push(f);
  }
  async run(log: Logger) {
    for (const f of this.list.splice(0)) {
      try {
        await f();
      } catch (err) {
        log.error({ err }, 'after-commit step failed (a job retries it)');
      }
    }
  }
}

type RefundPolicy =
  | 'before_first_session'
  | 'dispute'
  | 'teacher_declined'
  | 'group_cancelled'
  | 'late_payment_no_seat';

const PAID = ['succeeded', 'refunded', 'partially_refunded', 'charged_back'];

/**
 * Payments and the money they move (docs/08 §2, §4, §5): checkout through the PaymentProvider,
 * signed webhooks deduplicated on the provider's event ID, the captures, refunds, releases and
 * settlements, each one balanced ledger transaction under its own idempotency key. Status changes
 * only from a verified webhook (BR-MNY-12), never from a browser redirect.
 */
export class Money {
  constructor(
    private readonly db: Database,
    private readonly seats: Seats,
    private readonly provider: PaymentProvider,
    private readonly config: Config,
    private readonly log: Logger,
  ) {}

  get providerName() {
    return this.provider.name;
  }

  // ── Checkout (MKT-ENR-03/04/05/12) ─────────────────────────────────────────────
  /**
   * Start a payment attempt for a held seat: the provider's hosted page (card, wallet), or a Fawry
   * reference that keeps the seat for 24 hours (OD-09). Link never sees card data (BR-MNY-06).
   * A failed attempt can be retried while the hold lives: each attempt is a new payment row.
   */
  async checkout(
    userId: string,
    e: EnrolmentRow,
    method: Method,
    idemKey: string,
    lang: 'ar' | 'en',
  ): Promise<
    | { kind: 'redirect'; checkoutUrl: string }
    | { kind: 'fawry'; fawryReference: string; expiresAt: string }
  > {
    if (e.status !== 'pending_payment' || !e.hold_expires_at || e.hold_expires_at <= new Date())
      throw new Problem(409, 'hold_expired', 'The seat hold has ended. Start again.');
    if (!METHODS[e.payment_plan].includes(method))
      throw new Problem(422, 'method_not_allowed', 'Monthly plans can only be paid by card.');
    const paymentId = uuidv7();
    const amount = Number(e.price_pt);
    // The row first (status `created`), so a webhook can always find what it pays.
    await this.db.asSystem((sys) =>
      sys
        .insertInto('ledger.payments')
        .values({
          id: paymentId,
          kind: 'enrolment',
          enrolment_id: e.id,
          payer_user_id: userId,
          payee_type: 'teacher',
          payee_id: e.teacher_id,
          centre_id: e.centre_id,
          amount_pt: String(amount),
          method,
          provider: this.provider.name,
          period_start: e.current_period_start,
          period_end: e.current_period_end,
          idempotency_key: `checkout:${e.id}:${idemKey}`,
        })
        .execute(),
    );
    if (method === 'fawry') {
      const expiresAt = new Date(Date.now() + this.config.FAWRY_HOLD_SECONDS * 1000);
      const ref = await this.provider.createFawryReference({
        orderRef: paymentId,
        amountPt: amount,
        expiresAt,
      });
      const sessions = await this.db.asSystem((sys) => seatSessions(sys, e));
      const extended = await this.seats.extend(
        { groupId: e.group_id, centreId: e.centre_id },
        e.id,
        sessions.map((s) => s.id),
        ref.expiresAt,
      );
      if (!extended) {
        await this.provider.expire(ref.reference, 'fawry').catch(() => {});
        throw new Problem(409, 'hold_expired', 'The seat hold has ended. Start again.');
      }
      await this.db.asSystem(async (sys) => {
        await sys
          .updateTable('ledger.payments')
          .set({
            status: 'pending',
            provider_ref: ref.reference,
            fawry_reference: ref.reference,
            expires_at: ref.expiresAt,
          })
          .where('id', '=', paymentId)
          .execute();
        await sys
          .updateTable('market.enrolments')
          .set({ hold_expires_at: ref.expiresAt, method: 'fawry' })
          .where('id', '=', e.id)
          .where('status', '=', 'pending_payment')
          .execute();
      });
      return {
        kind: 'fawry',
        fawryReference: ref.reference,
        expiresAt: ref.expiresAt.toISOString(),
      };
    }
    const site = this.config.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
    const c = await this.provider.createCheckout({
      orderRef: paymentId,
      amountPt: amount,
      method,
      returnUrl: `${site}/${lang}/reserve/${e.id}/done`,
      saveCard: e.payment_plan === 'monthly_recurring',
    });
    await this.db.asSystem(async (sys) => {
      await sys
        .updateTable('ledger.payments')
        .set({
          status: 'pending',
          provider_ref: c.providerRef,
          checkout_url: c.url,
          expires_at: e.hold_expires_at,
        })
        .where('id', '=', paymentId)
        .execute();
      await sys.updateTable('market.enrolments').set({ method }).where('id', '=', e.id).execute();
    });
    return { kind: 'redirect', checkoutUrl: c.url };
  }

  // ── Webhooks (07 §2 "Webhooks", BR-MNY-12) ──────────────────────────────────────
  /**
   * Verify the signature first (401 and nothing changes when it is wrong), then store the event
   * once per provider event ID and apply it in the same transaction. A duplicate is answered 200
   * and changes nothing.
   */
  async webhook(
    providerName: string,
    headers: Record<string, string | string[] | undefined>,
    raw: Buffer | undefined,
  ): Promise<{ received: true; outcome: string }> {
    // The local fake is addressed as `fake-pay` (docs/14 §2); its provider value is `fake`.
    if ((providerName === 'fake-pay' ? 'fake' : providerName) !== this.provider.name)
      throw notFound('provider');
    if (!raw || !this.provider.verifyWebhook(headers, raw)) {
      this.log.warn(
        { provider: providerName, bytes: raw?.length ?? 0 },
        'payment webhook refused: bad signature',
      );
      throw new Problem(401, 'invalid_signature', 'The webhook signature is not valid.');
    }
    const ev = this.provider.parseWebhook(raw);
    const effects = new Effects();
    const outcome = await this.db.asSystem(async (sys) => {
      const stored = await sys
        .insertInto('ledger.provider_events')
        .values({
          id: uuidv7(),
          provider: this.provider.name,
          event_id: ev.eventId,
          type: ev.kind === 'unknown' ? ev.type : ev.kind,
          payload: raw.toString('utf8'),
          signature_valid: true,
        })
        .onConflict((oc) => oc.columns(['provider', 'event_id']).doNothing())
        .returning('id')
        .executeTakeFirst();
      if (!stored) return 'duplicate';
      const result = await this.apply(sys, ev, effects);
      await sys
        .updateTable('ledger.provider_events')
        .set({ processed_at: new Date(), outcome: result })
        .where('id', '=', stored.id)
        .execute();
      return result;
    });
    await effects.run(this.log);
    this.log.info(
      { provider: providerName, eventId: ev.eventId, kind: ev.kind, outcome },
      'payment webhook',
    );
    return { received: true, outcome };
  }

  private async findPayment(sys: Tx, orderRef: string, providerRef: string) {
    const q = sys.selectFrom('ledger.payments').selectAll().forUpdate();
    const byId = isUuid(orderRef)
      ? await q.where('id', '=', orderRef).executeTakeFirst()
      : undefined;
    return (
      byId ??
      (await q
        .where('provider', '=', this.provider.name)
        .where('provider_ref', '=', providerRef)
        .executeTakeFirst())
    );
  }

  async apply(sys: Tx, ev: ProviderEvent, effects: Effects): Promise<string> {
    switch (ev.kind) {
      case 'payment.succeeded': {
        const p = await this.findPayment(sys, ev.orderRef, ev.providerRef);
        if (!p) return this.issue(sys, 'orphan_payment', ev.providerRef);
        if (PAID.includes(p.status)) return 'already_captured';
        if (Number(p.amount_pt) !== ev.amountPt)
          return this.issue(sys, 'amount_mismatch', ev.providerRef);
        return this.capture(sys, p, ev, effects);
      }
      case 'payment.failed': {
        const p = await this.findPayment(sys, ev.orderRef, ev.providerRef);
        if (!p) return 'unknown_payment';
        // Never backwards: a late "failed" after a success changes nothing.
        if (!['created', 'pending'].includes(p.status)) return `ignored_${p.status}`;
        await sys
          .updateTable('ledger.payments')
          .set({
            status: 'failed',
            failure_reason: ev.reason,
            provider_ref: p.provider_ref ?? ev.providerRef,
          })
          .where('id', '=', p.id)
          .execute();
        await enqueue(sys, {
          type: 'payment.failed',
          aggregateType: 'payment',
          aggregateId: p.id,
          centreId: p.centre_id,
          data: { paymentId: p.id, enrolmentId: p.enrolment_id, kind: p.kind },
        });
        return 'failed';
      }
      case 'payment.expired': {
        const p = await this.findPayment(sys, ev.orderRef, ev.providerRef);
        if (!p) return 'unknown_payment';
        if (!['created', 'pending'].includes(p.status)) return `ignored_${p.status}`;
        await sys
          .updateTable('ledger.payments')
          .set({ status: 'expired' })
          .where('id', '=', p.id)
          .execute();
        return 'expired';
      }
      case 'refund.succeeded':
      case 'refund.failed':
        return this.refundResult(sys, ev, effects);
      default:
        return 'ignored_unknown_type';
    }
  }

  private async issue(sys: Tx, kind: 'orphan_payment' | 'amount_mismatch', providerRef: string) {
    await sys
      .insertInto('ledger.reconciliation_issues')
      .values({
        id: uuidv7(),
        provider: this.provider.name,
        kind,
        resolution: `provider_ref ${providerRef}`,
      })
      .execute();
    this.log.warn({ kind, providerRef }, 'payment needs ops (reconciliation issue opened)');
    return kind;
  }

  // ── P1 capture, then the seat (08 §4) ───────────────────────────────────────────
  private async capture(
    sys: Tx,
    p: {
      id: string;
      kind: string;
      enrolment_id: string | null;
      amount_pt: string;
      centre_id: string | null;
      payee_id: string | null;
    },
    ev: Extract<ProviderEvent, { kind: 'payment.succeeded' }>,
    effects: Effects,
  ): Promise<string> {
    const amount = Number(p.amount_pt);
    const e = await loadEnrolment(sys, p.enrolment_id!, true);
    if (!e) return this.issue(sys, 'orphan_payment', ev.providerRef);
    // The commission rule in force today, snapshotted on the payment (BR-MNY-03, BR-MNY-11).
    const rule = await feeRule(sys, 'booking_commission', { teacherId: e.teacher_id });
    const commission = fee(amount, rule.ratePct, rule.minPt);
    await sys
      .updateTable('ledger.payments')
      .set({
        status: 'succeeded',
        succeeded_at: new Date(),
        commission_pt: String(commission),
        commission_rule_id: rule.id,
        commission_rate_pct: rule.ratePct,
        card_last4: ev.cardLast4,
        method: ev.method,
        provider_ref: ev.providerRef,
      })
      .where('id', '=', p.id)
      .execute();
    await post(sys, {
      kind: 'payment_captured',
      key: `capture:${this.provider.name}:${ev.providerRef}`,
      description: `${p.kind === 'enrolment_renewal' ? 'Renewal' : 'Reservation'} paid (${e.reference})`,
      lines: p1Capture({
        provider: this.provider.name,
        teacherId: e.teacher_id,
        amount,
        commission,
      }),
      paymentId: p.id,
      centreId: e.centre_id,
      teacherId: e.teacher_id,
    });
    await enqueue(sys, {
      type: 'payment.succeeded',
      aggregateType: 'payment',
      aggregateId: p.id,
      centreId: e.centre_id,
      data: { paymentId: p.id, enrolmentId: e.id, amountPt: amount, commissionPt: commission },
    });
    if (ev.mandate && e.payment_plan === 'monthly_recurring')
      await sys
        .insertInto('ledger.payment_mandates')
        .values({
          id: uuidv7(),
          guardian_id: e.guardian_id,
          enrolment_id: e.id,
          provider: this.provider.name,
          provider_token_ref: ev.mandate.tokenRef,
          card_brand: ev.mandate.brand,
          card_last4: ev.mandate.last4,
          card_exp_month: ev.mandate.expMonth,
          card_exp_year: ev.mandate.expYear,
        })
        .onConflict((oc) => oc.column('enrolment_id').doNothing())
        .execute();
    if (p.kind === 'enrolment_renewal') return this.renewed(sys, e, p.id, effects);
    if (e.status === 'pending_payment' && e.hold_expires_at && e.hold_expires_at > new Date()) {
      await this.confirmPaid(sys, e, effects, e.id);
      return 'confirmed';
    }
    return this.lateMoney(sys, e, p.id, effects);
  }

  /** Paid while the seat is held: confirmed, or waiting for the teacher (BR-ENR-04, OD-08). */
  private async confirmPaid(sys: Tx, e: EnrolmentRow, effects: Effects, holdId: string) {
    const next = e.teacher_reviews ? 'awaiting_teacher' : 'confirmed';
    await sys
      .updateTable('market.enrolments')
      .set({ status: next, status_changed_at: new Date() })
      .where('id', '=', e.id)
      .execute();
    await enqueue(sys, {
      type: `enrolment.${next}`,
      aggregateType: 'enrolment',
      aggregateId: e.id,
      centreId: e.centre_id,
      data: { enrolmentId: e.id, groupId: e.group_id },
    });
    await writeAudit(sys, {
      actorId: null,
      actorType: 'provider',
      centreId: e.centre_id,
      action: `enrolment.${next}`,
      objectType: 'enrolment',
      objectRef: e.id,
      before: { status: e.status },
      after: { status: next },
    });
    const sessions = (await seatSessions(sys, e)).map((s) => s.id);
    effects.add(() =>
      this.seats.commit({ groupId: e.group_id, centreId: e.centre_id }, holdId, sessions),
    );
  }

  /**
   * BR-ENR-06 (OD-09): money for an enrolment whose hold ran out. The seat is the parent's if one
   * is still free in EVERY covered session and the child has no other live enrolment in the group;
   * otherwise a full automatic refund (P10) and the enrolment stays `expired`.
   */
  private async lateMoney(
    sys: Tx,
    e: EnrolmentRow,
    paymentId: string,
    effects: Effects,
  ): Promise<string> {
    if (e.status === 'pending_payment') {
      await this.expire(sys, e, effects, { callProvider: false });
      e = { ...e, status: 'expired' };
    }
    if (e.status === 'expired') {
      const g = await sys
        .selectFrom('market.groups')
        .select(['seat_cap', 'status'])
        .where('id', '=', e.group_id)
        .executeTakeFirstOrThrow();
      const sessions = (await seatSessions(sys, { ...e, status: 'confirmed' })).map((s) => s.id);
      const holdId = `late:${paymentId}`;
      const live = g.status === 'published' && sessions.length > 0;
      const held = live
        ? await this.seats.acquire(
            { groupId: e.group_id, centreId: e.centre_id, seatCap: g.seat_cap },
            holdId,
            sessions,
            60_000,
          )
        : { ok: false as const, fullSessionId: '' };
      if (held.ok) {
        await sql`SAVEPOINT late_money`.execute(sys);
        try {
          await this.confirmPaid(sys, { ...e, status: 'expired' }, effects, holdId);
          await sql`RELEASE SAVEPOINT late_money`.execute(sys);
          return 'confirmed_late';
        } catch (err) {
          await sql`ROLLBACK TO SAVEPOINT late_money`.execute(sys);
          const c = pgConstraint(err);
          if (c !== 'seat_cap_exceeded' && c !== 'enrolments_one_live') throw err;
          effects.add(() =>
            this.seats.release({ groupId: e.group_id, centreId: e.centre_id }, holdId, sessions),
          );
        }
      }
    }
    await this.autoRefund(
      sys,
      paymentId,
      'late_payment_no_seat',
      effects,
      'Payment arrived after the seat was gone',
    );
    return 'refunded_no_seat';
  }

  /** A renewal was paid (08 §5): the next period starts; a past-due plan is live again. */
  private async renewed(
    sys: Tx,
    e: EnrolmentRow,
    paymentId: string,
    effects: Effects,
  ): Promise<string> {
    if (!['confirmed', 'past_due'].includes(e.status)) {
      await this.autoRefund(
        sys,
        paymentId,
        'late_payment_no_seat',
        effects,
        'Renewal paid after the plan ended',
      );
      return 'refunded_plan_ended';
    }
    const before = await seatSessions(sys, e);
    const start = e.current_period_end!;
    const end = (
      await sql<{
        d: string;
      }>`SELECT ((${start}::date + interval '1 month')::date)::text AS d`.execute(sys)
    ).rows[0]!.d;
    await sys
      .updateTable('market.enrolments')
      .set({
        current_period_start: start,
        current_period_end: end,
        status: 'confirmed',
        status_changed_at: new Date(),
      })
      .where('id', '=', e.id)
      .execute();
    await sys
      .updateTable('ledger.payments')
      .set({ period_start: start, period_end: end })
      .where('id', '=', paymentId)
      .execute();
    const after = await seatSessions(sys, {
      ...e,
      current_period_start: start,
      current_period_end: end,
      status: 'confirmed',
    });
    const added = after.filter((s) => !before.some((b) => b.id === s.id)).map((s) => s.id);
    effects.add(() =>
      this.seats.commit(
        { groupId: e.group_id, centreId: e.centre_id },
        `renew:${paymentId}`,
        added,
      ),
    );
    await enqueue(sys, {
      type: 'enrolment.renewed',
      aggregateType: 'enrolment',
      aggregateId: e.id,
      centreId: e.centre_id,
      data: { enrolmentId: e.id, paymentId, periodStart: start },
    });
    return e.status === 'past_due' ? 'renewed_from_past_due' : 'renewed';
  }

  /** `pending_payment → expired` (the hold ran out unpaid): the seat goes back (BR-ENR-05). */
  async expire(sys: Tx, e: EnrolmentRow, effects: Effects, o: { callProvider: boolean }) {
    const done = await sys
      .updateTable('market.enrolments')
      .set({ status: 'expired', status_changed_at: new Date() })
      .where('id', '=', e.id)
      .where('status', '=', 'pending_payment')
      .returning('id')
      .executeTakeFirst();
    if (!done) return false;
    await enqueue(sys, {
      type: 'enrolment.expired',
      aggregateType: 'enrolment',
      aggregateId: e.id,
      centreId: e.centre_id,
      data: { enrolmentId: e.id, groupId: e.group_id },
    });
    const sessions = (await seatSessions(sys, e)).map((s) => s.id);
    effects.add(() =>
      this.seats.release({ groupId: e.group_id, centreId: e.centre_id }, e.id, sessions),
    );
    if (o.callProvider) {
      const open = await sys
        .selectFrom('ledger.payments')
        .select(['provider_ref', 'method'])
        .where('enrolment_id', '=', e.id)
        .where('status', 'in', ['created', 'pending'])
        .execute();
      for (const p of open)
        if (p.provider_ref)
          effects.add(() => this.provider.expire(p.provider_ref!, p.method as Method));
    }
    return true;
  }

  // ── Refunds (P7, P8, P10) ────────────────────────────────────────────────────────
  /**
   * A refund Link starts itself (late money with no seat, a teacher declining): approved at once,
   * no ops approval (BR-REF-07, OD-42). The commission is reversed on the refunded part (BR-FEE-05)
   * and the teacher's share comes back from pending, or from available after release (P7/P8).
   * The provider is called after commit; the refund sweeper retries if that call fails.
   */
  async autoRefund(
    sys: Tx,
    paymentId: string,
    policy: RefundPolicy,
    effects: Effects,
    reason: string,
  ) {
    const refundId = await this.approveRefund(sys, paymentId, policy, null, reason, true);
    if (refundId) effects.add(() => this.sendRefund(refundId));
    return refundId;
  }

  /** Create (or find) the refund for a payment and post its approval. Returns its id. */
  async approveRefund(
    sys: Tx,
    paymentId: string,
    policy: RefundPolicy,
    approvedBy: string | null,
    reason: string,
    auto: boolean,
    existingRefundId?: string,
  ): Promise<string | null> {
    const p = await sys
      .selectFrom('ledger.payments')
      .selectAll()
      .where('id', '=', paymentId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const prior = await sys
      .selectFrom('ledger.refunds')
      .select(['amount_pt', 'status'])
      .where('payment_id', '=', p.id)
      .where('status', 'not in', ['rejected', 'failed', 'requested'])
      .execute();
    const already = prior.reduce((a, r) => a + Number(r.amount_pt), 0);
    const amount = Number(p.amount_pt) - already;
    if (amount <= 0) return null;
    const split = refundSplit({
      paid: Number(p.amount_pt),
      commission: Number(p.commission_pt ?? 0),
      ratePct: String(p.commission_rate_pct ?? '0'),
      alreadyRefunded: already,
      refund: amount,
    });
    let refundId = existingRefundId;
    if (refundId)
      await sys
        .updateTable('ledger.refunds')
        .set({
          status: 'approved',
          amount_pt: String(amount),
          commission_reversed_pt: String(split.commissionReversed),
          approved_by: approvedBy,
          approved_at: new Date(),
        })
        .where('id', '=', refundId)
        .execute();
    else {
      refundId = uuidv7();
      const ins = await sys
        .insertInto('ledger.refunds')
        .values({
          id: refundId,
          payment_id: p.id,
          amount_pt: String(amount),
          commission_reversed_pt: String(split.commissionReversed),
          policy,
          status: 'approved',
          auto_eligible: auto,
          enrolment_id: p.enrolment_id,
          reason,
          approved_by: approvedBy,
          approved_at: new Date(),
          idempotency_key: `refund:${p.id}:${policy}`,
        })
        .onConflict((oc) => oc.column('idempotency_key').doNothing())
        .returning('id')
        .executeTakeFirst();
      if (!ins) return null;
    }
    const teacherId = p.payee_id!;
    await post(sys, {
      kind: 'refund',
      key: `refund:${refundId}`,
      description: `Refund approved (${policy})`,
      lines: p7RefundApproved({
        provider: p.provider,
        teacherId,
        refund: amount,
        commissionReversed: split.commissionReversed,
        released: !!p.released_at,
      }),
      paymentId: p.id,
      refundId,
      centreId: p.centre_id,
      teacherId,
    });
    await enqueue(sys, {
      type: 'refund.approved',
      aggregateType: 'refund',
      aggregateId: refundId,
      centreId: p.centre_id,
      data: { refundId, paymentId: p.id, enrolmentId: p.enrolment_id, amountPt: amount, policy },
    });
    await writeAudit(sys, {
      actorId: approvedBy,
      actorType: approvedBy ? 'user' : 'system',
      centreId: p.centre_id,
      action: 'refund.approved',
      objectType: 'refund',
      objectRef: refundId,
      after: { policy, amountPt: amount, auto },
      reason,
    });
    return refundId;
  }

  /** Ask the provider to send an approved refund (idempotent on the refund's key). */
  async sendRefund(refundId: string) {
    const r = await this.db.asSystem((sys) =>
      sys
        .selectFrom('ledger.refunds as r')
        .innerJoin('ledger.payments as p', 'p.id', 'r.payment_id')
        .select(['r.id', 'r.status', 'r.amount_pt', 'r.idempotency_key', 'p.provider_ref'])
        .where('r.id', '=', refundId)
        .executeTakeFirst(),
    );
    if (!r || r.status !== 'approved' || !r.provider_ref) return;
    const out = await this.provider.refund(r.provider_ref, Number(r.amount_pt), r.idempotency_key);
    await this.db.asSystem((sys) =>
      sys
        .updateTable('ledger.refunds')
        .set({ status: 'processing', provider_ref: out.refundRef })
        .where('id', '=', refundId)
        .where('status', '=', 'approved')
        .execute(),
    );
  }

  /** Job: approved refunds the provider has not taken yet (a call failed after commit). */
  async sendPendingRefunds() {
    const ids = await this.db.asSystem((sys) =>
      sys
        .selectFrom('ledger.refunds')
        .select('id')
        .where('status', '=', 'approved')
        .where('approved_at', '<', new Date(Date.now() - 30_000))
        .execute(),
    );
    for (const { id } of ids) await this.sendRefund(id);
    return ids.length;
  }

  private async refundResult(
    sys: Tx,
    ev: Extract<ProviderEvent, { kind: 'refund.succeeded' | 'refund.failed' }>,
    effects: Effects,
  ): Promise<string> {
    const r = await sys
      .selectFrom('ledger.refunds as r')
      .innerJoin('ledger.payments as p', 'p.id', 'r.payment_id')
      .select([
        'r.id',
        'r.status',
        'r.amount_pt',
        'r.payment_id',
        'p.provider',
        'p.amount_pt as paid',
        'p.centre_id',
        'p.enrolment_id',
      ])
      .where((w) =>
        w.or([w('r.provider_ref', '=', ev.refundRef), w('r.idempotency_key', '=', ev.refundRef)]),
      )
      .forUpdate()
      .executeTakeFirst();
    if (!r) return 'unknown_refund';
    if (!['approved', 'processing'].includes(r.status)) return `ignored_${r.status}`;
    void effects;
    if (ev.kind === 'refund.succeeded') {
      await sys
        .updateTable('ledger.refunds')
        .set({ status: 'succeeded', provider_ref: ev.refundRef })
        .where('id', '=', r.id)
        .execute();
      await post(sys, {
        kind: 'refund_confirmed',
        key: `refund-confirmed:${r.id}`,
        description: 'Refund confirmed by the provider',
        lines: p7RefundConfirmed({ provider: r.provider, refund: Number(r.amount_pt) }),
        paymentId: r.payment_id,
        refundId: r.id,
        centreId: r.centre_id,
      });
      const refunded = await sys
        .selectFrom('ledger.refunds')
        .select(sql<string>`coalesce(sum(amount_pt), 0)`.as('n'))
        .where('payment_id', '=', r.payment_id)
        .where('status', '=', 'succeeded')
        .executeTakeFirstOrThrow();
      await sys
        .updateTable('ledger.payments')
        .set({ status: Number(refunded.n) >= Number(r.paid) ? 'refunded' : 'partially_refunded' })
        .where('id', '=', r.payment_id)
        .execute();
      await enqueue(sys, {
        type: 'refund.succeeded',
        aggregateType: 'refund',
        aggregateId: r.id,
        centreId: r.centre_id,
        data: { refundId: r.id, paymentId: r.payment_id, enrolmentId: r.enrolment_id },
      });
      return 'refund_succeeded';
    }
    // The provider could not refund: the approval is reversed, the money is where it was (P7).
    await sys
      .updateTable('ledger.refunds')
      .set({ status: 'failed' })
      .where('id', '=', r.id)
      .execute();
    await reverse(sys, `refund:${r.id}`, {
      kind: 'refund_failed',
      key: `refund-failed:${r.id}`,
      description: 'Refund failed at the provider: approval reversed',
      paymentId: r.payment_id,
      refundId: r.id,
      centreId: r.centre_id,
    });
    await enqueue(sys, {
      type: 'refund.failed',
      aggregateType: 'refund',
      aggregateId: r.id,
      centreId: r.centre_id,
      data: { refundId: r.id, paymentId: r.payment_id },
    });
    return 'refund_failed';
  }

  // ── P2 release (BR-REF-01, OD-11) ───────────────────────────────────────────────
  /**
   * Job (every 15 minutes): the teacher's money for a confirmed enrolment moves from pending to
   * available once the first session of its paid period has started.
   */
  async releaseDue(now = new Date()) {
    const due = await this.db.asSystem((sys) =>
      sql<{
        id: string;
        teacher_id: string;
        centre_id: string;
        amount_pt: string;
        commission_pt: string;
      }>`
        SELECT p.id, e.teacher_id, e.centre_id, p.amount_pt, p.commission_pt
        FROM ledger.payments p JOIN market.enrolments e ON e.id = p.enrolment_id
        WHERE p.kind IN ('enrolment', 'enrolment_renewal') AND p.status IN ('succeeded', 'partially_refunded')
          AND p.released_at IS NULL AND e.status IN ('confirmed', 'past_due', 'ended')
          AND EXISTS (
            SELECT 1 FROM market.group_sessions s WHERE s.group_id = e.group_id AND s.starts_at <= ${now}
              AND CASE WHEN e.payment_plan = 'per_session' THEN s.id = e.session_id
                       ELSE market.session_day(s.starts_at) >= p.period_start AND market.session_day(s.starts_at) < p.period_end END)`
        .execute(sys)
        .then((r) => r.rows),
    );
    for (const p of due)
      await this.db.asSystem(async (sys) => {
        const refunded = await sys
          .selectFrom('ledger.refunds')
          .select(sql<string>`coalesce(sum(amount_pt - commission_reversed_pt), 0)`.as('n'))
          .where('payment_id', '=', p.id)
          .where('status', 'in', ['approved', 'processing', 'succeeded'])
          .executeTakeFirstOrThrow();
        const amount = Number(p.amount_pt) - Number(p.commission_pt) - Number(refunded.n);
        const marked = await sys
          .updateTable('ledger.payments')
          .set({ released_at: now })
          .where('id', '=', p.id)
          .where('released_at', 'is', null)
          .returning('id')
          .executeTakeFirst();
        if (!marked || amount <= 0) return;
        await post(sys, {
          kind: 'funds_released',
          key: `release:${p.id}`,
          description: 'First session started: funds released',
          lines: p2Release({ teacherId: p.teacher_id, amount }),
          paymentId: p.id,
          centreId: p.centre_id,
          teacherId: p.teacher_id,
          occurredAt: now,
        });
      });
    return due.length;
  }

  // ── P5 settlement (08 §7) ───────────────────────────────────────────────────────
  /**
   * Job (daily, 06:00 Cairo, for the day before): match the provider's settlement lines. A matched
   * payment posts P5 and is marked settled; anything else opens a reconciliation issue for ops.
   */
  async settle(date = addDays(cairoToday(), -1)) {
    const lines = await this.provider.fetchSettlementReport(date);
    let matched = 0;
    for (const l of lines)
      await this.db.asSystem(async (sys) => {
        const lineId = uuidv7();
        if (l.kind === 'refund') {
          const r = await sys
            .selectFrom('ledger.refunds')
            .select('id')
            .where('provider_ref', '=', l.providerRef)
            .executeTakeFirst();
          await sys
            .insertInto('ledger.provider_settlement_lines')
            .values({
              id: lineId,
              provider: this.provider.name,
              settlement_date: date,
              provider_ref: l.providerRef,
              kind: 'refund',
              amount_pt: String(l.amountPt),
              fee_pt: String(l.feePt),
              matched_refund_id: r?.id ?? null,
              match_status: r ? 'matched' : 'unmatched',
              raw: JSON.stringify(l),
            })
            .onConflict((oc) => oc.columns(['provider', 'provider_ref', 'kind']).doNothing())
            .execute();
          return;
        }
        const p = await sys
          .selectFrom('ledger.payments')
          .select(['id', 'amount_pt', 'status', 'centre_id', 'payee_id'])
          .where('provider', '=', this.provider.name)
          .where('provider_ref', '=', l.providerRef)
          .executeTakeFirst();
        const ok = !!p && Number(p.amount_pt) === l.amountPt && PAID.includes(p.status);
        const ins = await sys
          .insertInto('ledger.provider_settlement_lines')
          .values({
            id: lineId,
            provider: this.provider.name,
            settlement_date: date,
            provider_ref: l.providerRef,
            kind: 'payment',
            amount_pt: String(l.amountPt),
            fee_pt: String(l.feePt),
            matched_payment_id: p?.id ?? null,
            match_status: ok ? 'matched' : p ? 'mismatch' : 'unmatched',
            raw: JSON.stringify(l),
          })
          .onConflict((oc) => oc.columns(['provider', 'provider_ref', 'kind']).doNothing())
          .returning('id')
          .executeTakeFirst();
        if (!ins) return;
        if (!ok) {
          await sys
            .insertInto('ledger.reconciliation_issues')
            .values({
              id: uuidv7(),
              provider: this.provider.name,
              line_id: lineId,
              kind: p ? 'amount_mismatch' : 'missing_in_ledger',
            })
            .execute();
          return;
        }
        await post(sys, {
          kind: 'settlement',
          key: `settle:${this.provider.name}:${l.providerRef}`,
          description: `Provider settled ${date}`,
          lines: p5Settlement({
            provider: this.provider.name,
            amount: l.amountPt,
            providerFee: l.feePt,
          }),
          paymentId: p!.id,
          centreId: p!.centre_id,
        });
        await sys
          .updateTable('ledger.payments')
          .set({ settled_at: new Date() })
          .where('id', '=', p!.id)
          .execute();
        matched++;
      });
    return { date, lines: lines.length, matched };
  }

  /** The trial balance and the clearing check (08 §7 step 6). */
  async checks() {
    return this.db.asSystem(async (sys) => ({
      clearing: await balance(sys, ACCOUNT.providerClearing(this.provider.name)),
    }));
  }
}
