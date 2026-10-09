import { sql } from 'kysely';
import type { Tx } from '../platform/db';
import { cairoToday } from '../platform/time';
import { type RuleCode, ruleText } from './rules';
import { type Lang, groupsInfo, namesOf, ref } from './world';

/**
 * Response builders shared by the follow-up endpoints (records, flags, cases), read on the SYSTEM
 * transaction for IDs the caller was already allowed to see.
 */
type Rows<T> = T[];
const num = (v: string | number | null) => (v == null ? null : Number(v));

export async function signalSummaries(sys: Tx, signalIds: string[], lang: Lang) {
  if (!signalIds.length) return [];
  const rows = await sys
    .selectFrom('followup.signals as s')
    .leftJoin('followup.cases as c', 'c.signal_id', 's.id')
    .select([
      's.id',
      's.student_id',
      's.rule_code',
      's.rule_version',
      's.explanation_en',
      's.explanation_ar',
      's.status',
      'c.id as case_id',
      's.raised_at',
    ])
    .where('s.id', 'in', signalIds)
    .orderBy('s.raised_at')
    .execute();
  const names = await namesOf(
    sys,
    rows.map((r) => r.student_id),
  );
  return rows.map((r) => ({
    id: r.id,
    student: ref(names, r.student_id),
    rule: r.rule_code as RuleCode,
    ruleVersion: r.rule_version,
    explanation: lang === 'ar' ? r.explanation_ar : r.explanation_en,
    status: r.status as 'open' | 'case_opened' | 'dismissed' | 'resolved_by_correction',
    caseId: r.case_id,
  }));
}

/** Open flags (open or with a case) of students, optionally in one group. */
export async function openFlagIds(sys: Tx, studentIds: string[], groupId?: string) {
  if (!studentIds.length) return [];
  let q = sys
    .selectFrom('followup.signals')
    .select(['id', 'student_id'])
    .where('student_id', 'in', studentIds)
    .where('status', 'in', ['open', 'case_opened']);
  if (groupId) q = q.where('group_id', '=', groupId);
  return q.execute();
}

/** Full signals: the evidence records, the rule text as it stood, the group (BR-APR-04). */
export async function signals(sys: Tx, ids: string[], lang: Lang) {
  if (!ids.length) return new Map<string, ReturnType<typeof Object>>();
  const summaries = await signalSummaries(sys, ids, lang);
  const rows = await sys
    .selectFrom('followup.signals')
    .select([
      'id',
      'group_id',
      'student_id',
      'evidence',
      'params',
      'rule_code',
      'rule_version',
      'raised_at',
    ])
    .where('id', 'in', ids)
    .execute();
  const groups = await groupsInfo(
    sys,
    rows.map((r) => r.group_id),
  );
  const recordIds = rows.flatMap((r) => (r.evidence as { recordIds: string[] }).recordIds);
  const recs = recordIds.length
    ? await sql<{
        record_id: string;
        student_id: string;
        session_date: string;
        attendance: string;
        confirmed_by: string;
      }>`
        SELECT r.id AS record_id, e.student_id, r.session_date::text, e.attendance, r.confirmed_by
        FROM records.session_records r JOIN records.record_entries e ON e.session_record_id = r.id
        WHERE r.id = ANY (${recordIds}::uuid[])`.execute(sys)
    : { rows: [] };
  const names = await namesOf(
    sys,
    recs.rows.map((r) => r.confirmed_by),
  );
  const out = new Map<string, unknown>();
  for (const r of rows) {
    const s = summaries.find((x) => x.id === r.id)!;
    const g = groups.get(r.group_id);
    const ev = (r.evidence as { recordIds: string[] }).recordIds;
    out.set(r.id, {
      ...s,
      group: { id: r.group_id, name: g ? g.name[lang] : '' },
      evidence: recs.rows
        .filter((x) => ev.includes(x.record_id) && x.student_id === r.student_id)
        .sort((a, b) => a.session_date.localeCompare(b.session_date))
        .map((x) => ({
          recordId: x.record_id,
          sessionDate: x.session_date,
          attendance: x.attendance as 'present' | 'absent' | 'late' | 'not_recorded',
          confirmedBy: ref(names, x.confirmed_by),
        })),
      ruleText: ruleText(
        r.rule_code as RuleCode,
        r.params as Record<string, number>,
        lang,
        r.rule_version,
      ),
      raisedAt: r.raised_at.toISOString(),
    });
  }
  return out;
}

const OPEN = ['open', 'in_progress', 'awaiting_confirmation'];
export const caseOverdue = (c: { status: string; due_on: string }, attempts: number) =>
  OPEN.includes(c.status) && c.due_on < cairoToday() && attempts === 0;

