import { sql } from 'kysely';
import type { Tx } from '../platform/db';
import { Problem } from '../platform/problem';
import { addDays, cairoToUtc, cairoToday, isoWeekday } from '../platform/time';

/**
 * Shared marketplace rules (docs/01, docs/08). Money is integer piasters; Link's fee is exact,
 * then rounded DOWN to a whole piaster (OD-16). Rates come from ledger.commission_rules, never
 * from code (CLAUDE.md).
 */
export type Lang = 'ar' | 'en';
export const money = (amountPt: number) => ({ amountPt, currency: 'EGP' as const });

/** The hall grid (C05): Saturday to Thursday (ISO 6, 7, 1–4), 2-hour slots from 2 PM. */
export const SLOT_DAYS = [6, 7, 1, 2, 3, 4];
export const SLOT_TIMES = ['14:00', '16:00', '18:00', '20:00'];
export const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const plus2h = (t: string) =>
  `${String(Number(t.slice(0, 2)) + 2).padStart(2, '0')}:${t.slice(3, 5)}`;
export const hhmm = (t: string) => t.slice(0, 5);
export const overlaps = (a0: string, a1: string, b0: string, b1: string) =>
  minutesOf(a0) < minutesOf(b1) && minutesOf(b0) < minutesOf(a1);

// ── Rent rules: stored shape (06 §4) ↔ API shape (RentRule) ────────────────────
export type StoredRentRule =
  | { type: 'fixed_per_session'; amountPt: number }
  | { type: 'per_student_per_session'; amountPt: number; countBasis?: 'enrolled' }
  | { type: 'percent_of_fees'; pct: string };

export function ruleDto(r: StoredRentRule) {
  return r.type === 'percent_of_fees'
    ? { basis: r.type, amount: null, percent: Number(r.pct) }
    : { basis: r.type, amount: money(r.amountPt), percent: null };
}

/** C05: one rent rule per hall; amounts at least EGP 1; a share of fees from 1% to 60%. */
export function ruleFromInput(r: {
  basis: StoredRentRule['type'];
  amountPt?: number | null;
  percent?: number | null;
}): StoredRentRule {
  if (r.basis === 'percent_of_fees') {
    if (!r.percent || !Number.isInteger(r.percent) || r.percent < 1 || r.percent > 60)
      throw new Problem(422, 'invalid_percent', 'Share of fees: a whole percentage from 1 to 60.');
    return { type: r.basis, pct: r.percent.toFixed(2) };
  }
  if (!r.amountPt || !Number.isInteger(r.amountPt) || r.amountPt < 100)
    throw new Problem(422, 'invalid_amount', 'Rent must be at least EGP 1.');
  return r.basis === 'per_student_per_session'
    ? { type: r.basis, amountPt: r.amountPt, countBasis: 'enrolled' }
    : { type: r.basis, amountPt: r.amountPt };
}

/** Rent for a month of sessions under a rule (BR-BKG-07): per session, per student, or % of fees. */
export function rentFor(rule: StoredRentRule, sessions: number, students: number, feesPt: number) {
  if (rule.type === 'fixed_per_session') return rule.amountPt * sessions;
  if (rule.type === 'per_student_per_session') return rule.amountPt * students * sessions;
  return feeOf(feesPt, rule.pct);
}

/** A percentage of an amount, rounded down to a whole piaster (OD-16). `pct` like "5.00". */
export function feeOf(amountPt: number, pct: string | number) {
  const basisPoints = Math.round(Number(pct) * 100);
  return Math.floor((amountPt * basisPoints) / 10_000);
}

/**
 * The rate in force today for a kind of fee: the most specific rule (centre or teacher), else the
 * global default (OD-01 rent fee, OD-02 booking commission). Read, never cached (it is snapshotted
 * on payments in R2b).
 */
