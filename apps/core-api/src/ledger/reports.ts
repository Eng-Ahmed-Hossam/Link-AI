import { sql } from 'kysely';
import type { Seats } from '../enrolment/seats';
import type { Halls } from '../market/halls';
import { type StoredRentRule, ruleDto } from '../market/model';
import { type Database, type Tx, isOwnerOf } from '../platform/db';
import { forbidden, notFound } from '../platform/problem';
import { addDays, cairoToday, isoWeekday } from '../platform/time';
import { ACCOUNT, balance } from './ledger';
import { bookingMonth, monthOf, monthRange } from './rent-invoices';
import { feeRule } from './rules';

type Lang = 'ar' | 'en';
const money = (amountPt: number) => ({ amountPt, currency: 'EGP' as const });

/** Weekly payouts on Thursday (OD-04): the next one after today. Computed only; no payout runs yet. */
export function nextThursday(today = cairoToday()): string {
  let d = addDays(today, 1);
  while (isoWeekday(d) !== 4) d = addDays(d, 1);
  return d;
}

const masked = (last4: string | null | undefined) => (last4 ? `•••• ${last4}` : '••••');

/**
 * The money statements, read from the ledger, payments and rent invoices (BR-OUT-07, BR-RNT-07):
 * J07 (teacher earnings) and C07 (centre rent income). Link's fee is always its own line
 * (BR-FEE-07). Nothing is cached (BR-MNY-10). Ledger rows are read as SYSTEM after the caller's
 * access was checked with RLS: payees never read ledger tables directly (06 §5).
 */
export class Reports {
  constructor(
    private readonly db: Database,
    private readonly seats: Seats,
    private readonly halls: Halls,
  ) {}

  /** The teacher's balances (08 §3): pending, available, rent reserve, next payout. */
  async teacherBalances(sys: Tx, teacherId: string) {
    const pending = await balance(sys, ACCOUNT.teacherPending(teacherId));
    const available = await balance(sys, ACCOUNT.teacherAvailable(teacherId));
    const month = monthOf(cairoToday());
    const bookings = await sys
      .selectFrom('market.room_bookings')
      .select('id')
      .where('teacher_id', '=', teacherId)
      .where('status', '<>', 'ended')
      .execute();
    let rentReserve = 0;
    for (const b of bookings)
      rentReserve += (await bookingMonth(sys, b.id, month, 'held'))?.grossPt ?? 0;
    // Released funds whose payment the provider has not settled yet cannot be paid out (BR-OUT-02).
    const unsettled = await sql<{ n: string }>`
      SELECT coalesce(sum(p.amount_pt - coalesce(p.commission_pt, 0)
        - coalesce((SELECT sum(r.amount_pt - r.commission_reversed_pt) FROM ledger.refunds r
                    WHERE r.payment_id = p.id AND r.status IN ('approved', 'processing', 'succeeded')), 0)), 0) AS n
      FROM ledger.payments p
      WHERE p.payee_type = 'teacher' AND p.payee_id = ${teacherId} AND p.released_at IS NOT NULL AND p.settled_at IS NULL`.execute(
      sys,
    );
    const next = Math.max(0, available - rentReserve - Number(unsettled.rows[0]!.n));
    return { pending, available, rentReserve, nextPayout: next };
  }