/** FollowupCase DTOs (A02, A03), in the order of `ids`. */
export async function cases(sys: Tx, ids: string[], lang: Lang) {
  if (!ids.length) return [];
  const rows = await sys
    .selectFrom('followup.cases')
    .select([
      'id',
      'signal_id',
      'student_id',
      'assignee_id',
      'status',
      'dismiss_reason',
      'centre_id',
      sql<string>`due_on::text`.as('due_on'),
    ])
    .where('id', 'in', ids)
    .execute();
  const sigs = await signals(
    sys,
    rows.map((r) => r.signal_id),
    lang,
  );
  const attempts = await sys
    .selectFrom('followup.case_attempts')
    .selectAll()
    .where('case_id', 'in', ids)
    .orderBy('created_at')
    .execute();
  const events = await sys
    .selectFrom('followup.case_events')
    .selectAll()
    .where('case_id', 'in', ids)
    .orderBy('created_at')
    .execute();
  const msgs = await sys
    .selectFrom('messaging.messages')
    .select(['id', 'case_id'])
    .where('case_id', 'in', ids)
    .orderBy('created_at')
    .execute();
  const roles = await sys
    .selectFrom('identity.role_assignments')
    .select(['user_id', 'centre_id', 'role'])
    .where('centre_id', 'in', [...new Set(rows.map((r) => r.centre_id))])
    .where('status', '=', 'active')
    .execute();
  const names = await namesOf(sys, [
    ...rows.flatMap((r) => [r.student_id, r.assignee_id]),
    ...attempts.map((a) => a.created_by),
    ...events.map((e) => e.actor_id),
  ]);
  const title = (userId: string, centreId: string) => {
    const r = roles.find((x) => x.user_id === userId && x.centre_id === centreId)?.role;
    return r === 'centre_owner'
      ? lang === 'ar'
        ? 'المالك'
        : 'Owner'
      : lang === 'ar'
        ? 'الاستقبال'
        : 'Reception';
  };
  const byId = new Map(
    rows.map((c) => {
      const att = attempts.filter((a) => a.case_id === c.id);
      return [
        c.id,
        {
          id: c.id,
          signal: sigs.get(c.signal_id) as never,
          student: ref(names, c.student_id),
          assignee: { ...ref(names, c.assignee_id), role: title(c.assignee_id, c.centre_id) },
          status: c.status as
            'open' | 'in_progress' | 'awaiting_confirmation' | 'resolved' | 'dismissed',
          dueOn: c.due_on,
          // FUP-CAS-05: past due with no outcome recorded.
          overdue: caseOverdue(c, att.length),
          dismissReason: c.dismiss_reason,
          attempts: att.map((a) => ({
            id: a.id,
            channel: a.channel as 'phone' | 'whatsapp' | 'whatsapp_manual' | 'sms' | 'meeting',
            result: a.result as
              'reached' | 'no_answer' | 'wrong_number' | 'message_sent' | 'replied',
            learned: a.learned,
            nextAction: a.next_action,
            followUpOn: a.follow_up_on ? String(a.follow_up_on).slice(0, 10) : null,
            messageId: a.message_id,
            createdBy: ref(names, a.created_by),
            at: a.created_at.toISOString(),
          })),
          messageIds: msgs.filter((m) => m.case_id === c.id).map((m) => m.id),
          timeline: events
            .filter((e) => e.case_id === c.id)
            .map((e) => ({
              at: e.created_at.toISOString(),
              kind: e.kind,
              text: lang === 'ar' ? e.text_ar : e.text_en,
              actor: e.actor_id ? ref(names, e.actor_id) : null,
            })),
        },
      ];
    }),
  );
  return ids.map((id) => byId.get(id)!).filter(Boolean);
}