export async function rateFor(
  tx: Tx,
  kind: 'rent_fee' | 'booking_commission',
  scope: { centreId?: string; teacherId?: string } = {},
): Promise<string> {
  const today = cairoToday();
  const rows = await tx
    .selectFrom('ledger.commission_rules')
    .select(['rate_pct', 'centre_id', 'teacher_id'])
    .where('kind', '=', kind)
    .where(sql<boolean>`validity @> ${today}::date`)
    .execute();
  const specific = rows.find(
    (r) =>
      (scope.centreId && r.centre_id === scope.centreId) ||
      (scope.teacherId && r.teacher_id === scope.teacherId),
  );
  const rule = specific ?? rows.find((r) => !r.centre_id && !r.teacher_id);
  if (!rule) throw new Problem(500, 'no_commission_rule', `No ${kind} rule is in force.`);
  return String(rule.rate_pct);
}
export const percentNumber = (pct: string) => Number(pct);

// ── Sessions: generated from the weekly slot (MKT-GRP-01) ──────────────────────
/** Sessions are kept generated from 5 weeks back to 9 weeks ahead (the worker extends them). */
export const SESSION_WINDOW = { back: 35, ahead: 63 };

export function sessionTimes(
  g: { weekdays: number[]; startTime: string; endTime: string; startsOn: string },
  from = addDays(cairoToday(), -SESSION_WINDOW.back),
  to = addDays(cairoToday(), SESSION_WINDOW.ahead),
) {
  const out: { startsAt: string; endsAt: string; date: string }[] = [];
  const first = g.startsOn > from ? g.startsOn : from;
  for (let d = first; d <= to; d = addDays(d, 1))
    if (g.weekdays.includes(isoWeekday(d)))
      out.push({
        date: d,
        startsAt: cairoToUtc(d, hhmm(g.startTime)),
        endsAt: cairoToUtc(d, hhmm(g.endTime)),
      });
  return out;
}

/** Sessions in a calendar month on these weekdays (information only, BR-PMT-04). */
export const sessionsPerMonth = (weekdays: number[]) => weekdays.length * 4;

// ── Ratings (BR-REV-07): average of published public reviews, one decimal ──────
export function ratingOf(dist: number[] | null | undefined) {
  const d = dist ?? [0, 0, 0, 0, 0];
  const count = d.reduce((a, b) => a + b, 0);
  if (!count) return { avg: null as number | null, count: 0 };
  const sum = d.reduce((a, n, i) => a + n * (5 - i), 0);
  return { avg: Math.round((sum / count) * 10) / 10, count };
}
export const ratingSummary = (dist: number[] | null | undefined) => {
  const r = ratingOf(dist);
  return r.avg === null ? null : { avg: r.avg.toFixed(1), count: r.count };
};

/** PostGIS: kilometres from a point, one decimal. */
export const distanceKmSql = (lat: number, lng: number) =>
  sql<number>`round((ST_Distance(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) / 1000)::numeric, 1)::float8`;

/**
 * Where distances are measured from when the caller sends no location: a sample home in Maadi
 * (the sample parent's area). P02 passes the device location once it asks for it.
 */
export const DEFAULT_POINT = { lat: 29.956, lng: 31.266 };

/** A subject for one curriculum and year from any subject ID of the same code (07 §2). */
export async function subjectForYear(tx: Tx, subjectId: string, schoolYearId: string) {
  const row = await tx
    .selectFrom('ref.subjects as pick')
    .innerJoin('ref.school_years as y', (j) => j.on('y.id', '=', schoolYearId))
    .innerJoin('ref.subjects as s', (j) =>
      j
        .onRef('s.code', '=', 'pick.code')
        .onRef('s.school_year_id', '=', 'y.id')
        .onRef('s.curriculum_id', '=', 'y.curriculum_id'),
    )
    .select(['s.id', 's.curriculum_id', 's.school_year_id', 's.code'])
    .where('pick.id', '=', subjectId)
    .executeTakeFirst();
  if (!row)
    throw new Problem(422, 'validation_failed', 'This subject is not taught in that school year.', {
      errors: [{ field: 'subjectId', code: 'not_in_year' }],
    });
  return row;
}
