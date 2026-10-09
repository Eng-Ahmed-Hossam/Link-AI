import { sql } from 'kysely';
import type { PaymentProvider } from '../adapters/payments';
import { Effects, type Money } from '../payments/money';
import { writeAudit } from '../platform/audit';
import type { Database } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import type { Logger } from '../platform/logger';
import { enqueue } from '../platform/outbox';
import { addDays, cairoToday } from '../platform/time';
import { ENROLMENT_COLUMNS, type EnrolmentRow, loadEnrolment, seatSessions } from './coverage';
import type { Enrolments } from './enrolments';
import type { Seats } from './seats';

/**
 * Scheduled work of the enrolment saga (docs/08 §4–§6). Every job is safe to run twice: each
 * change is guarded by the state it expects, and money moves only through keyed postings.
 */
export class EnrolmentJobs {
  constructor(
    private readonly db: Database,
    private readonly seats: Seats,
    private readonly money: Money,
    private readonly enrolments: Enrolments,
    private readonly provider: PaymentProvider,
    private readonly log: Logger,
  ) {}

  /** Holds that ran out unpaid → `expired`, the seat back, the provider asked to close the attempt. */
  async expireHolds(now = new Date()) {
    const due = await this.db.asSystem((sys) =>
      sys
        .selectFrom('market.enrolments')
        .select('id')
        .where('status', '=', 'pending_payment')
        .where('hold_expires_at', '<=', now)
        .execute(),
    );
    const groups = new Set<string>();
    for (const { id } of due) {
      const effects = new Effects();
      await this.db.asSystem(async (sys) => {
        const e = await loadEnrolment(sys, id, true);
        if (e && (await this.money.expire(sys, e, effects, { callProvider: true })))
          groups.add(e.group_id);
      });
      await effects.run(this.log);
    }
    for (const g of groups) await this.enrolments.offerNext(g);
    return due.length;
  }

  /** Waitlist offers not taken in 24 h → `expired`; the next family is offered the seat. */
  async expireOffers(now = new Date()) {
    const due = await this.db.asSystem((sys) =>
      sys
        .updateTable('market.waitlist_entries')
        .set({ status: 'expired' })
        .where('status', '=', 'offered')
        .where('offer_expires_at', '<=', now)
        .returning(['id', 'group_id', 'centre_id', 'offered_sessions'])
        .execute(),
    );
    for (const w of due) {
      await this.seats.release(
        { groupId: w.group_id, centreId: w.centre_id },
        w.id,
        w.offered_sessions ?? [],
      );
      await this.enrolments.offerNext(w.group_id);
    }
    return due.length;
  }

  /** BR-ENR-11: a paid enrolment the teacher did not answer in 48 hours is confirmed. */
  async autoConfirm(now = new Date()) {
    const rows = await this.db.asSystem(async (sys) => {
      const done = await sys
        .updateTable('market.enrolments')
        .set({ status: 'confirmed', status_changed_at: now })
        .where('status', '=', 'awaiting_teacher')
        .where('status_changed_at', '<=', new Date(now.getTime() - 48 * 3600_000))
        .returning(['id', 'centre_id', 'group_id'])
        .execute();
      for (const e of done)
        await enqueue(sys, {
          type: 'enrolment.confirmed',
          aggregateType: 'enrolment',
          aggregateId: e.id,
          centreId: e.centre_id,
          data: { enrolmentId: e.id, groupId: e.group_id, auto: true },
        });
      return done;
    });
    return rows.length;
  }

  /** BR-RNT-10 (OD-44): a session is `held` at its end time unless it was cancelled. */
  async markHeld(now = new Date()) {
    const rows = await this.db.asSystem((sys) =>
      sys
        .updateTable('market.group_sessions')
        .set({ status: 'held', status_changed_at: now })
        .where('status', '=', 'scheduled')
        .where('ends_at', '<=', now)
        .returning('id')
        .execute(),
    );
    return rows.length;
  }

