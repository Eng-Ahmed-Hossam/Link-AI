import { sql } from 'kysely';
import type { RlsContext, Tx } from '../platform/db';
import { FLAG, centreFlag } from '../platform/flags';
import { Problem, notFound } from '../platform/problem';
import { cairoToday } from '../platform/time';

/**
 * The follow-up world, read from the marketplace (R3): a follow-up group is a group at a centre
 * with the Follow-up extra on (OD-58); its roster is the paid seats (BR-ENR-07); the students of
 * one session are the paid seats that cover it (BR-ENR-13). Every helper runs on a SYSTEM
 * transaction AFTER the caller's access was checked with RLS (see `access.ts`), and is scoped by
 * the IDs that check returned — never by anything the client sent unchecked.
 */
export type Lang = 'ar' | 'en';
export type Bi = { en: string; ar: string };
export const pick = (b: Bi, lang: Lang) => b[lang];
export const person = (id: string, displayName: string) => ({ id, displayName });

export interface GroupInfo {
  id: string;
  centreId: string;
  teacherId: string;
  teacherUserId: string;
  teacherName: string;
  name: Bi;
  subject: Bi;
  weekdays: number[];
  startTime: string;
  endTime: string;
  status: string;
}

export async function groupsInfo(sys: Tx, ids: string[]): Promise<Map<string, GroupInfo>> {
  if (!ids.length) return new Map();
  const rows = await sys
    .selectFrom('market.groups as g')
    .innerJoin('org.teachers as t', 't.id', 'g.teacher_id')
    .innerJoin('ref.subjects as s', 's.id', 'g.subject_id')
    .innerJoin('ref.school_years as y', 'y.id', 'g.school_year_id')
    .select([
      'g.id',
      'g.centre_id',
      'g.teacher_id',
      't.user_id',
      't.display_name',
      'g.weekdays',
      sql<string>`to_char(g.start_time, 'HH24:MI')`.as('start_time'),
      sql<string>`to_char(g.end_time, 'HH24:MI')`.as('end_time'),
      'g.status',
      's.name_en',
      's.name_ar',
      'y.short_name_en',
      'y.short_name_ar',
      'y.name_en as year_en',
      'y.name_ar as year_ar',
    ])
    .where('g.id', 'in', [...new Set(ids)])
    .execute();
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        centreId: r.centre_id,
        teacherId: r.teacher_id,
        teacherUserId: r.user_id,
        teacherName: r.display_name,
        // "Sec 2 · Maths" / "٢ ثانوي · رياضيات", as the mock's opened groups are named.
        name: {
          en: `${r.short_name_en ?? r.year_en} · ${r.name_en}`,
          ar: `${r.short_name_ar ?? r.year_ar} · ${r.name_ar}`,
        },
        subject: { en: r.name_en, ar: r.name_ar },
        weekdays: r.weekdays,
        startTime: r.start_time,
        endTime: r.end_time,
        status: r.status,
      },
    ]),
  );
}

export async function groupInfo(sys: Tx, id: string) {
  const g = (await groupsInfo(sys, [id])).get(id);
  if (!g) throw notFound('group');
  return g;
}

