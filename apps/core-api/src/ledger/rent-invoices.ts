import { sql } from 'kysely';
import type { StoredRentRule } from '../market/model';
import type { Database, Tx } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import type { Logger } from '../platform/logger';
import { enqueue } from '../platform/outbox';
import { addDays, addMonth, cairoToday } from '../platform/time';
import { ACCOUNT, balance, post } from './ledger';
import { p12RentReversal, p3RentDeduction, rentFeeShare } from './postings';
import { type RentResult, rentInvoice, rentReversal, spread } from './rent';
import { feeRule } from './rules';

/** First day of a month and of the next one, from `YYYY-MM`. */
export const monthRange = (month: string) => {
  const from = `${month}-01`;
  return { from, to: addMonth(from) };
};
export const monthOf = (day: string) => day.slice(0, 7);

export interface BookingMonth extends RentResult {
  bookingId: string;
  centreId: string;
  teacherId: string;
  roomId: string;
  rule: StoredRentRule;
  feePct: string;
  feeRuleId: string;
  sessions: number;
  studentSessions: number;
  billedSessionIds: string[];
  adjustedRefundIds: string[];
  endedWithMonth: boolean;
}

/**
 * Rent for one booking and one month (BR-RNT-03/04/09, docs/08 §6 step 1):
 *   `held`    — sessions that took place (the invoice, and the teacher's rent reserve);
 *   `planned` — every session of the month not cancelled or marked "did not take place" (the
 *               C07 and J07 figures for the current month, before the invoice exists).
 * Fee shares: each payment spread over its paid period's sessions (remainder to the earliest);
 * refunds come off their own sessions' shares; a refund of shares an earlier invoice already
 * billed comes off this invoice's base, with the last invoice's carry (OD-43).
 */
export async function bookingMonth(
  tx: Tx,
  bookingId: string,
  month: string,
  which: 'held' | 'planned',
): Promise<BookingMonth | null> {
  const b = await tx
    .selectFrom('market.room_bookings as b')
    .leftJoin('market.groups as g', 'g.room_booking_id', 'b.id')
    .select([
      'b.id',
      'b.centre_id',
      'b.teacher_id',
      'b.room_id',
      'b.rent_rule',
      'b.status',
      sql<string | null>`b.ends_on::text`.as('ends_on'),
      'g.id as group_id',
    ])
    .where('b.id', '=', bookingId)
    .executeTakeFirst();
  if (!b) return null;
  const rule = b.rent_rule as StoredRentRule;
  const { from, to } = monthRange(month);
  const fr = await feeRule(
    tx,
    'rent_fee',
    { centreId: b.centre_id },
    from < cairoToday() ? cairoToday() : from,
  );
  const sessions = b.group_id
    ? (
        await sql<{ id: string; status: string; rent_invoice_id: string | null; day: string }>`
          SELECT id, status, rent_invoice_id, market.session_day(starts_at)::text AS day
          FROM market.group_sessions
          WHERE group_id = ${b.group_id} AND market.session_day(starts_at) >= ${from}::date
            AND market.session_day(starts_at) < ${to}::date
          ORDER BY starts_at`.execute(tx)
      ).rows.filter((s) =>
        which === 'held'
          ? s.status === 'held' && !s.rent_invoice_id
          : !['cancelled', 'not_held'].includes(s.status),
      )
    : [];
  const ids = sessions.map((s) => s.id);

  // Students counted per session (OD-13): enrolments that held a seat in it.
  let studentSessions = 0;
  if (ids.length && rule.type === 'per_student_per_session') {
    const { rows } = await sql<{ n: number }>`
      SELECT count(*)::int AS n FROM market.group_sessions s JOIN market.enrolments e ON e.group_id = s.group_id
      WHERE s.id = ANY (${ids}::uuid[]) AND e.status IN ('awaiting_teacher', 'confirmed', 'past_due', 'ended')
        AND market.covers(e, s.id, market.session_day(s.starts_at))`.execute(tx);
    studentSessions = rows[0]!.n;
  }

  let feesBase = 0;
  let adjustment = 0;
  const adjustedRefundIds: string[] = [];
  if (rule.type === 'percent_of_fees' && b.group_id) {
    const shares = await feeShares(tx, b.group_id);
    for (const id of ids) feesBase += shares.net.get(id) ?? 0;
    // Refunds of shares already billed by earlier invoices, not yet taken off (BR-RNT-09).
    const done = await tx
      .selectFrom('ledger.rent_invoices')
      .select(['calculation', 'fees_base_carried_pt', 'issued_at'])
      .where('room_booking_id', '=', b.id)
      .where('status', '<>', 'void')
      .orderBy('issued_at', 'desc')
      .execute();
    const already = new Set(
      done.flatMap(
        (d) => (d.calculation as { adjustedRefundIds?: string[] }).adjustedRefundIds ?? [],
      ),
    );
    for (const r of shares.refunds) {
      if (already.has(r.id)) continue;
      const billed = r.sessions.filter((s) => s.billedBefore(r.at));
      const off = billed.reduce((a, s) => a + s.share, 0);
      if (off > 0) {
        adjustment -= off;
        adjustedRefundIds.push(r.id);
      }
    }
    adjustment += Number(done[0]?.fees_base_carried_pt ?? 0);
  }
  const result = rentInvoice({
    rule,
    feePct: fr.ratePct,
    heldSessions: ids.length,
    studentSessions,
    feesBasePt: feesBase,
    adjustmentPt: adjustment,
  });
  return {
    ...result,
    bookingId: b.id,
    centreId: b.centre_id,
    teacherId: b.teacher_id,
    roomId: b.room_id,
    rule,
    feePct: fr.ratePct,
    feeRuleId: fr.id,
    sessions: ids.length,
    studentSessions,
    billedSessionIds: ids,
    adjustedRefundIds,
    endedWithMonth: b.status === 'ended' || (!!b.ends_on && b.ends_on <= to),
  };
}

