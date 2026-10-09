import { sql } from 'kysely';
import { writeAudit } from '../platform/audit';
import type { Database } from '../platform/db';
import { isUuid } from '../platform/ids';
import { enqueue } from '../platform/outbox';
import { Problem } from '../platform/problem';
import type { Money } from '../payments/money';

/**
 * LOCAL stand-in for Link ops deciding parent refund requests (OD-42, diagram 06; the ops console
 * comes later). Used by `pnpm ops:refunds`, which refuses to run unless APP_ENV=local, and never
 * part of the public demo or the pilot builds. Approving posts the reversing entries (P7 before
 * release, P8 after) and asks the provider to send the money; denying posts nothing, because a
 * request posts nothing until it is approved. Both write an audit row in the same transaction.
 */
const HOW = 'Local ops tool: pnpm ops:refunds (stands in for the ops console)';

export async function refundRequests(db: Database) {
  return db.asSystem(async (sys) => {
    const { rows } = await sql<{
      id: string;
      amount_pt: string;
      policy: string;
      auto_eligible: boolean;
      reason: string | null;
      enrolment_id: string | null;
      centre: string | null;
      created_at: Date;
    }>`
      SELECT r.id, r.amount_pt, r.policy, r.auto_eligible, r.reason, r.enrolment_id, c.name AS centre, r.created_at
      FROM ledger.refunds r
      JOIN ledger.payments p ON p.id = r.payment_id
      LEFT JOIN org.centres c ON c.id = p.centre_id
      WHERE r.status = 'requested'
      ORDER BY r.created_at`.execute(sys);
    return rows.map((r) => ({
      id: r.id,
      amountPt: Number(r.amount_pt),
      policy: r.policy,
      autoEligible: r.auto_eligible,
      reason: r.reason,
      enrolmentId: r.enrolment_id,
      centre: r.centre,
      requestedAt: r.created_at.toISOString(),
    }));
  });
}

async function requested(db: Database, id: string) {
  if (!isUuid(id)) throw new Problem(422, 'validation_failed', 'Give the refund ID (a UUID).');
  const r = await db.asSystem((sys) =>
    sys
      .selectFrom('ledger.refunds')
      .select(['id', 'status', 'payment_id', 'policy'])
      .where('id', '=', id)
      .executeTakeFirst(),
  );
  if (!r) throw new Problem(404, 'not_found', 'No such refund.');
  if (r.status !== 'requested')
    throw new Problem(409, 'already_decided', `This refund is already ${r.status}.`);
  return r;
}

/** Approve: P7/P8 posted as one balanced transaction, then the provider is asked to send it. */
export async function approveRefundRequest(db: Database, money: Money, id: string) {
  const r = await requested(db, id);
  const refundId = await db.asSystem(async (sys) => {
    // Lock the row, so a second approval in parallel waits and then finds it decided.
    const row = await sys
      .selectFrom('ledger.refunds')
      .select('status')
      .where('id', '=', r.id)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (row.status !== 'requested')
      throw new Problem(409, 'already_decided', `This refund is already ${row.status}.`);
    return money.approveRefund(
      sys,
      r.payment_id,
      r.policy as Parameters<Money['approveRefund']>[2],
      null,
      HOW,
      false,
      r.id,
    );
  });
  if (!refundId) throw new Problem(409, 'nothing_to_refund', 'The payment is already refunded.');
  await money.sendRefund(refundId);
  return { id: refundId, status: 'approved' as const };
}

/** Deny: the request becomes `rejected`; the parent sees "Refund not approved" on P08. */
export async function denyRefundRequest(db: Database, id: string, reason: string) {
  const why = reason?.trim();
  if (!why) throw new Problem(422, 'reason_required', 'Say why the refund is denied.');
  const r = await requested(db, id);
  return db.asSystem(async (sys) => {
    const done = await sys
      .updateTable('ledger.refunds')
      .set({ status: 'rejected' })
      .where('id', '=', r.id)
      .where('status', '=', 'requested')
      .returning(['id', 'enrolment_id'])
      .executeTakeFirst();
    if (!done) throw new Problem(409, 'already_decided', 'This refund was decided meanwhile.');
    const p = await sys
      .selectFrom('ledger.payments')
      .select('centre_id')
      .where('id', '=', r.payment_id)
      .executeTakeFirstOrThrow();
    await writeAudit(sys, {
      actorId: null,
      actorType: 'system',
      centreId: p.centre_id,
      action: 'refund.rejected',
      objectType: 'refund',
      objectRef: r.id,
      before: { status: 'requested' },
      after: { status: 'rejected' },
      reason: `${HOW}: ${why.slice(0, 500)}`,
    });
    await enqueue(sys, {
      type: 'refund.rejected',
      aggregateType: 'refund',
      aggregateId: r.id,
      centreId: p.centre_id,
      data: { refundId: r.id, enrolmentId: done.enrolment_id },
    });
    return { id: r.id, status: 'rejected' as const };
  });
}