export interface SessionRow {
  id: string;
  groupId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

/**
 * Sessions of groups, oldest first. `past` = the ones that took place or are today (Cairo); a
 * cancelled or "did not take place" session is never recordable (OD-44).
 */
export async function sessionsOf(
  sys: Tx,
  groupIds: string[],
  which: 'past' | 'all' = 'past',
  today = cairoToday(),
): Promise<SessionRow[]> {
  if (!groupIds.length) return [];
  const { rows } = await sql<{
    id: string;
    group_id: string;
    day: string;
    starts_at: Date;
    ends_at: Date;
    status: string;
  }>`
    SELECT id, group_id, market.session_day(starts_at)::text AS day, starts_at, ends_at, status
    FROM market.group_sessions
    WHERE group_id = ANY (${groupIds}::uuid[]) AND status NOT IN ('cancelled', 'not_held')
      AND (${which} = 'all' OR market.session_day(starts_at) <= ${today}::date)
    ORDER BY starts_at`.execute(sys);
  return rows.map((r) => ({
    id: r.id,
    groupId: r.group_id,
    date: r.day,
    startsAt: r.starts_at.toISOString(),
    endsAt: r.ends_at.toISOString(),
    status: r.status,
  }));
}

/** The paid seats that cover one session (its roster), in name order. */
export async function sessionStudents(sys: Tx, sessionId: string) {
  const { rows } = await sql<{ student_id: string; display_name: string }>`
    SELECT DISTINCT ON (st.id) st.id AS student_id, st.display_name
    FROM market.group_sessions s
    JOIN market.enrolments e ON e.group_id = s.group_id
    JOIN org.students st ON st.id = e.student_id
    WHERE s.id = ${sessionId} AND e.status IN ('confirmed', 'past_due', 'ended')
      AND market.covers(e, s.id, market.session_day(s.starts_at))
    ORDER BY st.id`.execute(sys);
  return rows
    .map((r) => ({ id: r.student_id, name: r.display_name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

/** Students with a live paid seat in the groups now (T10, A13): confirmed or past due. */
export async function groupMembers(sys: Tx, groupIds: string[]) {
  if (!groupIds.length) return [];
  const { rows } = await sql<{
    group_id: string;
    student_id: string;
    display_name: string;
    guardian_id: string;
  }>`
    SELECT DISTINCT ON (e.group_id, e.student_id) e.group_id, e.student_id, st.display_name, e.guardian_id
    FROM market.enrolments e JOIN org.students st ON st.id = e.student_id
    WHERE e.group_id = ANY (${groupIds}::uuid[]) AND e.status IN ('confirmed', 'past_due')
    ORDER BY e.group_id, e.student_id, e.created_at DESC`.execute(sys);
  return rows
    .map((r) => ({
      groupId: r.group_id,
      studentId: r.student_id,
      name: r.display_name,
      guardianId: r.guardian_id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

/** Display names for people: students, users and teachers (stored once, never translated). */
export async function namesOf(sys: Tx, ids: (string | null | undefined)[]) {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (!want.length) return out;
  for (const r of await sys
    .selectFrom('org.students')
    .select(['id', 'display_name'])
    .where('id', 'in', want)
    .execute())
    out.set(r.id, r.display_name);
  for (const r of await sys
    .selectFrom('identity.users')
    .select(['id', 'name', 'phone_last4'])
    .where('id', 'in', want)
    .execute())
    out.set(r.id, r.name ?? `•••• ${r.phone_last4 ?? ''}`.trim());
  return out;
}

export const ref = (names: Map<string, string>, id: string) => person(id, names.get(id) ?? '—');

/** Is the Follow-up extra on for this centre (OD-58)? Read per request, never cached. */
export const extraOn = (sys: Tx, centreId: string) => centreFlag(sys, FLAG.followupExtra, centreId);

export const EXTRA_OFF = () =>
  new Problem(
    403,
    'extra_not_enabled',
    'Follow-up is a paid extra and it is not switched on for this centre.',
  );

export async function requireExtra(sys: Tx, centreId: string) {
  if (!(await extraOn(sys, centreId))) throw EXTRA_OFF();
}

/** Centres among `ids` with the extra on. */
export async function centresWithExtra(sys: Tx, ids: string[]) {
  const out: string[] = [];
  for (const id of [...new Set(ids)]) if (await extraOn(sys, id)) out.push(id);
  return out;
}

/** Who the caller is to a centre, for follow-up permissions (10 §1). */
export const roleAt = (ctx: RlsContext, centreId: string) =>
  ctx.ownerCentreIds.includes(centreId)
    ? ('owner' as const)
    : ctx.centreIds.includes(centreId)
      ? ('staff' as const)
      : null;

/** Owners hold every permission; staff what the owner gave them (cases.manage, messages.approve…). */
export const hasPerm = (ctx: RlsContext, centreId: string, perm: string) =>
  ctx.ownerCentreIds.includes(centreId) || (ctx.permissions[centreId]?.includes(perm) ?? false);

const AR_DIGITS = new Intl.NumberFormat('ar-EG');
export const arNum = (n: number) => AR_DIGITS.format(n);
/** "24 September" / "٢٤ سبتمبر" (dates are Cairo days). */
export function fmtDate(date: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB-u-nu-latn', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}
export const maskPhone = (e164: string | null) =>
  e164 ? `${e164.slice(0, 3)} ${e164.slice(3, 5)} •••• ${e164.slice(-4)}` : '—';