/**
 * Per session of a group: the net fee share (payments spread over their paid period, minus
 * refunds spread the same way), and each refund's shares with when they were billed.
 */
async function feeShares(tx: Tx, groupId: string) {
  const pays = await sql<{
    id: string;
    amount_pt: string;
    plan: string;
    session_id: string | null;
    period_start: string | null;
    period_end: string | null;
  }>`
    SELECT p.id, p.amount_pt, e.payment_plan AS plan, e.session_id,
           p.period_start::text AS period_start, p.period_end::text AS period_end
    FROM ledger.payments p JOIN market.enrolments e ON e.id = p.enrolment_id
    WHERE e.group_id = ${groupId} AND p.status IN ('succeeded', 'partially_refunded', 'refunded')`.execute(
    tx,
  );
  const sess = await sql<{
    id: string;
    day: string;
    rent_invoice_id: string | null;
    issued_at: Date | null;
  }>`
    SELECT s.id, market.session_day(s.starts_at)::text AS day, s.rent_invoice_id, i.issued_at
    FROM market.group_sessions s LEFT JOIN ledger.rent_invoices i ON i.id = s.rent_invoice_id
    WHERE s.group_id = ${groupId} ORDER BY s.starts_at`.execute(tx);
  const refunds = await sql<{ id: string; payment_id: string; amount_pt: string; at: Date }>`
    SELECT r.id, r.payment_id, r.amount_pt, coalesce(r.approved_at, r.created_at) AS at
    FROM ledger.refunds r JOIN ledger.payments p ON p.id = r.payment_id JOIN market.enrolments e ON e.id = p.enrolment_id
    WHERE e.group_id = ${groupId} AND r.status IN ('approved', 'processing', 'succeeded')`.execute(
    tx,
  );
  const net = new Map<string, number>();
  const periodOf = (p: (typeof pays.rows)[number]) =>
    p.plan === 'per_session'
      ? sess.rows.filter((s) => s.id === p.session_id)
      : sess.rows.filter((s) => s.day >= p.period_start! && s.day < p.period_end!);
  const out: {
    id: string;
    at: Date;
    sessions: { share: number; billedBefore: (t: Date) => boolean }[];
  }[] = [];
  for (const p of pays.rows) {
    const period = periodOf(p);
    for (const [id, share] of spread(
      Number(p.amount_pt),
      period.map((s) => s.id),
    ))
      net.set(id, (net.get(id) ?? 0) + share);
    for (const r of refunds.rows.filter((x) => x.payment_id === p.id)) {
      const parts = spread(
        Number(r.amount_pt),
        period.map((s) => s.id),
      );
      for (const [id, share] of parts) net.set(id, (net.get(id) ?? 0) - share);
      out.push({
        id: r.id,
        at: new Date(r.at),
        sessions: period.map((s) => ({
          share: parts.get(s.id) ?? 0,
          billedBefore: (t: Date) => !!s.issued_at && new Date(s.issued_at) < t,
        })),
      });
    }
  }
  return { net, refunds: out };
}

/**
 * The rent invoice job (1st of the month, 02:00 Cairo; docs/08 §6 steps 1–4): one invoice per live
 * booking for the month before, the sessions stamped, P3 for `min(gross, teacher available)`, a
 * shortfall due in 5 days; P12 when an ended booking keeps a carry. Safe to run twice.
 */
export class RentInvoices {
  constructor(
    private readonly db: Database,
    private readonly log: Logger,
  ) {}