  /**
   * Plans that are over → `ended` (BR-ENR-13): a per-session plan after its session, a single month
   * after its period, a stopped monthly plan after its paid month.
   */
  async endFinished(now = new Date()) {
    const today = cairoToday(now);
    const rows = await this.db.asSystem(async (sys) => {
      const done = await sql<{ id: string; centre_id: string; group_id: string }>`
        UPDATE market.enrolments e SET status = 'ended', status_changed_at = ${now}
        WHERE e.status = 'confirmed' AND (
          (e.payment_plan = 'per_session' AND EXISTS (SELECT 1 FROM market.group_sessions s WHERE s.id = e.session_id AND s.ends_at <= ${now}))
          OR (e.payment_plan = 'single_month' AND e.current_period_end <= ${today}::date)
          OR (e.payment_plan = 'monthly_recurring' AND e.plan_cancelled_at IS NOT NULL AND e.current_period_end <= ${today}::date))
        RETURNING e.id, e.centre_id, e.group_id`.execute(sys);
      for (const e of done.rows)
        await enqueue(sys, {
          type: 'enrolment.ended',
          aggregateType: 'enrolment',
          aggregateId: e.id,
          centreId: e.centre_id,
          data: { enrolmentId: e.id, groupId: e.group_id },
        });
      return done.rows;
    });
    return rows.length;
  }

  /**
   * 08 §5: monthly renewals, on the renewal day at 08:00 Cairo. A failed charge is retried after
   * 1 day and after 3 days (BR-PMT-06); a plan still unpaid when the new period's first session
   * starts becomes `past_due`, keeps its seat for 7 days (OD-17), then `ended`.
   */
  async renew(now = new Date()) {
    const today = cairoToday(now);
    const due = await this.db.asSystem(
      async (sys) =>
        (await sys
          .selectFrom('market.enrolments as e')
          .innerJoin('ledger.payment_mandates as m', 'm.enrolment_id', 'e.id')
          .select([...ENROLMENT_COLUMNS, 'm.provider_token_ref'])
          .where('e.payment_plan', '=', 'monthly_recurring')
          .where('e.status', 'in', ['confirmed', 'past_due'])
          .where('e.plan_cancelled_at', 'is', null)
          .where('m.status', '=', 'active')
          .where(sql<boolean>`e.current_period_end <= ${today}::date`)
          .execute()) as (EnrolmentRow & { provider_token_ref: string })[],
    );
    let charged = 0;
    for (const e of due) {
      const periodStart = e.current_period_end!;
      const attempts = await this.db.asSystem((sys) =>
        sys
          .selectFrom('ledger.payments')
          .select(['status', 'created_at'])
          .where('enrolment_id', '=', e.id)
          .where('kind', '=', 'enrolment_renewal')
          .where(sql<boolean>`period_start = ${periodStart}::date`)
          .execute(),
      );
      if (attempts.some((a) => ['created', 'pending', 'succeeded'].includes(a.status))) continue;
      const failed = attempts.length;
      // Attempt 1 on the renewal day, attempt 2 a day later, attempt 3 three days later.
      const dueOn = [periodStart, addDays(periodStart, 1), addDays(periodStart, 3)][failed];
      if (!dueOn || today < dueOn) continue;
      const paymentId = uuidv7();
      await this.db.asSystem((sys) =>
        sys
          .insertInto('ledger.payments')
          .values({
            id: paymentId,
            kind: 'enrolment_renewal',
            enrolment_id: e.id,
            payee_type: 'teacher',
            payee_id: e.teacher_id,
            centre_id: e.centre_id,
            amount_pt: e.price_pt,
            method: 'card',
            provider: this.provider.name,
            period_start: periodStart,
            idempotency_key: `renew:${e.id}:${periodStart}#${failed + 1}`,
            status: 'pending',
          })
          .execute(),
      );
      try {
        const r = await this.provider.chargeMandate(e.provider_token_ref, {
          orderRef: paymentId,
          amountPt: Number(e.price_pt),
          idemKey: `renew:${e.id}:${periodStart}#${failed + 1}`,
        });
        await this.db.asSystem((sys) =>
          sys
            .updateTable('ledger.payments')
            .set({ provider_ref: r.providerRef })
            .where('id', '=', paymentId)
            .where('provider_ref', 'is', null)
            .execute(),
        );
        charged++;
      } catch (err) {
        this.log.warn(
          { err, enrolmentId: e.id },
          'renewal charge not accepted; retried on schedule',
        );
        await this.db.asSystem((sys) =>
          sys
            .updateTable('ledger.payments')
            .set({ status: 'failed', failure_reason: 'provider_unavailable' })
            .where('id', '=', paymentId)
            .execute(),
        );
      }
    }
    return charged;
  }