  /** J07 · Earnings for the current month (MKT-LED-07). */
  earnings(userId: string, lang: Lang) {
    return this.db.asUser(userId, async (tx, ctx) => {
      if (!ctx.teacherId) throw forbidden('Teachers only.');
      const teacherId = ctx.teacherId;
      const month = monthOf(cairoToday());
      const { from, to } = monthRange(month);
      const groups = await tx
        .selectFrom('market.groups as g')
        .innerJoin('market.centres_seen_by_teacher as c', 'c.id', 'g.centre_id')
        .innerJoin('ref.subjects as s', 's.id', 'g.subject_id')
        .innerJoin('ref.school_years as y', 'y.id', 'g.school_year_id')
        .select([
          'g.id',
          'c.name as centre',
          's.name_en',
          's.name_ar',
          'y.short_name_en',
          'y.short_name_ar',
        ])
        .where('g.teacher_id', '=', teacherId)
        .orderBy('g.created_at')
        .execute();
      const students = await this.seats.filledNext(
        tx,
        groups.map((g) => g.id),
      );
      const account = await tx
        .selectFrom('ledger.payout_accounts')
        .select('display_last4')
        .where('owner_type', '=', 'teacher')
        .where('owner_id', '=', teacherId)
        .where('status', 'in', ['pending_verification', 'verified'])
        .executeTakeFirst();
      return this.db.asSystem(async (sys) => {
        // Money in this month, from the ledger: captures (P1) less refunds (P7/P8).
        const flows = await sql<{
          group_id: string;
          method: string;
          paid: string;
          commission: string;
          refunded: string;
          commission_back: string;
        }>`
          SELECT e.group_id, p.method,
            sum(CASE WHEN t.kind = 'payment_captured' THEN le.debit_pt ELSE 0 END) FILTER (WHERE a.code LIKE 'provider_clearing:%') AS paid,
            sum(CASE WHEN t.kind = 'payment_captured' THEN le.credit_pt ELSE 0 END) FILTER (WHERE a.code = ${ACCOUNT.bookingCommission}) AS commission,
            sum(CASE WHEN t.kind = 'refund' THEN le.credit_pt WHEN t.kind = 'refund_failed' THEN -le.debit_pt ELSE 0 END) FILTER (WHERE a.code LIKE 'refunds_in_transit:%') AS refunded,
            sum(CASE WHEN t.kind = 'refund' THEN le.debit_pt WHEN t.kind = 'refund_failed' THEN -le.credit_pt ELSE 0 END) FILTER (WHERE a.code = ${ACCOUNT.bookingCommission}) AS commission_back
          FROM ledger.ledger_transactions t
          JOIN ledger.ledger_entries le ON le.transaction_id = t.id
          JOIN ledger.ledger_accounts a ON a.id = le.account_id
          JOIN ledger.payments p ON p.id = t.payment_id
          JOIN market.enrolments e ON e.id = p.enrolment_id
          WHERE t.teacher_id = ${teacherId} AND t.kind IN ('payment_captured', 'refund', 'refund_failed')
            AND (t.occurred_at AT TIME ZONE 'Africa/Cairo')::date >= ${from}::date
            AND (t.occurred_at AT TIME ZONE 'Africa/Cairo')::date < ${to}::date
          GROUP BY e.group_id, p.method`.execute(sys);
        const n = (v: string | null) => Number(v ?? 0);
        const net = (f: (typeof flows.rows)[number]) => n(f.paid) - n(f.refunded);
        const parentsPaid = flows.rows.reduce((a, f) => a + net(f), 0);
        const commission = flows.rows.reduce(
          (a, f) => a + n(f.commission) - n(f.commission_back),
          0,
        );
        // Rent per hall: this month's invoice when issued, else the rent so far and still planned.
        const bookings = await sys
          .selectFrom('market.room_bookings as b')
          .innerJoin('market.rooms as r', 'r.id', 'b.room_id')
          .innerJoin('org.centres as c', 'c.id', 'b.centre_id')
          .select(['b.id', 'b.room_id', 'r.name as hall', 'c.name as centre', 'b.rent_rule'])
          .where('b.teacher_id', '=', teacherId)
          .where((w) =>
            w.or([w('b.status', '<>', 'ended'), w('b.ends_on', '>', sql<Date>`${from}::date`)]),
          )
          .execute();
        const perHall = new Map<
          string,
          { centre: string; hall: string; rule: StoredRentRule; amount: number }
        >();
        for (const b of bookings) {
          const amount = await this.rentForMonth(sys, b.id, month);
          if (!amount) continue;
          const x = perHall.get(b.room_id) ?? {
            centre: b.centre,
            hall: b.hall,
            rule: b.rent_rule as StoredRentRule,
            amount: 0,
          };
          x.amount += amount;
          perHall.set(b.room_id, x);
        }
        const rent = [...perHall.values()].map((r) => ({
          centre: r.centre,
          hall: r.hall,
          rule: ruleDto(r.rule),
          amount: money(r.amount),
        }));
        const rentTotal = rent.reduce((a, r) => a + r.amount.amountPt, 0);
        const byMethod = new Map<string, number>();
        for (const f of flows.rows)
          byMethod.set(f.method, (byMethod.get(f.method) ?? 0) + n(f.paid));
        const paidTotal = [...byMethod.values()].reduce((a, b) => a + b, 0);
        const rule = await feeRule(sys, 'booking_commission', { teacherId });
        const bal = await this.teacherBalances(sys, teacherId);
        return {
          month,
          keep: money(parentsPaid - commission - rentTotal),
          nextPayout: {
            on: nextThursday(),
            amount: money(bal.nextPayout),
            account: masked(account?.display_last4),
          },
          parentsPaid: money(parentsPaid),
          commission: money(commission),
          commissionPercent: Number(rule.ratePct),
          rent,
          rentTotal: money(rentTotal),
          byGroup: groups.map((g) => ({
            id: g.id,
            name: `${lang === 'ar' ? g.name_ar : g.name_en} • ${(lang === 'ar' ? g.short_name_ar : g.short_name_en) ?? ''} • ${g.centre ?? ''}`,
            students: students.get(g.id) ?? 0,
            amount: money(
              flows.rows.filter((f) => f.group_id === g.id).reduce((a, f) => a + net(f), 0),
            ),
          })),
          methods: (['card', 'fawry', 'wallet'] as const)
            .map((method) => ({
              method,
              percent: paidTotal ? Math.round(((byMethod.get(method) ?? 0) / paidTotal) * 100) : 0,
            }))
            .filter((x) => x.percent > 0),
        };
      });
    });
  }