  async issue(month = monthOf(addDays(`${monthOf(cairoToday())}-01`, -1))) {
    const { from, to } = monthRange(month);
    const bookings = await this.db.asSystem((sys) =>
      sys
        .selectFrom('market.room_bookings')
        .select('id')
        .where('starts_on', '<', sql<Date>`${to}::date`)
        .where((w) => w.or([w('ends_on', 'is', null), w('ends_on', '>', sql<Date>`${from}::date`)]))
        .execute(),
    );
    const issued: string[] = [];
    for (const { id } of bookings) {
      const invoiceId = await this.db.asSystem((sys) => this.issueOne(sys, id, month));
      if (invoiceId) issued.push(invoiceId);
    }
    this.log.info({ month, invoices: issued.length }, 'rent invoices issued');
    return issued;
  }

  async issueOne(sys: Tx, bookingId: string, month: string): Promise<string | null> {
    const { from, to } = monthRange(month);
    const exists = await sys
      .selectFrom('ledger.rent_invoices')
      .select('id')
      .where('room_booking_id', '=', bookingId)
      .where(sql<boolean>`period = daterange(${from}::date, ${to}::date, '[)')`)
      .executeTakeFirst();
    if (exists) return null;
    const m = await bookingMonth(sys, bookingId, month, 'held');
    if (!m || (m.sessions === 0 && m.adjustmentPt === 0)) return null;
    const id = uuidv7();
    const available = Math.max(0, await balance(sys, ACCOUNT.teacherAvailable(m.teacherId)));
    const deducted = Math.min(m.grossPt, available);
    const feeShare = rentFeeShare({
      gross: m.grossPt,
      fee: m.linkFeePt,
      part: deducted,
      feeAlreadyTaken: 0,
      last: deducted === m.grossPt,
    });
    const status = deducted === m.grossPt ? 'paid' : deducted > 0 ? 'partially_paid' : 'issued';
    await sys
      .insertInto('ledger.rent_invoices')
      .values({
        id,
        room_booking_id: bookingId,
        centre_id: m.centreId,
        teacher_id: m.teacherId,
        period: `[${from},${to})`,
        sessions_count: m.sessions,
        student_sessions_count: m.studentSessions,
        fees_base_pt: String(m.feesBasePt),
        fees_base_adjustment_pt: String(m.adjustmentPt),
        fees_base_carried_pt: String(m.carriedPt),
        gross_amount_pt: String(m.grossPt),
        link_fee_pct: m.feePct,
        link_fee_amount_pt: String(m.linkFeePt),
        net_to_centre_pt: String(m.netToCentrePt),
        commission_rule_id: m.feeRuleId,
        deducted_pt: String(deducted),
        status,
        issued_at: new Date(),
        due_on: addDays(cairoToday(), 5),
        settled_at: status === 'paid' ? new Date() : null,
        calculation: JSON.stringify({
          rule: m.rule,
          sessions: m.billedSessionIds.length,
          studentSessions: m.studentSessions,
          feesBasePt: m.feesBasePt,
          adjustmentPt: m.adjustmentPt,
          carriedPt: m.carriedPt,
          feePct: m.feePct,
          available,
          adjustedRefundIds: m.adjustedRefundIds,
        }),
      })
      .execute();
    if (m.billedSessionIds.length)
      await sys
        .updateTable('market.group_sessions')
        .set({ rent_invoice_id: id })
        .where('id', 'in', m.billedSessionIds)
        .execute();
    if (deducted > 0)
      await post(sys, {
        kind: 'rent_deduction',
        key: `rent-deduct:${id}`,
        description: `Rent ${month} deducted from the teacher's balance`,
        lines: p3RentDeduction({
          teacherId: m.teacherId,
          centreId: m.centreId,
          deducted,
          feeShare,
        }),
        rentInvoiceId: id,
        centreId: m.centreId,
        teacherId: m.teacherId,
      });
    // P12: the booking ended and part of a refund adjustment can never be absorbed (OD-43).
    if (m.carriedPt < 0 && m.endedWithMonth && m.rule.type === 'percent_of_fees') {
      const r = rentReversal({ pct: m.rule.pct, feePct: m.feePct, unabsorbedPt: -m.carriedPt });
      if (r.rent > 0)
        await post(sys, {
          kind: 'rent_reversal',
          key: `rent-reversal:${bookingId}:${id}`,
          description: 'Rent share on refunded fees reversed (booking ended)',
          lines: p12RentReversal({
            teacherId: m.teacherId,
            centreId: m.centreId,
            rent: r.rent,
            fee: r.linkFee,
          }),
          rentInvoiceId: id,
          centreId: m.centreId,
          teacherId: m.teacherId,
        });
    }
    await enqueue(sys, {
      type: 'rent_invoice.issued',
      aggregateType: 'rent_invoice',
      aggregateId: id,
      centreId: m.centreId,
      data: { rentInvoiceId: id, grossPt: m.grossPt, deductedPt: deducted, status },
    });
    return id;
  }
}
