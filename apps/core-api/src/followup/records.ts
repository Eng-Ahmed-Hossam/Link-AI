import { sql } from 'kysely';
import { writeAudit } from '../platform/audit';
import { type Database, type RlsContext, type Tx } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import { enqueue } from '../platform/outbox';
import { Problem, forbidden, notFound } from '../platform/problem';
import { cairoToday } from '../platform/time';
import * as dto from './dto';
import { evaluate } from './rules';
import {
  type GroupInfo,
  type Lang,
  centresWithExtra,
  fmtDate,
  groupInfo,
  groupMembers,
  groupsInfo,
  hasPerm,
  namesOf,
  person,
  ref,
  requireExtra,
  roleAt,
  sessionStudents,
  sessionsOf,
} from './world';

const NOTE_TAGS = ['understanding', 'needs_revisit', 'behaviour', 'positive', 'absence_context'];

interface EntryIn {
  studentId: string;
  attendance: 'present' | 'absent' | 'late' | 'not_recorded';
  lateMinutes?: number | null;
  score?: number | null;
  participation?: 'low' | 'normal' | 'high' | 'not_recorded';
  observation?: string | null;
  observationTag?: string | null;
  source?: 'tap' | 'voice';
}

/**
 * Session records, corrections, correction requests and notes (FUP-REC, R3). The caller's access
 * is checked under RLS first (the record or group must be visible to them: their own group as the
 * teacher, or their centre as staff); the work then runs as the system, in one transaction with
 * its audit row and outbox event. Only the group's teacher writes records (BR-APR-01).
 */
export class Records {
  constructor(private readonly db: Database) {}

  // ── access ─────────────────────────────────────────────────────────────────────
  /** The group, if the caller may see it (teacher of it, or staff of its centre). 404 otherwise. */
  async groupAccess(userId: string, groupId: string) {
    return this.db.asUser(userId, async (tx, ctx) => {
      const g = await tx
        .selectFrom('market.groups')
        .select(['id', 'centre_id', 'teacher_id'])
        .where('id', '=', groupId)
        .where((w) =>
          w.or([
            w('teacher_id', '=', ctx.teacherId ?? '00000000-0000-0000-0000-000000000000'),
            w(
              'centre_id',
              'in',
              ctx.centreIds.length ? ctx.centreIds : ['00000000-0000-0000-0000-000000000000'],
            ),
          ]),
        )
        .executeTakeFirst();
      if (!g) throw notFound('group');
      return { ctx, group: g, isTeacher: g.teacher_id === ctx.teacherId };
    });
  }

  /** A record visible to the caller under RLS (TEACHER or CENTRE policy). 404 otherwise. */
  async recordAccess(userId: string, recordId: string) {
    return this.db.asUser(userId, async (tx, ctx) => {
      const r = await tx
        .selectFrom('records.session_records')
        .selectAll()
        .where('id', '=', recordId)
        .executeTakeFirst();
      if (!r) throw notFound('record');
      return { ctx, record: r, isTeacher: r.teacher_id === ctx.teacherId };
    });
  }

  private canRead(ctx: RlsContext, centreId: string, isTeacher: boolean) {
    if (isTeacher) return;
    if (!roleAt(ctx, centreId) || !hasPerm(ctx, centreId, 'records.read'))
      throw forbidden('You need the records.read permission at this centre.');
  }
  private mustTeach(isTeacher: boolean) {
    if (!isTeacher) throw forbidden('Only the group’s teacher records sessions.');
  }

