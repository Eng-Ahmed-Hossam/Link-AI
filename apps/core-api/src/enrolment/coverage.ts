import { sql } from 'kysely';
import type { Tx } from '../platform/db';
import { addMonth } from '../platform/time';

/**
 * Which sessions an enrolment covers (BR-ENR-13), the same rule as SQL `market.covers`:
 * monthly and single-month plans cover every session of the paid period [start, end); a live
 * recurring plan also covers the next period until its renewal succeeds or fails; a per-session
 * plan covers its one session. Dates are Cairo days, read as text (never as JS Dates).
 */
export interface EnrolmentRow {
  id: string;
  reference: string;
  student_id: string;
  guardian_id: string;
  group_id: string;
  centre_id: string;
  teacher_id: string;
  status: EnrolmentStatus;
  payment_plan: Plan;
  method: Method | null;
  price_pt: string;
  first_session_id: string;
  session_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  hold_expires_at: Date | null;
  teacher_reviews: boolean;
  phone_shared: boolean;
  plan_cancelled_at: Date | null;
  status_changed_at: Date;
  created_at: Date;
}

export type EnrolmentStatus =
  | 'pending_payment'
  | 'awaiting_teacher'
  | 'confirmed'
  | 'past_due'
  | 'cancelled'
  | 'expired'
  | 'declined'
  | 'ended';
export type Plan = 'monthly_recurring' | 'single_month' | 'per_session';
export type Method = 'card' | 'fawry' | 'wallet';

/** States that hold a seat (08 §4): committed seats. `pending_payment` holds one in Redis only. */
export const COMMITTED: EnrolmentStatus[] = ['awaiting_teacher', 'confirmed', 'past_due'];
export const LIVE: EnrolmentStatus[] = ['pending_payment', ...COMMITTED];

/** Methods per plan (BR-PMT-02, BR-PMT-03, OD-10): the monthly plan is card only. */
export const METHODS: Record<Plan, Method[]> = {
  monthly_recurring: ['card'],
  single_month: ['card', 'fawry', 'wallet'],
  per_session: ['card', 'fawry', 'wallet'],
};

/** The enrolment columns, dates as text. */
export const ENROLMENT_COLUMNS = [
  'e.id',
  'e.reference',
  'e.student_id',
  'e.guardian_id',
  'e.group_id',
  'e.centre_id',
  'e.teacher_id',
  'e.status',
  'e.payment_plan',
  'e.method',
  'e.price_pt',
  'e.first_session_id',
  'e.session_id',
  sql<string | null>`e.current_period_start::text`.as('current_period_start'),
  sql<string | null>`e.current_period_end::text`.as('current_period_end'),
  'e.hold_expires_at',
  'e.teacher_reviews',
  'e.phone_shared',
  'e.plan_cancelled_at',
  'e.status_changed_at',
  'e.created_at',
] as const;

export async function loadEnrolment(
  tx: Tx,
  id: string,
  lock = false,
): Promise<EnrolmentRow | undefined> {
  let q = tx
    .selectFrom('market.enrolments as e')
    .select([...ENROLMENT_COLUMNS])
    .where('e.id', '=', id);
  if (lock) q = q.forUpdate();
  return (await q.executeTakeFirst()) as EnrolmentRow | undefined;
}

export interface SessionTime {
  id: string;
  startsAt: Date;
  endsAt: Date;
  day: string;
}

/** A group's sessions whose Cairo day is in [from, to), in date order. */
export async function sessionsBetween(tx: Tx, groupId: string, from: string, to: string) {
  const { rows } = await sql<{ id: string; starts_at: Date; ends_at: Date; day: string }>`
    SELECT id, starts_at, ends_at, market.session_day(starts_at)::text AS day
    FROM market.group_sessions
    WHERE group_id = ${groupId} AND market.session_day(starts_at) >= ${from}::date
      AND market.session_day(starts_at) < ${to}::date
    ORDER BY starts_at`.execute(tx);
  return rows.map((r) => ({
    id: r.id,
    startsAt: new Date(r.starts_at),
    endsAt: new Date(r.ends_at),
    day: r.day,
  }));
}

export async function sessionById(tx: Tx, id: string): Promise<SessionTime | undefined> {
  const { rows } = await sql<{ id: string; starts_at: Date; ends_at: Date; day: string }>`
    SELECT id, starts_at, ends_at, market.session_day(starts_at)::text AS day
    FROM market.group_sessions WHERE id = ${id}`.execute(tx);
  const r = rows[0];
  return (
    r && { id: r.id, startsAt: new Date(r.starts_at), endsAt: new Date(r.ends_at), day: r.day }
  );
}

/** The paid period's sessions (what the parent paid for). */
export async function paidSessions(tx: Tx, e: EnrolmentRow): Promise<SessionTime[]> {
  if (e.payment_plan === 'per_session') {
    const s = await sessionById(tx, e.session_id!);
    return s ? [s] : [];
  }
  return sessionsBetween(tx, e.group_id, e.current_period_start!, e.current_period_end!);
}

/** The next period's sessions a live recurring plan also keeps (BR-ENR-13). */
export async function nextPeriodSessions(tx: Tx, e: EnrolmentRow): Promise<SessionTime[]> {
  if (e.payment_plan !== 'monthly_recurring' || e.plan_cancelled_at) return [];
  return sessionsBetween(tx, e.group_id, e.current_period_end!, addMonth(e.current_period_end!));
}

/** Every session the seat covers: the paid period, plus the next one for a live recurring plan. */
export async function seatSessions(tx: Tx, e: EnrolmentRow): Promise<SessionTime[]> {
  return [...(await paidSessions(tx, e)), ...(await nextPeriodSessions(tx, e))];
}
