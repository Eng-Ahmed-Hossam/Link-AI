import { sql } from 'kysely';
import type { Tx } from '../platform/db';

export type Lang = 'ar' | 'en';
export interface GroupInfo {
  subject: { id: string; code: string; name: string };
  teacherName: string;
  centreName: string;
  centreId: string;
  teacherId: string;
}

/**
 * Display names for groups (subject, teacher, centre), read as the system AFTER the caller's
 * access was checked under RLS. Names only: no student or money data.
 */
export async function groupInfo(sys: Tx, groupIds: string[], lang: Lang) {
  const out = new Map<string, GroupInfo>();
  if (!groupIds.length) return out;
  const rows = await sys
    .selectFrom('market.groups as g')
    .innerJoin('ref.subjects as s', 's.id', 'g.subject_id')
    .innerJoin('org.teachers as t', 't.id', 'g.teacher_id')
    .innerJoin('org.centres as c', 'c.id', 'g.centre_id')
    .select([
      'g.id',
      'g.centre_id',
      'g.teacher_id',
      's.id as subject_id',
      's.code',
      's.name_en',
      's.name_ar',
      't.display_name',
      'c.name as centre',
    ])
    .where('g.id', 'in', [...new Set(groupIds)])
    .execute();
  for (const r of rows)
    out.set(r.id, {
      subject: { id: r.subject_id, code: r.code, name: lang === 'en' ? r.name_en : r.name_ar },
      teacherName: r.display_name,
      centreName: r.centre,
      centreId: r.centre_id,
      teacherId: r.teacher_id,
    });
  return out;
}

/** Hall names per session (its one-off hall, else the booking's). */
export async function hallNames(sys: Tx, sessionIds: string[]) {
  const out = new Map<string, string | null>();
  if (!sessionIds.length) return out;
  const { rows } = await sql<{ id: string; name: string | null }>`
    SELECT s.id, r.name FROM market.group_sessions s
    LEFT JOIN market.rooms r ON r.id = market.session_room(s)
    WHERE s.id = ANY (${[...new Set(sessionIds)]}::uuid[])`.execute(sys);
  for (const r of rows) out.set(r.id, r.name);
  return out;
}

/** Room names by ID (for the change log). */
export async function roomNames(sys: Tx, roomIds: (string | null)[]) {
  const ids = [...new Set(roomIds.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const rows = await sys
    .selectFrom('market.rooms')
    .select(['id', 'name'])
    .where('id', 'in', ids)
    .execute();
  for (const r of rows) out.set(r.id, r.name);
  return out;
}

/** Session start times by ID. */
export async function sessionStarts(sys: Tx, ids: (string | null)[]) {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, Date>();
  if (!want.length) return out;
  const rows = await sys
    .selectFrom('market.group_sessions')
    .select(['id', 'starts_at'])
    .where('id', 'in', want)
    .execute();
  for (const r of rows) out.set(r.id, r.starts_at);
  return out;
}

/** Topic names by ID (from the public topic maps). */
export async function topicNames(tx: Tx, ids: string[], lang: Lang) {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const rows = await tx
    .selectFrom('ref.topic_template_nodes')
    .select(['id', 'name_en', 'name_ar'])
    .where('id', 'in', [...new Set(ids)])
    .execute();
  for (const r of rows) out.set(r.id, lang === 'en' ? r.name_en : r.name_ar);
  return out;
}

/** The Monday of the current week in Cairo, as YYYY-MM-DD. */
export function cairoMonday(now = new Date()) {
  const day = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
  const dow = (day.getDay() + 6) % 7; // Monday = 0
  day.setDate(day.getDate() - dow);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${day.getFullYear()}-${p(day.getMonth() + 1)}-${p(day.getDate())}`;
}