  // ── T01 Today ──────────────────────────────────────────────────────────────────
  async teacherToday(userId: string, lang: Lang) {
    const ctx = await this.db.asUser(userId, async (_tx, c) => c);
    if (!ctx.teacherId) throw forbidden('Teachers only.');
    const teacherId = ctx.teacherId;
    return this.db.asSystem(async (sys) => {
      const groups = await this.followupGroupsOf(sys, teacherId);
      if (!groups.length) {
        // No centre the teacher works at has the extra: refuse (07 §2b, OD-58).
        const any = await sys
          .selectFrom('market.groups')
          .select('id')
          .where('teacher_id', '=', teacherId)
          .executeTakeFirst();
        if (any)
          throw new Problem(403, 'extra_not_enabled', 'Follow-up is not on for your centres.');
      }
      const ids = groups.map((g) => g.id);
      const info = await groupsInfo(sys, ids);
      const name = (id: string) => info.get(id)?.name[lang] ?? '';
      const all = await sessionsOf(sys, ids, 'all');
      const today = cairoToday();
      const now = Date.now();
      const past = all.filter((s) => s.date <= today);
      const recs = await this.recordsBySession(
        sys,
        past.map((s) => s.id),
      );
      const counts = new Map<string, number>();
      for (const g of ids) counts.set(g, (await groupMembers(sys, [g])).length);
      const next = all.find((s) => Date.parse(s.endsAt) > now) ?? null;
      // Reminders only from CONFIRMED observations, each with its source (FUP-REC-01 AC1).
      const { rows: reminders } = await sql<{
        id: string;
        session_date: string;
        observation: string;
        student_id: string;
      }>`
        SELECT r.id, r.session_date::text, e.observation, e.student_id
        FROM records.session_records r JOIN records.record_entries e ON e.session_record_id = r.id
        WHERE r.group_id = ANY (${ids}::uuid[]) AND r.status = 'confirmed'
          AND e.observation_tag = 'needs_revisit' AND e.observation IS NOT NULL
          AND r.id IN (SELECT id FROM records.session_records WHERE group_id = ANY (${ids}::uuid[])
                       AND status = 'confirmed' ORDER BY session_date DESC LIMIT 2)
        ORDER BY r.session_date DESC`.execute(sys);
      const names = await namesOf(sys, [userId, ...reminders.map((r) => r.student_id)]);
      // The record due: the latest session that took place without a confirmed record.
      const latestPer = ids
        .map((g) => past.filter((s) => s.groupId === g).at(-1))
        .filter((s): s is NonNullable<typeof s> => !!s && recs.get(s.id)?.status !== 'confirmed')
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
      const due = latestPer[0];
      const needsYou: {
        kind: 'draft' | 'missing';
        groupId: string;
        groupName: string;
        sessionId: string;
        sessionDate: string;
        recordId: string | null;
      }[] = [];
      for (const g of ids) {
        const p = past.filter((s) => s.groupId === g);
        const last = p.at(-1);
        for (const s of [...p.slice(-6, -1), ...(last && last.id !== due?.id ? [last] : [])]) {
          const r = recs.get(s.id);
          if (r?.status === 'confirmed') continue;
          needsYou.push({
            kind: r ? 'draft' : 'missing',
            groupId: g,
            groupName: name(g),
            sessionId: s.id,
            sessionDate: s.date,
            recordId: r?.id ?? null,
          });
        }
      }
      needsYou.sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
      const requests = await sys
        .selectFrom('records.correction_requests as q')
        .innerJoin('records.session_records as r', 'r.id', 'q.session_record_id')
        .selectAll('q')
        .select(sql<string>`r.session_date::text`.as('session_date'))
        .where('q.group_id', 'in', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
        .where('q.status', '=', 'open')
        .orderBy('q.created_at')
        .execute();
      const qNames = await namesOf(
        sys,
        requests.flatMap((q) => [q.requested_by, q.student_id]),
      );
      return {
        teacher: ref(names, userId),
        nextSession: next
          ? {
              groupId: next.groupId,
              groupName: name(next.groupId),
              sessionId: next.id,
              startsAt: next.startsAt,
              studentCount: counts.get(next.groupId) ?? 0,
            }
          : null,
        reminders: reminders.map((r) => ({
          text: r.observation,
          student: ref(names, r.student_id),
          source: { recordId: r.id, sessionDate: r.session_date },
        })),
        recordDue: due
          ? {
              groupId: due.groupId,
              groupName: name(due.groupId),
              sessionId: due.id,
              sessionDate: due.date,
              startsAt: due.startsAt,
              endsAt: due.endsAt,
              studentCount: (await sessionStudents(sys, due.id)).length,
              recordId: recs.get(due.id)?.id ?? null,
            }
          : null,
        needsYou,
        correctionRequests: requests.map((q) =>
          dto.correctionRequestDto(q, q.session_date, name(q.group_id), qNames),
        ),
      };
    });
  }

  /** The teacher's groups at centres with the Follow-up extra (published or closed). */
  async followupGroupsOf(sys: Tx, teacherId: string) {
    const gs = await sys
      .selectFrom('market.groups')
      .select(['id', 'centre_id'])
      .where('teacher_id', '=', teacherId)
      .orderBy('created_at')
      .execute();
    const on = await centresWithExtra(
      sys,
      gs.map((g) => g.centre_id),
    );
    return gs.filter((g) => on.includes(g.centre_id));
  }

  /** T09's follow-up part per group (null when the group's centre has no extra). */
  async summaries(sys: Tx, groupIds: string[]) {
    const out = new Map<
      string,
      {
        studentCount: number;
        recordsComplete: { confirmed: number; eligible: number };
        openFollowUps: number;
      } | null
    >();
    const info = await groupsInfo(sys, groupIds);
    const on = await centresWithExtra(
      sys,
      [...info.values()].map((g) => g.centreId),
    );
    for (const id of groupIds) {
      const g = info.get(id);
      if (!g || !on.includes(g.centreId)) {
        out.set(id, null);
        continue;
      }
      const recent = (await sessionsOf(sys, [id])).slice(-7);
      const recs = await this.recordsBySession(
        sys,
        recent.map((s) => s.id),
      );
      const open = await sys
        .selectFrom('followup.cases')
        .select(sql<number>`count(*)::int`.as('n'))
        .where('group_id', '=', id)
        .where('status', 'in', ['open', 'in_progress', 'awaiting_confirmation'])
        .executeTakeFirstOrThrow();
      out.set(id, {
        studentCount: (await groupMembers(sys, [id])).length,
        recordsComplete: {
          confirmed: recent.filter((s) => recs.get(s.id)?.status === 'confirmed').length,
          eligible: recent.length,
        },
        openFollowUps: open.n,
      });
    }
    return out;
  }

  async recordsBySession(sys: Tx, sessionIds: string[]) {
    if (!sessionIds.length) return new Map<string, { id: string; status: string }>();
    const rows = await sys
      .selectFrom('records.session_records')
      .select(['id', 'status', 'group_session_id'])
      .where('group_session_id', 'in', sessionIds)
      .execute();
    return new Map(rows.map((r) => [r.group_session_id, { id: r.id, status: r.status }]));
  }

  // ── T10 roster ─────────────────────────────────────────────────────────────────
  async roster(userId: string, groupId: string, lang: Lang) {
    const { ctx, group, isTeacher } = await this.groupAccess(userId, groupId);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, group.centre_id);
      this.canRead(ctx, group.centre_id, isTeacher);
      const members = await groupMembers(sys, [groupId]);
      const last4 = (await sessionsOf(sys, [groupId])).slice(-4);
      const confirmed = await this.confirmedEntries(sys, groupId);
      const flags = await dto.openFlagIds(
        sys,
        members.map((m) => m.studentId),
        groupId,
      );
      const summaries = await dto.signalSummaries(
        sys,
        flags.map((f) => f.id),
        lang,
      );
      const notes = await sys
        .selectFrom('records.notes')
        .select(['student_id', sql<number>`count(*)::int`.as('n')])
        .where('group_id', '=', groupId)
        .groupBy('student_id')
        .execute();
      return members.map((m) => {
        const mine = confirmed.filter((e) => e.student_id === m.studentId);
        const scored = mine.filter((e) => e.score != null && e.max_score != null).at(-1);
        return {
          student: person(m.studentId, m.name),
          lastSessions: last4.map(
            (s) =>
              (mine.find((e) => e.group_session_id === s.id)?.attendance ?? 'none') as
                'present' | 'absent' | 'late' | 'not_recorded' | 'none',
          ),
          latestScore: scored
            ? {
                score: Number(scored.score),
                maxScore: Number(scored.max_score),
                title: scored.title ?? '',
              }
            : null,
          noteCount:
            (notes.find((n) => n.student_id === m.studentId)?.n ?? 0) +
            mine.filter((e) => e.observation).length,
          flags: summaries.filter((s) => s.student.id === m.studentId),
        };
      });
    });
  }

  private async confirmedEntries(sys: Tx, groupId: string) {
    const { rows } = await sql<{
      record_id: string;
      group_session_id: string;
      session_date: string;
      student_id: string;
      attendance: string;
      score: string | null;
      max_score: string | null;
      title: string | null;
      series: string | null;
      observation: string | null;
      observation_tag: string | null;
      confirmed_by: string;
      confirmed_at: Date;
    }>`
      SELECT r.id AS record_id, r.group_session_id, r.session_date::text, e.student_id, e.attendance,
             e.score::text, a.max_score::text, a.title, a.series, e.observation, e.observation_tag,
             r.confirmed_by, r.confirmed_at
      FROM records.session_records r
      JOIN records.record_entries e ON e.session_record_id = r.id
      LEFT JOIN records.assessments a ON a.id = e.assessment_id
      WHERE r.group_id = ${groupId} AND r.status = 'confirmed'
      ORDER BY r.session_date, r.confirmed_at`.execute(sys);
    return rows;
  }

  // ── Records ────────────────────────────────────────────────────────────────────
  async list(userId: string, groupId: string, lang: Lang) {
    const { ctx, group, isTeacher } = await this.groupAccess(userId, groupId);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, group.centre_id);
      this.canRead(ctx, group.centre_id, isTeacher);
      const ids = await sys
        .selectFrom('records.session_records')
        .select('id')
        .where('group_id', '=', groupId)
        .orderBy('session_date', 'desc')
        .execute();
      return dto.records(
        sys,
        ids.map((r) => r.id),
        lang,
      );
    });
  }

  async open(userId: string, groupId: string, sessionId: string, lang: Lang, requestId?: string) {
    const { group, isTeacher } = await this.groupAccess(userId, groupId);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, group.centre_id);
      this.mustTeach(isTeacher);
      const sess = (await sessionsOf(sys, [groupId])).find((s) => s.id === sessionId);
      if (!sess)
        throw new Problem(
          422,
          'session_not_recordable',
          'Only sessions that have taken place, or today’s, can be recorded.',
        );
      const existing = await sys
        .selectFrom('records.session_records')
        .select('id')
        .where('group_session_id', '=', sessionId)
        .executeTakeFirst();
      if (existing)
        return { created: false, record: (await dto.records(sys, [existing.id], lang))[0]! };
      const id = uuidv7();
      await sys
        .insertInto('records.session_records')
        .values({
          id,
          group_id: groupId,
          centre_id: group.centre_id,
          teacher_id: group.teacher_id,
          group_session_id: sessionId,
          session_date: sess.date,
          created_by: userId,
        })
        .execute();
      // Everyone on the session's roster starts "not recorded": nothing is pre-selected (FUP-REC-02).
      const roster = await sessionStudents(sys, sessionId);
      if (roster.length)
        await sys
          .insertInto('records.record_entries')
          .values(
            roster.map((s) => ({
              id: uuidv7(),
              session_record_id: id,
              centre_id: group.centre_id,
              student_id: s.id,
            })),
          )
          .execute();
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: group.centre_id,
        action: 'record.draft_created',
        objectType: 'session_record',
        objectRef: id,
        after: { groupId, sessionId, sessionDate: sess.date },
        requestId,
      });
      return { created: true, record: (await dto.records(sys, [id], lang))[0]! };
    });
  }

  async get(userId: string, id: string, lang: Lang) {
    const { ctx, record, isTeacher } = await this.recordAccess(userId, id);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, record.centre_id);
      this.canRead(ctx, record.centre_id, isTeacher);
      return (await dto.records(sys, [id], lang))[0]!;
    });
  }

  /** Check entries against the record's roster and its assessment (BR-APR-09: block, never cap). */
  private async validate(
    sys: Tx,
    recordId: string,
    entries: { studentId: string; attendance: string; score?: number | null }[],
    maxScore: number | null,
  ) {
    const roster = new Set(
      (
        await sys
          .selectFrom('records.record_entries')
          .select('student_id')
          .where('session_record_id', '=', recordId)
          .execute()
      ).map((r) => r.student_id),
    );
    for (const e of entries) {
      if (!roster.has(e.studentId))
        throw new Problem(422, 'unknown_student', 'A student is not on this roster.', {
          studentId: e.studentId,
        });
      if (e.score == null) continue;
      if (maxScore == null)
        throw new Problem(
          422,
          'assessment_required',
          'Name the assessment and its maximum before entering scores.',
        );
      if (e.attendance === 'absent')
        throw new Problem(
          422,
          'score_for_absent',
          'An absent student has no score. Absence is recorded separately.',
          { studentId: e.studentId },
        );
      if (!Number.isFinite(e.score) || e.score < 0 || e.score > maxScore)
        throw new Problem(
          422,
          'score_out_of_range',
          `${e.score} exceeds the maximum of ${maxScore}.`,
          { studentId: e.studentId, value: e.score, max: maxScore },
        );
    }
  }

  async saveDraft(
    userId: string,
    id: string,
    body: {
      assessment?: { title: string; series: string | null; maxScore: number } | null;
      entries: EntryIn[];
      groupObservation?: string | null;
    },
    lang: Lang,
  ) {
    const { record, isTeacher } = await this.recordAccess(userId, id);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, record.centre_id);
      this.mustTeach(isTeacher);
      const r = await sys
        .selectFrom('records.session_records')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (r.status === 'confirmed')
        throw new Problem(
          409,
          'record_confirmed',
          'This record is confirmed. Add a correction instead.',
        );
      const current = await sys
        .selectFrom('records.assessments')
        .selectAll()
        .where('session_record_id', '=', id)
        .executeTakeFirst();
      const a =
        body.assessment === undefined
          ? current
            ? { title: current.title, series: current.series, maxScore: Number(current.max_score) }
            : null
          : body.assessment;
      if (a && !(a.maxScore > 0))
        throw new Problem(422, 'validation_failed', 'The maximum must be above 0.');
      await this.validate(sys, id, body.entries ?? [], a ? a.maxScore : null);
      let assessmentId: string | null = current?.id ?? null;
      if (a && current)
        await sys
          .updateTable('records.assessments')
          .set({ title: a.title, series: a.series, max_score: String(a.maxScore) })
          .where('id', '=', current.id)
          .execute();
      else if (a) {
        assessmentId = uuidv7();
        await sys
          .insertInto('records.assessments')
          .values({
            id: assessmentId,
            group_id: r.group_id,
            centre_id: r.centre_id,
            session_record_id: id,
            title: a.title,
            series: a.series,
            max_score: String(a.maxScore),
            tagging_mode: 'whole_quiz',
            taken_on: r.session_date,
          })
          .execute();
      } else if (current && body.assessment === null) {
        // Removing the assessment clears its scores first.
        await sys
          .updateTable('records.record_entries')
          .set({ score: null, assessment_id: null })
          .where('session_record_id', '=', id)
          .execute();
        assessmentId = null;
      }
      for (const inp of body.entries ?? []) {
        const set: Record<string, unknown> = {
          attendance: inp.attendance,
          late_minutes: inp.attendance === 'late' ? (inp.lateMinutes ?? null) : null,
          score: inp.score == null ? null : String(inp.score),
          assessment_id: inp.score == null ? null : assessmentId,
        };
        if (inp.participation !== undefined) set.participation = inp.participation;
        if (inp.observation !== undefined) set.observation = inp.observation;
        if (inp.observationTag !== undefined) {
          if (inp.observationTag && !NOTE_TAGS.includes(inp.observationTag))
            throw new Problem(422, 'validation_failed', 'Unknown note topic.');
          set.observation_tag = inp.observationTag;
        }
        if (inp.source !== undefined) set.source = inp.source;
        await sys
          .updateTable('records.record_entries')
          .set(set)
          .where('session_record_id', '=', id)
          .where('student_id', '=', inp.studentId)
          .execute();
      }
      const entries = await sys
        .selectFrom('records.record_entries')
        .select(['attendance', 'score', 'source'])
        .where('session_record_id', '=', id)
        .execute();
      const sources = new Set(
        entries
          .filter((e) => e.attendance !== 'not_recorded' || e.score != null)
          .map((e) => e.source),
      );
      await sys
        .updateTable('records.session_records')
        .set({
          source: sources.size > 1 ? 'mixed' : sources.has('voice') ? 'voice' : 'tap',
          ...(body.groupObservation !== undefined
            ? { group_observation: body.groupObservation }
            : {}),
        })
        .where('id', '=', id)
        .execute();
      return (await dto.records(sys, [id], lang))[0]!;
    });
  }

  /**
   * Approval 1 (FUP-REC-05): the teacher confirms. The record, its audit row, the outbox event and
   * the rules' result commit together; the confirm's Idempotency-Key replays the same answer.
   */
  async confirm(
    userId: string,
    id: string,
    key: string | undefined,
    lang: Lang,
    requestId?: string,
  ) {
    const { record, isTeacher } = await this.recordAccess(userId, id);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, record.centre_id);
      this.mustTeach(isTeacher);
      const r = await sys
        .selectFrom('records.session_records')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (r.status === 'confirmed') {
        if (key && r.idempotency_key === key) return (await dto.records(sys, [id], lang))[0]!;
        throw new Problem(409, 'record_confirmed', 'This record is already confirmed.');
      }
      const unclear = await sys
        .selectFrom('records.voice_notes as v')
        .innerJoin('records.voice_extractions as x', 'x.voice_note_id', 'v.id')
        .select('x.id')
        .where('v.session_record_id', '=', id)
        .where('x.status', '=', 'clarification_needed')
        .executeTakeFirst();
      if (unclear)
        throw new Problem(
          409,
          'identity_unresolved',
          'Confirm which student was meant before saving.',
        );
      const a = await sys
        .selectFrom('records.assessments')
        .select('max_score')
        .where('session_record_id', '=', id)
        .executeTakeFirst();
      const entries = await sys
        .selectFrom('records.record_entries')
        .select(['student_id', 'attendance', 'score'])
        .where('session_record_id', '=', id)
        .execute();
      await this.validate(
        sys,
        id,
        entries.map((e) => ({
          studentId: e.student_id,
          attendance: e.attendance,
          score: e.score == null ? null : Number(e.score),
        })),
        a ? Number(a.max_score) : null,
      );
      const at = new Date();
      await sys
        .updateTable('records.session_records')
        .set({
          status: 'confirmed',
          confirmed_by: userId,
          confirmed_at: at,
          idempotency_key: key ?? null,
        })
        .where('id', '=', id)
        .execute();
      await sys
        .updateTable('records.voice_extractions')
        .set({ status: 'accepted' })
        .where(
          'voice_note_id',
          'in',
          sys.selectFrom('records.voice_notes').select('id').where('session_record_id', '=', id),
        )
        .execute();
      const sess = await sys
        .selectFrom('market.group_sessions')
        .select('ends_at')
        .where('id', '=', r.group_session_id)
        .executeTakeFirst();
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: r.centre_id,
        action: 'record.confirmed',
        objectType: 'session_record',
        objectRef: id,
        after: {
          groupId: r.group_id,
          sessionId: r.group_session_id,
          sessionDate: r.session_date,
          sessionEndsAt: sess?.ends_at.toISOString() ?? null,
          source: r.source,
          draftCreatedAt: r.created_at.toISOString(),
        },
        requestId,
      });
      await enqueue(sys, {
        type: 'record.confirmed',
        aggregateType: 'session_record',
        aggregateId: id,
        centreId: r.centre_id,
        data: { recordId: id, groupId: r.group_id, sessionDate: dayOf(r.session_date) },
        requestId,
      });
      // record.confirmed → the followup module evaluates the rules (FUP-RUL-03), in this same
      // transaction, so T06 shows the flags this record raised. The `followup` consumer runs the
      // same evaluation again on the event; it is idempotent (INV-08).
      await evaluate(sys, {
        groupId: r.group_id,
        studentIds: entries.map((e) => e.student_id),
        trigger: 'record',
        upto: dayOf(r.session_date),
        requestId,
      });
      return (await dto.records(sys, [id], lang))[0]!;
    });
  }

  // ── Corrections (FUP-REC-08, INV-09) ───────────────────────────────────────────
  async correct(
    userId: string,
    entryId: string,
    body: {
      field: 'attendance' | 'score' | 'participation' | 'observation';
      newValue: string | null;
      reason: string;
    },
    lang: Lang,
    requestId?: string,
  ) {
    const found = await this.db.asUser(userId, async (tx, ctx) => {
      const e = await tx
        .selectFrom('records.record_entries')
        .select(['id', 'session_record_id'])
        .where('id', '=', entryId)
        .executeTakeFirst();
      if (!e) throw notFound('entry');
      return { ctx, recordId: e.session_record_id };
    });
    const { record, isTeacher } = await this.recordAccess(userId, found.recordId);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, record.centre_id);
      this.mustTeach(isTeacher);
      if (record.status !== 'confirmed')
        throw new Problem(
          409,
          'record_not_confirmed',
          'Edit the draft instead; corrections are for confirmed records.',
        );
      const reason = body.reason?.trim();
      if (!reason) throw new Problem(422, 'reason_required', 'Give a reason for the correction.');
      if (reason.length > 500) throw new Problem(422, 'too_long', 'Up to 500 characters.');
      const e = await sys
        .selectFrom('records.record_entries')
        .selectAll()
        .where('id', '=', entryId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const old =
        body.field === 'score'
          ? e.score == null
            ? null
            : String(Number(e.score))
          : body.field === 'observation'
            ? e.observation
            : String(e[body.field]);
      const set: Record<string, unknown> = {};
      if (body.field === 'score') {
        const v = body.newValue == null || body.newValue === '' ? null : Number(body.newValue);
        const a = await sys
          .selectFrom('records.assessments')
          .select(['id', 'max_score'])
          .where('session_record_id', '=', record.id)
          .executeTakeFirst();
        await this.validate(
          sys,
          record.id,
          [{ studentId: e.student_id, attendance: e.attendance, score: v }],
          a ? Number(a.max_score) : null,
        );
        set.score = v == null ? null : String(v);
        set.assessment_id = v == null ? null : a!.id;
      } else if (body.field === 'attendance') {
        if (!['present', 'absent', 'late', 'not_recorded'].includes(body.newValue ?? ''))
          throw new Problem(
            422,
            'validation_failed',
            'Pick present, absent, late or not recorded.',
          );
        set.attendance = body.newValue;
        if (body.newValue === 'absent') {
          set.score = null;
          set.assessment_id = null;
        }
        if (body.newValue !== 'late') set.late_minutes = null;
      } else if (body.field === 'participation') {
        if (!['low', 'normal', 'high', 'not_recorded'].includes(body.newValue ?? ''))
          throw new Problem(422, 'validation_failed', 'Pick low, normal, high or not recorded.');
        set.participation = body.newValue;
      } else set.observation = body.newValue;
      const corrId = uuidv7();
      // INV-09: the entry trigger lets a confirmed entry change only inside its correction.
      await sql`SELECT set_config('app.correction_id', ${corrId}, true)`.execute(sys);
      await sys.updateTable('records.record_entries').set(set).where('id', '=', entryId).execute();
      await sql`SELECT set_config('app.correction_id', '', true)`.execute(sys);
      const at = new Date();
      await sys
        .insertInto('records.corrections')
        .values({
          id: corrId,
          record_entry_id: entryId,
          session_record_id: record.id,
          centre_id: record.centre_id,
          student_id: e.student_id,
          field: body.field,
          old_value: old,
          new_value: body.newValue,
          reason,
          corrected_by: userId,
          created_at: at,
        })
        .execute();
      // CF-34: a correction answers the owner's open requests on this record.
      await sys
        .updateTable('records.correction_requests')
        .set({ status: 'done', done_at: at })
        .where('session_record_id', '=', record.id)
        .where('status', '=', 'open')
        .execute();
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: record.centre_id,
        action: 'record.corrected',
        objectType: 'record_entry',
        objectRef: entryId,
        before: { field: body.field },
        after: {
          recordId: record.id,
          groupId: record.group_id,
          field: body.field,
          correctionId: corrId,
          studentId: e.student_id,
        },
        reason,
        requestId,
      });
      await enqueue(sys, {
        type: 'record.corrected',
        aggregateType: 'session_record',
        aggregateId: record.id,
        centreId: record.centre_id,
        data: { recordId: record.id, groupId: record.group_id, correctionId: corrId },
        requestId,
      });
      // record.corrected → re-run the rules for that student (FUP-REC-08 AC3).
      const latest = await sys
        .selectFrom('records.session_records')
        .select(sql<string>`max(session_date)::text`.as('d'))
        .where('group_id', '=', record.group_id)
        .where('status', '=', 'confirmed')
        .executeTakeFirstOrThrow();
      await evaluate(sys, {
        groupId: record.group_id,
        studentIds: [e.student_id],
        trigger: 'record',
        upto: latest.d,
        correctionOf: record.id,
        requestId,
      });
      const names = await namesOf(sys, [e.student_id, userId]);
      return {
        id: corrId,
        entryId,
        student: ref(names, e.student_id),
        field: body.field,
        oldValue: old,
        newValue: body.newValue,
        reason,
        author: ref(names, userId),
        at: at.toISOString(),
      };
    });
  }

  /** CF-34: the owner asks the teacher to correct a confirmed record (never changes it). */
  async requestCorrection(
    userId: string,
    recordId: string,
    body: { studentId?: string | null; text: string },
    lang: Lang,
    requestId?: string,
  ) {
    const { ctx, record } = await this.recordAccess(userId, recordId);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, record.centre_id);
      if (roleAt(ctx, record.centre_id) !== 'owner')
        throw forbidden('Only the owner asks for corrections.');
      if (record.status !== 'confirmed')
        throw new Problem(409, 'record_not_confirmed', 'Only confirmed records are corrected.');
      const text = (body.text ?? '').trim();
      if (!text) throw new Problem(422, 'validation_failed', 'Say what should be corrected.');
      if ([...text].length > 500)
        throw new Problem(422, 'too_long', 'Up to 500 characters.', { max: 500 });
      if (body.studentId) {
        const onRoster = await sys
          .selectFrom('records.record_entries')
          .select('id')
          .where('session_record_id', '=', recordId)
          .where('student_id', '=', body.studentId)
          .executeTakeFirst();
        if (!onRoster)
          throw new Problem(422, 'unknown_student', 'A student is not on this roster.');
      }
      const id = uuidv7();
      await sys
        .insertInto('records.correction_requests')
        .values({
          id,
          session_record_id: recordId,
          centre_id: record.centre_id,
          group_id: record.group_id,
          student_id: body.studentId ?? null,
          text,
          requested_by: userId,
        })
        .execute();
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: record.centre_id,
        action: 'record.correction_requested',
        objectType: 'session_record',
        objectRef: recordId,
        after: { requestId: id, groupId: record.group_id },
        requestId,
      });
      return this.requestDto(sys, id, lang);
    });
  }

  async closeCorrectionRequest(userId: string, id: string, lang: Lang, requestId?: string) {
    const q = await this.db.asUser(userId, async (tx) =>
      tx
        .selectFrom('records.correction_requests')
        .select(['id', 'session_record_id'])
        .where('id', '=', id)
        .executeTakeFirst(),
    );
    if (!q) throw notFound('request');
    const { record, isTeacher } = await this.recordAccess(userId, q.session_record_id);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, record.centre_id);
      this.mustTeach(isTeacher);
      await sys
        .updateTable('records.correction_requests')
        .set({ status: 'done', done_at: new Date() })
        .where('id', '=', id)
        .where('status', '=', 'open')
        .execute();
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: record.centre_id,
        action: 'record.correction_request_closed',
        objectType: 'correction_request',
        objectRef: id,
        requestId,
      });
      return this.requestDto(sys, id, lang);
    });
  }

  private async requestDto(sys: Tx, id: string, lang: Lang) {
    const q = await sys
      .selectFrom('records.correction_requests as q')
      .innerJoin('records.session_records as r', 'r.id', 'q.session_record_id')
      .selectAll('q')
      .select(sql<string>`r.session_date::text`.as('session_date'))
      .where('q.id', '=', id)
      .executeTakeFirstOrThrow();
    const g = await groupInfo(sys, q.group_id);
    const names = await namesOf(sys, [q.requested_by, q.student_id]);
    return dto.correctionRequestDto(q, q.session_date, g.name[lang], names);
  }

  // ── Students and notes (FUP-REC-10/11) ─────────────────────────────────────────
  /** The student's follow-up groups the caller may see (teacher's own first). 404 otherwise. */
  private async studentAccess(userId: string, studentId: string) {
    return this.db.asUser(userId, async (tx, ctx) => {
      const rows = await tx
        .selectFrom('records.known_students')
        .select(['group_id', 'centre_id', 'display_name'])
        .where('student_id', '=', studentId)
        .execute();
      if (!rows.length) throw notFound('student');
      return {
        ctx,
        rows: rows.map((r) => ({
          group_id: r.group_id!,
          centre_id: r.centre_id!,
          display_name: r.display_name!,
        })),
      };
    });
  }

  async student(userId: string, studentId: string, lang: Lang) {
    const { ctx, rows } = await this.studentAccess(userId, studentId);
    return this.db.asSystem(async (sys) => {
      const info = await groupsInfo(
        sys,
        rows.map((r) => r.group_id),
      );
      const on = await centresWithExtra(
        sys,
        rows.map((r) => r.centre_id),
      );
      const visible = rows.filter((r) => on.includes(r.centre_id));
      if (!visible.length) throw new Problem(403, 'extra_not_enabled', 'Follow-up is not on here.');
      const own = visible.find((r) => info.get(r.group_id)?.teacherId === ctx.teacherId);
      const row = own ?? visible[0]!;
      if (!own) this.canRead(ctx, row.centre_id, false);
      const groupId = row.group_id;
      const g = info.get(groupId)!;
      const past = await sessionsOf(sys, [groupId]);
      const confirmed = (await this.confirmedEntries(sys, groupId)).filter(
        (e) => e.student_id === studentId,
      );
      const att = past.map((p) => ({
        sessionDate: p.date,
        value: (confirmed.find((e) => e.group_session_id === p.id)?.attendance ?? 'none') as
          'present' | 'absent' | 'late' | 'not_recorded' | 'none',
      }));
      // Trends: one line per assessment series, never mixing series (FUP-REC-11 AC2).
      const bySeries = new Map<
        string,
        { sessionDate: string; score: number; maxScore: number; title: string }[]
      >();
      for (const e of confirmed) {
        if (!e.series || e.score == null || !e.max_score) continue;
        bySeries.set(e.series, [
          ...(bySeries.get(e.series) ?? []),
          {
            sessionDate: e.session_date,
            score: Number(e.score),
            maxScore: Number(e.max_score),
            title: e.title ?? '',
          },
        ]);
      }
      const latest = confirmed.filter((e) => e.score != null && e.max_score).at(-1);
      const notes = await this.notesOf(sys, studentId, groupId, lang);
      const monthStart = `${cairoToday().slice(0, 8)}01`;
      const flags = await dto.openFlagIds(sys, [studentId], groupId);
      return {
        student: person(studentId, row.display_name),
        group: { id: groupId, name: g.name[lang] },
        attended: {
          present: att.filter((a) => a.value === 'present' || a.value === 'late').length,
          of: att.filter((a) => a.value !== 'none' && a.value !== 'not_recorded').length,
        },
        latestScore: latest
          ? {
              score: Number(latest.score),
              maxScore: Number(latest.max_score),
              title: latest.title ?? '',
            }
          : null,
        notesThisMonth: notes.filter((n) => cairoToday(new Date(n.at)) >= monthStart).length,
        attendance: att,
        trends: [...bySeries].map(([series, points]) => ({ series, points })),
        notes,
        flags: await dto.signalSummaries(
          sys,
          flags.map((f) => f.id),
          lang,
        ),
      };
    });
  }

  /** Own notes plus confirmed record observations (same internal visibility), newest first. */
  async notesOf(sys: Tx, studentId: string, groupId: string, lang: Lang) {
    void lang;
    const own = await sys
      .selectFrom('records.notes')
      .selectAll()
      .where('student_id', '=', studentId)
      .where('group_id', '=', groupId)
      .execute();
    const obs = (await this.confirmedEntries(sys, groupId)).filter(
      (e) => e.student_id === studentId && e.observation,
    );
    const names = await namesOf(sys, [
      studentId,
      ...own.map((n) => n.author_id),
      ...obs.map((o) => o.confirmed_by),
    ]);
    return [
      ...own.map((n) => ({
        id: n.id,
        student: ref(names, studentId),
        groupId,
        tag: n.tag as
          'understanding' | 'needs_revisit' | 'behaviour' | 'positive' | 'absence_context',
        body: n.body,
        visibility: n.visibility as 'internal' | 'suggested_for_parent',
        author: ref(names, n.author_id),
        at: n.created_at.toISOString(),
      })),
      ...obs.map((o) => ({
        id: `obs-${o.record_id}-${studentId}`,
        student: ref(names, studentId),
        groupId,
        tag: (o.observation_tag ?? 'understanding') as 'understanding',
        body: o.observation!,
        visibility: 'internal' as const,
        author: ref(names, o.confirmed_by),
        at: o.confirmed_at.toISOString(),
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));
  }

  async addNote(
    userId: string,
    studentId: string,
    body: { groupId: string; tag: string; body: string },
    lang: Lang,
    requestId?: string,
  ) {
    const { rows } = await this.studentAccess(userId, studentId);
    const { group, isTeacher } = await this.groupAccess(userId, body.groupId);
    if (!rows.some((r) => r.group_id === body.groupId)) throw notFound('student');
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, group.centre_id);
      this.mustTeach(isTeacher);
      if (!NOTE_TAGS.includes(body.tag))
        throw new Problem(422, 'validation_failed', 'Pick a topic.');
      const text = (body.body ?? '').trim();
      if (!text) throw new Problem(422, 'validation_failed', 'Write the note.');
      if ([...text].length > 500)
        throw new Problem(422, 'too_long', 'A note can have up to 500 characters.', { max: 500 });
      const id = uuidv7();
      const at = new Date();
      await sys
        .insertInto('records.notes')
        .values({
          id,
          student_id: studentId,
          centre_id: group.centre_id,
          group_id: body.groupId,
          author_id: userId,
          tag: body.tag,
          body: text,
          created_at: at,
        })
        .execute();
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: group.centre_id,
        action: 'note.saved',
        objectType: 'note',
        objectRef: id,
        after: { groupId: body.groupId, studentId, tag: body.tag },
        requestId,
      });
      await enqueue(sys, {
        type: 'note.saved',
        aggregateType: 'note',
        aggregateId: id,
        centreId: group.centre_id,
        data: { noteId: id, groupId: body.groupId, studentId },
        requestId,
      });
      // note.saved → `repeated_concern` (a saved note is confirmed input, BR-APR-08).
      await evaluate(sys, {
        groupId: body.groupId,
        studentIds: [studentId],
        trigger: 'note',
        requestId,
      });
      const names = await namesOf(sys, [studentId, userId]);
      return {
        id,
        student: ref(names, studentId),
        groupId: body.groupId,
        tag: body.tag as 'understanding',
        body: text,
        visibility: 'internal' as const,
        author: ref(names, userId),
        at: at.toISOString(),
      };
    });
  }

  /** FUP-REC-10 AC3: goes to staff for review; never to the parent. */
  async suggestNote(userId: string, noteId: string, lang: Lang, requestId?: string) {
    const n = await this.db.asUser(userId, async (tx) =>
      tx.selectFrom('records.notes').selectAll().where('id', '=', noteId).executeTakeFirst(),
    );
    if (!n) throw notFound('note');
    void lang;
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, n.centre_id);
      if (n.author_id !== userId) throw forbidden('Only the author can suggest it.');
      await sys
        .updateTable('records.notes')
        .set({ visibility: 'suggested_for_parent' })
        .where('id', '=', noteId)
        .execute();
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: n.centre_id,
        action: 'note.suggested',
        objectType: 'note',
        objectRef: noteId,
        requestId,
      });
      const names = await namesOf(sys, [n.student_id, userId]);
      return {
        id: n.id,
        student: ref(names, n.student_id),
        groupId: n.group_id,
        tag: n.tag as 'understanding',
        body: n.body,
        visibility: 'suggested_for_parent' as const,
        author: ref(names, userId),
        at: n.created_at.toISOString(),
      };
    });
  }
}

/** A `date` column as YYYY-MM-DD (pg returns Date objects for `date`). */
export function dayOf(d: unknown): string {
  if (d instanceof Date)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return String(d).slice(0, 10);
}
export const sessionDate = (d: unknown, lang: Lang) => fmtDate(dayOf(d), lang);
export type { GroupInfo };