  /** Unpaid at the new period's first session → `past_due`; 7 days later → `ended`, seat released. */
  async pastDue(now = new Date()) {
    const late = await this.db.asSystem((sys) =>
      sql<{ id: string; centre_id: string; group_id: string }>`
        UPDATE market.enrolments e SET status = 'past_due', status_changed_at = ${now}
        WHERE e.status = 'confirmed' AND e.payment_plan = 'monthly_recurring' AND e.plan_cancelled_at IS NULL
          AND EXISTS (SELECT 1 FROM market.group_sessions s WHERE s.group_id = e.group_id
                      AND market.session_day(s.starts_at) >= e.current_period_end AND s.starts_at <= ${now})
        RETURNING e.id, e.centre_id, e.group_id`
        .execute(sys)
        .then(async (r) => {
          for (const e of r.rows)
            await enqueue(sys, {
              type: 'enrolment.past_due',
              aggregateType: 'enrolment',
              aggregateId: e.id,
              centreId: e.centre_id,
              data: { enrolmentId: e.id },
            });
          return r.rows;
        }),
    );
    const over = await this.db.asSystem((sys) =>
      sys
        .selectFrom('market.enrolments')
        .select('id')
        .where('status', '=', 'past_due')
        .where('status_changed_at', '<=', new Date(now.getTime() - 7 * 86_400_000))
        .execute(),
    );
    for (const { id } of over) {
      const effects = new Effects();
      const e = await this.db.asSystem(async (sys) => {
        const e = await loadEnrolment(sys, id, true);
        if (!e || e.status !== 'past_due') return null;
        // Every session the seat covered leaves the committed count, as it does in the database.
        const kept = (await seatSessions(sys, e)).map((s) => s.id);
        await sys
          .updateTable('market.enrolments')
          .set({ status: 'ended', status_changed_at: now })
          .where('id', '=', e.id)
          .execute();
        await enqueue(sys, {
          type: 'enrolment.ended',
          aggregateType: 'enrolment',
          aggregateId: e.id,
          centreId: e.centre_id,
          data: { enrolmentId: e.id, reason: 'renewal_unpaid' },
        });
        await writeAudit(sys, {
          actorId: null,
          actorType: 'system',
          centreId: e.centre_id,
          action: 'enrolment.ended',
          objectType: 'enrolment',
          objectRef: e.id,
          before: { status: 'past_due' },
          after: { status: 'ended' },
          reason: 'Renewal unpaid for 7 days (BR-PMT-06, OD-17)',
        });
        effects.add(() =>
          this.seats.uncommit({ groupId: e.group_id, centreId: e.centre_id }, kept),
        );
        return e;
      });
      await effects.run(this.log);
      if (e) await this.enrolments.offerNext(e.group_id);
    }
    return { pastDue: late.length, ended: over.length };
  }

  /**
   * 08 §4 "Nightly rebuild" (03:00 Cairo): every future session's committed count is recomputed
   * from the database; any difference means a counter drifted, so it is logged as an alert.
   */
  async rebuildSeats() {
    const groups = await this.db.asSystem((sys) =>
      sys
        .selectFrom('market.group_sessions as s')
        .innerJoin('market.groups as g', 'g.id', 's.group_id')
        .select(['g.id', 'g.centre_id', sql<string[]>`array_agg(s.id)`.as('sessions')])
        .where('s.starts_at', '>', new Date())
        .groupBy(['g.id', 'g.centre_id'])
        .execute(),
    );
    let drifted = 0;
    for (const g of groups) {
      const drift = await this.seats.rebuild(
        { groupId: g.id, centreId: g.centre_id },
        g.sessions,
        true,
      );
      if (drift.size) {
        drifted += drift.size;
        this.log.error(
          { groupId: g.id, drift: Object.fromEntries(drift) },
          'ALERT: seat counters drifted and were corrected',
        );
      }
    }
    return { groups: groups.length, drifted };
  }

  /** Recheck one enrolment's committed seats in Redis (dev tools). */
  async seatsOf(id: string) {
    return this.db.asSystem(async (sys) => {
      const e = await loadEnrolment(sys, id);
      return e ? (await seatSessions(sys, e)).map((s) => s.id) : [];
    });
  }
}