/** SessionRecord DTOs with their corrections, flags and correction requests (T05, A14). */
export async function records(sys: Tx, ids: string[], lang: Lang) {
  if (!ids.length) return [];
  const recs = await sys
    .selectFrom('records.session_records as r')
    .innerJoin('market.group_sessions as s', 's.id', 'r.group_session_id')
    .select([
      'r.id',
      'r.group_id',
      'r.group_session_id',
      sql<string>`r.session_date::text`.as('session_date'),
      's.starts_at',
      'r.status',
      'r.source',
      'r.group_observation',
      'r.confirmed_by',
      'r.confirmed_at',
      'r.created_at',
    ])
    .where('r.id', 'in', ids)
    .execute();
  const entries = await sys
    .selectFrom('records.record_entries')
    .selectAll()
    .where('session_record_id', 'in', ids)
    .execute();
  const assessments = await sys
    .selectFrom('records.assessments')
    .selectAll()
    .where('session_record_id', 'in', ids)
    .execute();
  const corrections = await sys
    .selectFrom('records.corrections')
    .selectAll()
    .where('session_record_id', 'in', ids)
    .orderBy('created_at')
    .execute();
  const requests = await sys
    .selectFrom('records.correction_requests')
    .selectAll()
    .where('session_record_id', 'in', ids)
    .orderBy('created_at')
    .execute();
  const { rows: sigRows } = await sql<{ id: string; record_id: string }>`
    SELECT s.id, x.record_id FROM followup.signals s,
      LATERAL jsonb_array_elements_text(s.evidence -> 'recordIds') AS x(record_id)
    WHERE x.record_id = ANY (${ids}::text[])`.execute(sys);
  const sigs = await signalSummaries(sys, [...new Set(sigRows.map((r) => r.id))], lang);
  const groups = await groupsInfo(
    sys,
    recs.map((r) => r.group_id),
  );
  const names = await namesOf(sys, [
    ...entries.map((e) => e.student_id),
    ...recs.map((r) => r.confirmed_by),
    ...corrections.map((c) => c.corrected_by),
    ...requests.flatMap((q) => [q.requested_by, q.student_id]),
  ]);
  const order = new Map(ids.map((id, i) => [id, i]));
  return recs
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
    .map((r) => {
      const a = assessments.find((x) => x.session_record_id === r.id);
      const es = entries
        .filter((e) => e.session_record_id === r.id)
        .map((e) => ({ e, name: names.get(e.student_id) ?? '' }))
        .sort((x, y) => x.name.localeCompare(y.name, 'ar'));
      return {
        id: r.id,
        groupId: r.group_id,
        groupSessionId: r.group_session_id,
        sessionDate: r.session_date,
        startsAt: r.starts_at.toISOString(),
        status: r.status as 'draft' | 'confirmed',
        source: r.source as 'tap' | 'voice' | 'mixed',
        assessment: a
          ? { id: a.id, title: a.title, series: a.series, maxScore: Number(a.max_score) }
          : null,
        entries: es.map(({ e }) => ({
          id: e.id,
          student: ref(names, e.student_id),
          attendance: e.attendance as 'present' | 'absent' | 'late' | 'not_recorded',
          lateMinutes: e.late_minutes,
          score: num(e.score),
          participation: e.participation as 'low' | 'normal' | 'high' | 'not_recorded',
          observation: e.observation,
          observationTag: e.observation_tag as never,
          source: e.source as 'tap' | 'voice',
        })),
        groupObservation: r.group_observation,
        confirmedBy: r.confirmed_by ? ref(names, r.confirmed_by) : null,
        confirmedAt: r.confirmed_at?.toISOString() ?? null,
        createdAt: r.created_at.toISOString(),
        corrections: corrections
          .filter((c) => c.session_record_id === r.id)
          .map((c) => ({
            id: c.id,
            entryId: c.record_entry_id,
            student: ref(names, c.student_id),
            field: c.field as 'attendance' | 'score' | 'participation' | 'observation',
            oldValue: c.old_value,
            newValue: c.new_value,
            reason: c.reason,
            author: ref(names, c.corrected_by),
            at: c.created_at.toISOString(),
          })),
        signals: sigs.filter((s) => sigRows.some((x) => x.id === s.id && x.record_id === r.id)),
        correctionRequests: requests
          .filter((q) => q.session_record_id === r.id)
          .map((q) =>
            correctionRequestDto(
              q,
              r.session_date,
              groups.get(r.group_id)?.name[lang] ?? '',
              names,
            ),
          ),
      };
    });
}

export function correctionRequestDto(
  q: {
    id: string;
    session_record_id: string;
    group_id: string;
    student_id: string | null;
    text: string;
    requested_by: string;
    created_at: Date;
    status: string;
  },
  sessionDate: string,
  groupName: string,
  names: Map<string, string>,
) {
  return {
    id: q.id,
    recordId: q.session_record_id,
    groupId: q.group_id,
    groupName,
    sessionDate,
    student: q.student_id ? ref(names, q.student_id) : null,
    text: q.text,
    requestedBy: ref(names, q.requested_by),
    at: q.created_at.toISOString(),
    status: q.status as 'open' | 'done',
  };
}

export type RecordDto = Awaited<ReturnType<typeof records>>[number];
export type CaseDto = Awaited<ReturnType<typeof cases>>[number];
export type { Rows };