  /** A booking's rent for a month: the issued invoice, else the planned month (BR-RNT-03). */
  private async rentForMonth(sys: Tx, bookingId: string, month: string) {
    const inv = await this.invoiceFor(sys, bookingId, month);
    if (inv) return Number(inv.gross_amount_pt);
    return (await bookingMonth(sys, bookingId, month, 'planned'))?.grossPt ?? 0;
  }

  private invoiceFor(sys: Tx, bookingId: string, month: string) {
    const { from, to } = monthRange(month);
    return sys
      .selectFrom('ledger.rent_invoices')
      .selectAll()
      .where('room_booking_id', '=', bookingId)
      .where(sql<boolean>`period = daterange(${from}::date, ${to}::date, '[)')`)
      .where('status', '<>', 'void')
      .executeTakeFirst();
  }

  /** C07 · Rent income for the current month (MKT-LED-08). Owner of that centre only. */
  async rentIncome(userId: string, centreId: string, lang: Lang) {
    await this.db.asUser(userId, async (_tx, ctx) => {
      if (!ctx.centreIds.includes(centreId)) throw notFound('centre');
      if (!isOwnerOf(ctx, centreId)) throw forbidden('Only the owner sees rent income.');
    });
    const roomUsePercent = (await this.halls.schedule(userId, centreId)).build(lang).stats
      .roomUsePercent;
    return this.db.asSystem(async (sys) => {
      const month = monthOf(cairoToday());
      const { from } = monthRange(month);
      const bookings = await sys
        .selectFrom('market.room_bookings as b')
        .innerJoin('market.rooms as r', 'r.id', 'b.room_id')
        .innerJoin('org.teachers as t', 't.id', 'b.teacher_id')
        .select([
          'b.id',
          'b.room_id',
          'b.teacher_id',
          'r.name as hall',
          't.display_name',
          'b.rent_rule',
        ])
        .where('b.centre_id', '=', centreId)
        .where((w) =>
          w.or([w('b.status', '<>', 'ended'), w('b.ends_on', '>', sql<Date>`${from}::date`)]),
        )
        .orderBy('b.created_at')
        .execute();
      const rows: {
        teacher: { id: string; name: string };
        hall: { id: string; name: string };
        sessions: number;
        studentSessions: number;
        rentRule: ReturnType<typeof ruleDto>;
        feesBase: { amountPt: number; currency: 'EGP' } | null;
        rent: { amountPt: number; currency: 'EGP' };
        linkFee: { amountPt: number; currency: 'EGP' };
        net: { amountPt: number; currency: 'EGP' };
        paidVia: 'link' | 'due';
        dueOn: string | null;
      }[] = [];
      for (const b of bookings) {
        const inv = await this.invoiceFor(sys, b.id, month);
        const m = inv ? null : await bookingMonth(sys, b.id, month, 'planned');
        const sessions = inv ? inv.sessions_count : (m?.sessions ?? 0);
        if (!sessions && !inv) continue;
        const rule = b.rent_rule as StoredRentRule;
        const rent = inv ? Number(inv.gross_amount_pt) : m!.grossPt;
        const fee = inv ? Number(inv.link_fee_amount_pt) : m!.linkFeePt;
        // A shortfall the teacher still owes, this month or before (BR-RNT-05, BR-RNT-08).
        const due = await sys
          .selectFrom('ledger.rent_invoices')
          .select(sql<string | null>`min(due_on)::text`.as('due_on'))
          .where('room_booking_id', '=', b.id)
          .where('status', 'in', ['issued', 'partially_paid', 'overdue'])
          .executeTakeFirst();
        rows.push({
          teacher: { id: b.teacher_id, name: b.display_name },
          hall: { id: b.room_id, name: b.hall },
          sessions,
          studentSessions: inv ? inv.student_sessions_count : (m?.studentSessions ?? 0),
          rentRule: ruleDto(rule),
          feesBase:
            rule.type === 'percent_of_fees'
              ? money(
                  inv
                    ? Number(inv.fees_base_pt) + Number(inv.fees_base_adjustment_pt)
                    : m!.feesBasePt + m!.adjustmentPt,
                )
              : null,
          rent: money(rent),
          linkFee: money(fee),
          net: money(rent - fee),
          paidVia: (due?.due_on ? 'due' : 'link') as 'due' | 'link',
          dueOn: due?.due_on ?? null,
        });
      }
      const sum = (f: (x: (typeof rows)[number]) => number) => rows.reduce((a, x) => a + f(x), 0);
      const rentDue = sum((x) => x.rent.amountPt);
      const collected = sum((x) => (x.paidVia === 'link' ? x.rent.amountPt : 0));
      const linkFee = sum((x) => x.linkFee.amountPt);
      const rule = await feeRule(sys, 'rent_fee', { centreId });
      const available = await balance(sys, ACCOUNT.centreAvailable(centreId));
      const account = await sys
        .selectFrom('ledger.payout_accounts')
        .select('display_last4')
        .where('owner_type', '=', 'centre')
        .where('owner_id', '=', centreId)
        .where('status', 'in', ['pending_verification', 'verified'])
        .executeTakeFirst();
      return {
        month,
        feePercent: Number(rule.ratePct),
        rows,
        totals: {
          rentDue: money(rentDue),
          collected: money(collected),
          outstanding: money(rentDue - collected),
          linkFee: money(linkFee),
          net: money(rentDue - linkFee),
        },
        teachers: new Set(rows.map((r) => r.teacher.id)).size,
        halls: new Set(rows.map((r) => r.hall.id)).size,
        roomUsePercent,
        nextTransfer: {
          on: nextThursday(),
          amount: money(Math.max(0, available)),
          account: masked(account?.display_last4),
        },
      };
    });
  }
}
