import { sql } from 'kysely';
import type { Records } from '../followup/records';
import { hasPerm, requireExtra, roleAt } from '../followup/world';
import { writeAudit } from '../platform/audit';
import { can, type Database, type RlsContext, type Tx } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import { forbidden, notFound, Problem } from '../platform/problem';
import { focusViews, noteViews, topicView } from './learning';
import { type Lang, topicNames } from './lookups';

/**
 * The teacher's and the centre's side of the student features (database v2). Access is checked
 * as the caller under RLS (their own group as the teacher, their centre as staff); the write then
 * runs as the system with its audit row, as the follow-up records do. The teacher confirms every
 * record (homework, what was covered and the topics are part of it, locked with it); the centre
 * approves every note a student will read; the teacher approves the focus plans.
 */
export class Teaching {
  constructor(
    private readonly db: Database,
    private readonly records: Records,
  ) {}

  // ── Sessions: move or change hall (D4) ───────────────────────────────────────
  async moveSession(
    userId: string,
    sessionId: string,
    body: { startsAt?: string; endsAt?: string; roomId?: string | null; reason: string },
    requestId?: string,
  ) {
    const s = await this.db.asUser(userId, async (tx, ctx) => {
      const row = await tx
        .selectFrom('market.group_sessions as s')
        .innerJoin('market.groups as g', 'g.id', 's.group_id')
        .select([
          's.id',
          's.group_id',
          's.centre_id',
          's.starts_at',
          's.ends_at',
          's.status',
          's.room_id',
          'g.teacher_id',
        ])
        .where('s.id', '=', sessionId)
        .executeTakeFirst();
      const isTeacher = !!row && row.teacher_id === ctx.teacherId;
      const isStaff = !!row && ctx.centreIds.includes(row.centre_id);
      if (!row || (!isTeacher && !isStaff)) throw notFound('session');
      const centreMay = isStaff && can(ctx, row.centre_id, 'bookings.manage');
      // A hall is the centre's to change; a time is the teacher's or the centre's.
      if (body.roomId !== undefined && !centreMay)
        throw forbidden('Only the centre (bookings.manage) changes a session’s hall.');
      if (body.startsAt !== undefined && !isTeacher && !centreMay)
        throw forbidden('You need the bookings.manage permission at this centre.');
      return row;
    });
    if (s.status !== 'scheduled' || s.starts_at.getTime() <= Date.now())
      throw new Problem(
        409,
        'session_not_scheduled',
        'Only a coming, scheduled session can change.',
      );
    const startsAt = body.startsAt ? new Date(body.startsAt) : s.starts_at;
    const endsAt = body.endsAt
      ? new Date(body.endsAt)
      : new Date(startsAt.getTime() + (s.ends_at.getTime() - s.starts_at.getTime()));
    if (!(endsAt > startsAt) || startsAt.getTime() <= Date.now())
      throw new Problem(
        422,
        'validation_failed',
        'The new time must be in the future and end after it starts.',
      );
    return this.db.asSystem(async (sys) => {
      // The change log trigger reads who and why from these settings (migration 0024).
      await sql`SELECT set_config('app.actor_id', ${userId}, true), set_config('app.change_reason', ${body.reason}, true)`.execute(
        sys,
      );
      const roomId = body.roomId === undefined ? s.room_id : body.roomId;
      await sys
        .updateTable('market.group_sessions')
        .set({ starts_at: startsAt, ends_at: endsAt, room_id: roomId })
        .where('id', '=', sessionId)
        .execute();
      const changes: ('moved' | 'room_changed')[] = [];
      if (startsAt.getTime() !== s.starts_at.getTime() || endsAt.getTime() !== s.ends_at.getTime())
        changes.push('moved');
      if (roomId !== s.room_id) changes.push('room_changed');
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: s.centre_id,
        action: 'session.changed',
        objectType: 'group_session',
        objectRef: sessionId,
        before: { startsAt: s.starts_at.toISOString(), roomId: s.room_id },
        after: { startsAt: startsAt.toISOString(), roomId, changes },
        reason: body.reason,
        requestId,
      });
      return {
        sessionId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        roomId,
        changes,
      };
    });
  }

  // ── What was covered, the homework set, topics and homework items ─────────────
  private async readRecord(userId: string, recordId: string) {
    const { ctx, record, isTeacher } = await this.records.recordAccess(userId, recordId);
    if (
      !isTeacher &&
      !(roleAt(ctx, record.centre_id) && hasPerm(ctx, record.centre_id, 'records.read'))
    )
      throw forbidden('You need the records.read permission at this centre.');
    return { ctx, record, isTeacher };
  }

  private async learningView(sys: Tx, recordId: string) {
    const r = await sys
      .selectFrom('records.session_records')
      .select(['id', 'status', 'topic_covered', 'homework_set'])
      .where('id', '=', recordId)
      .executeTakeFirstOrThrow();
    const topics = await sys
      .selectFrom('records.session_topics')
      .select('topic_node_id')
      .where('session_record_id', '=', recordId)
      .execute();
    const items = await sys
      .selectFrom('records.homework_items')
      .select(['id', 'title', 'details', 'due_session_id', 'source'])
      .where('session_record_id', '=', recordId)
      .where('archived_at', 'is', null)
      .orderBy('created_at')
      .execute();
    return {
      recordId,
      status: r.status as 'draft' | 'confirmed',
      topicCovered: r.topic_covered,
      homeworkSet: r.homework_set,
      topicIds: topics.map((t) => t.topic_node_id),
      homework: items.map((i) => ({
        id: i.id,
        title: i.title,
        details: i.details,
        dueSessionId: i.due_session_id,
        source: i.source as 'tap' | 'voice',
      })),
    };
  }

  async learning(userId: string, recordId: string) {
    await this.readRecord(userId, recordId);
    return this.db.asSystem((sys) => this.learningView(sys, recordId));
  }

  async putLearning(
    userId: string,
    recordId: string,
    body: {
      topicCovered?: string | null;
      homeworkSet?: string | null;
      topicIds?: string[];
      homework?: {
        id?: string;
        title: string;
        details?: string | null;
        dueSessionId?: string | null;
        source?: 'tap' | 'voice';
      }[];
    },
  ) {
    const { record, isTeacher } = await this.records.recordAccess(userId, recordId);
    if (!isTeacher) throw forbidden('Only the group’s teacher records sessions.');
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, record.centre_id);
      const r = await sys
        .selectFrom('records.session_records')
        .selectAll()
        .where('id', '=', recordId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (r.status === 'confirmed')
        throw new Problem(
          409,
          'record_confirmed',
          'This record is confirmed. Add a correction instead.',
        );
      if (body.topicCovered !== undefined || body.homeworkSet !== undefined)
        await sys
          .updateTable('records.session_records')
          .set({
            ...(body.topicCovered !== undefined ? { topic_covered: body.topicCovered } : {}),
            ...(body.homeworkSet !== undefined ? { homework_set: body.homeworkSet } : {}),
          })
          .where('id', '=', recordId)
          .execute();
      if (body.topicIds) {
        await sys
          .deleteFrom('records.session_topics')
          .where('session_record_id', '=', recordId)
          .execute();
        for (const t of [...new Set(body.topicIds)])
          await sys
            .insertInto('records.session_topics')
            .values({
              session_record_id: recordId,
              topic_node_id: t,
              centre_id: r.centre_id,
              group_id: r.group_id,
            })
            .execute();
      }
      if (body.homework) {
        const next = await sys
          .selectFrom('market.group_sessions')
          .select('id')
          .where('group_id', '=', r.group_id)
          .where('status', '=', 'scheduled')
          .where(
            'starts_at',
            '>',
            sys
              .selectFrom('market.group_sessions')
              .select('starts_at')
              .where('id', '=', r.group_session_id),
          )
          .orderBy('starts_at')
          .limit(1)
          .executeTakeFirst();
        const keep = body.homework.filter((h) => h.id).map((h) => h.id!);
        await sys
          .updateTable('records.homework_items')
          .set({ archived_at: new Date() })
          .where('session_record_id', '=', recordId)
          .where('archived_at', 'is', null)
          .$if(keep.length > 0, (q) => q.where('id', 'not in', keep))
          .execute();
        for (const h of body.homework) {
          const values = {
            title: h.title,
            details: h.details ?? null,
            due_session_id: h.dueSessionId === undefined ? (next?.id ?? null) : h.dueSessionId,
            source: h.source ?? 'tap',
          };
          if (h.id) {
            const u = await sys
              .updateTable('records.homework_items')
              .set(values)
              .where('id', '=', h.id)
              .where('session_record_id', '=', recordId)
              .returning('id')
              .executeTakeFirst();
            if (!u) throw notFound('homework item');
          } else
            await sys
              .insertInto('records.homework_items')
              .values({
                id: uuidv7(),
                session_record_id: recordId,
                group_id: r.group_id,
                group_session_id: r.group_session_id,
                centre_id: r.centre_id,
                teacher_id: r.teacher_id,
                created_by: userId,
                ...values,
              })
              .execute();
        }
      }
      return this.learningView(sys, recordId);
    });
  }

  /** Marks of earlier homework, made in this (draft) record; visible once it is confirmed. */
  async homeworkMarks(
    userId: string,
    recordId: string,
    body: {
      marks: { homeworkItemId: string; studentId: string; status: 'handed_in' | 'late' | 'set' }[];
    },
  ) {
    const { record, isTeacher } = await this.records.recordAccess(userId, recordId);
    if (!isTeacher) throw forbidden('Only the group’s teacher records sessions.');
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, record.centre_id);
      if (record.status === 'confirmed')
        throw new Problem(
          409,
          'record_confirmed',
          'This record is confirmed. Add a correction instead.',
        );
      for (const m of body.marks) {
        const u = await sys
          .updateTable('records.homework_statuses')
          .set(
            m.status === 'set'
              ? { status: 'set', marked_in_record_id: null, marked_by: null, marked_at: null }
              : {
                  status: m.status,
                  marked_in_record_id: recordId,
                  marked_by: userId,
                  marked_at: new Date(),
                },
          )
          .where('homework_item_id', '=', m.homeworkItemId)
          .where('student_id', '=', m.studentId)
          .where(
            'homework_item_id',
            'in',
            sys
              .selectFrom('records.homework_items')
              .select('id')
              .where('group_id', '=', record.group_id),
          )
          .returning('homework_item_id')
          .executeTakeFirst();
        if (!u) throw notFound('homework item');
      }
      const marks = await sys
        .selectFrom('records.homework_statuses')
        .select(['homework_item_id', 'student_id', 'status'])
        .where('marked_in_record_id', '=', recordId)
        .execute();
      return {
        recordId,
        marks: marks.map((m) => ({
          homeworkItemId: m.homework_item_id,
          studentId: m.student_id,
          status: m.status as 'set' | 'handed_in' | 'late',
        })),
      };
    });
  }

  /** A confirmed record's covered topic or homework set changes only with a reason (INV-09). */
  async correctLearning(
    userId: string,
    recordId: string,
    body: { field: 'topic_covered' | 'homework_set'; newValue: string | null; reason: string },
    requestId?: string,
  ) {
    const { record, isTeacher } = await this.records.recordAccess(userId, recordId);
    if (!isTeacher) throw forbidden('Only the group’s teacher corrects a record.');
    return this.db.asSystem(async (sys) => {
      if (record.status !== 'confirmed')
        throw new Problem(409, 'record_not_confirmed', 'Edit the draft instead.');
      const before = await sys
        .selectFrom('records.session_records')
        .select(['topic_covered', 'homework_set'])
        .where('id', '=', recordId)
        .executeTakeFirstOrThrow();
      const id = uuidv7();
      await sys
        .insertInto('records.record_corrections')
        .values({
          id,
          session_record_id: recordId,
          centre_id: record.centre_id,
          field: body.field,
          old_value: body.field === 'topic_covered' ? before.topic_covered : before.homework_set,
          new_value: body.newValue,
          reason: body.reason,
          corrected_by: userId,
        })
        .execute();
      await sql`SELECT set_config('app.correction_id', ${id}, true)`.execute(sys);
      await sys
        .updateTable('records.session_records')
        .set(
          body.field === 'topic_covered'
            ? { topic_covered: body.newValue }
            : { homework_set: body.newValue },
        )
        .where('id', '=', recordId)
        .execute();
      await sql`SELECT set_config('app.correction_id', '', true)`.execute(sys);
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: record.centre_id,
        action: 'record.corrected',
        objectType: 'session_record',
        objectRef: recordId,
        after: { field: body.field, correctionId: id },
        reason: body.reason,
        requestId,
      });
      return this.learningView(sys, recordId);
    });
  }

  // ── Teacher notes for the student ────────────────────────────────────────────
  private async teacherOfGroup(userId: string, groupId: string) {
    const { ctx, group, isTeacher } = await this.records.groupAccess(userId, groupId);
    if (!isTeacher) throw forbidden('Only the group’s teacher does this.');
    return { ctx, group };
  }

  /** A student who held a paid seat in the group (records.known_students). */
  private async onRoster(userId: string, groupId: string, studentId: string) {
    const ok = await this.db.asUser(userId, (tx) =>
      tx
        .selectFrom('records.known_students')
        .select('student_id')
        .where('group_id', '=', groupId)
        .where('student_id', '=', studentId)
        .executeTakeFirst(),
    );
    if (!ok) throw notFound('student');
  }

  async newNote(
    userId: string,
    groupId: string,
    body: { studentId: string; body: string },
    lang: Lang,
  ) {
    const { group } = await this.teacherOfGroup(userId, groupId);
    await this.onRoster(userId, groupId, body.studentId);
    return this.db.asSystem(async (sys) => {
      const id = uuidv7();
      await sys
        .insertInto('records.student_notes')
        .values({
          id,
          student_id: body.studentId,
          group_id: groupId,
          centre_id: group.centre_id,
          teacher_id: group.teacher_id,
          author_id: userId,
          body: body.body,
        })
        .execute();
      return (await this.noteRows(sys, [id], lang))[0]!;
    });
  }

  async groupNotes(userId: string, groupId: string, lang: Lang) {
    await this.teacherOfGroup(userId, groupId);
    return this.db.asSystem(async (sys) => {
      const ids = await sys
        .selectFrom('records.student_notes')
        .select('id')
        .where('group_id', '=', groupId)
        .orderBy('created_at', 'desc')
        .limit(200)
        .execute();
      return {
        items: await this.noteRows(
          sys,
          ids.map((x) => x.id),
          lang,
        ),
      };
    });
  }

  async submitNote(userId: string, id: string, lang: Lang, requestId?: string) {
    const n = await this.db.asUser(userId, (tx, ctx) =>
      tx
        .selectFrom('records.student_notes')
        .selectAll()
        .where('id', '=', id)
        .where('teacher_id', '=', ctx.teacherId ?? '00000000-0000-0000-0000-000000000000')
        .executeTakeFirst(),
    );
    if (!n) throw notFound('note');
    return this.db.asSystem(async (sys) => {
      if (n.status !== 'draft' && n.status !== 'rejected')
        throw new Problem(409, 'note_not_draft', 'This note was already sent for approval.');
      await sys
        .updateTable('records.student_notes')
        .set({
          status: 'submitted',
          submitted_at: new Date(),
          rejected_by: null,
          rejected_at: null,
          rejected_reason: null,
        })
        .where('id', '=', id)
        .execute();
      await this.noteAudit(sys, userId, 'student_note.submitted', n.centre_id, id, requestId);
      return (await this.noteRows(sys, [id], lang))[0]!;
    });
  }

  async centreNotes(userId: string, centreId: string, lang: Lang) {
    await this.db.asUser(userId, async (_tx, ctx) => this.mayApprove(ctx, centreId));
    return this.db.asSystem(async (sys) => {
      const ids = await sys
        .selectFrom('records.student_notes')
        .select('id')
        .where('centre_id', '=', centreId)
        .where('status', '<>', 'draft')
        .orderBy('created_at', 'desc')
        .limit(200)
        .execute();
      return {
        items: await this.noteRows(
          sys,
          ids.map((x) => x.id),
          lang,
        ),
      };
    });
  }

  async decideNote(
    userId: string,
    id: string,
    decision: { approve: true } | { approve: false; reason: string },
    lang: Lang,
    requestId?: string,
  ) {
    const n = await this.db.asUser(userId, async (tx, ctx) => {
      const row = await tx
        .selectFrom('records.student_notes')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row || !ctx.centreIds.includes(row.centre_id)) throw notFound('note');
      this.mayApprove(ctx, row.centre_id);
      return row;
    });
    return this.db.asSystem(async (sys) => {
      if (n.status !== 'submitted')
        throw new Problem(
          409,
          n.status === 'approved' ? 'note_locked' : 'note_not_submitted',
          n.status === 'approved'
            ? 'An approved note can’t be changed.'
            : 'This note is not waiting for approval.',
        );
      const now = new Date();
      await sys
        .updateTable('records.student_notes')
        .set(
          decision.approve
            ? { status: 'approved', approved_by: userId, approved_at: now }
            : {
                status: 'rejected',
                rejected_by: userId,
                rejected_at: now,
                rejected_reason: decision.reason,
              },
        )
        .where('id', '=', id)
        .execute();
      await this.noteAudit(
        sys,
        userId,
        decision.approve ? 'student_note.approved' : 'student_note.rejected',
        n.centre_id,
        id,
        requestId,
      );
      if (decision.approve)
        await sql`
          INSERT INTO messaging.in_app_notifications (id, user_id, kind, object_type, object_id, student_id, group_id, centre_id, event_id)
          SELECT platform.uuidv7(), who.user_id, 'note_approved', 'student_note', ${id}, ${n.student_id}, ${n.group_id}, ${n.centre_id}, ${id}
          FROM (
            SELECT g.user_id FROM org.student_guardians sg JOIN org.guardians g ON g.id = sg.guardian_id
            WHERE sg.student_id = ${n.student_id} AND g.user_id IS NOT NULL
            UNION
            SELECT sa.user_id FROM identity.student_accounts sa WHERE sa.student_id = ${n.student_id} AND sa.status <> 'closed'
          ) who
          ON CONFLICT DO NOTHING`.execute(sys);
      return (await this.noteRows(sys, [id], lang))[0]!;
    });
  }

  private mayApprove(ctx: RlsContext, centreId: string) {
    if (!ctx.centreIds.includes(centreId)) throw notFound('centre');
    if (!can(ctx, centreId, 'messages.approve'))
      throw forbidden('You need the messages.approve permission at this centre.');
  }

  private async noteRows(sys: Tx, ids: string[], lang: Lang) {
    if (!ids.length) return [];
    const rows = await sys
      .selectFrom('records.student_notes')
      .selectAll()
      .where('id', 'in', ids)
      .execute();
    const views = await noteViews(sys, rows, lang);
    return ids.map((id) => views.find((v) => v.id === id)!);
  }

  private noteAudit(
    sys: Tx,
    userId: string,
    action: string,
    centreId: string,
    id: string,
    requestId?: string,
  ) {
    return writeAudit(sys, {
      actorId: userId,
      actorType: 'user',
      centreId,
      action,
      objectType: 'student_note',
      objectRef: id,
      requestId,
    });
  }

  // ── Topic map and tagging ────────────────────────────────────────────────────
  topicMap(subjectId: string, lang: Lang) {
    return this.db.asAnonymous(async (tx) => {
      const t = await tx
        .selectFrom('ref.topic_templates')
        .selectAll()
        .where('subject_id', '=', subjectId)
        .orderBy('academic_year', 'desc')
        .executeTakeFirst();
      if (!t) throw notFound('topic map');
      const nodes = await tx
        .selectFrom('ref.topic_template_nodes')
        .selectAll()
        .where('template_id', '=', t.id)
        .orderBy('position')
        .execute();
      const name = (n: { name_en: string; name_ar: string }) =>
        lang === 'en' ? n.name_en : n.name_ar;
      return {
        id: t.id,
        subjectId,
        academicYear: t.academic_year,
        name: name(t),
        confirmed: t.confirmed,
        units: nodes
          .filter((n) => n.kind === 'unit')
          .map((u) => ({
            id: u.id,
            name: name(u),
            topics: nodes
              .filter((n) => n.parent_id === u.id)
              .map((n) => ({ id: n.id, name: name(n) })),
          })),
      };
    });
  }

  /** The assessment, if the caller teaches its group and its record is still a draft. */
  private async draftAssessment(userId: string, assessmentId: string) {
    const a = await this.db.asUser(userId, (tx, ctx) =>
      tx
        .selectFrom('records.assessments as a')
        .innerJoin('records.session_records as r', 'r.id', 'a.session_record_id')
        .select([
          'a.id',
          'a.max_score',
          'a.tagging_mode',
          'a.centre_id',
          'a.session_record_id',
          'r.status',
          'r.teacher_id',
        ])
        .where('a.id', '=', assessmentId)
        .where('r.teacher_id', '=', ctx.teacherId ?? '00000000-0000-0000-0000-000000000000')
        .executeTakeFirst(),
    );
    if (!a) throw notFound('assessment');
    if (a.status === 'confirmed')
      throw new Problem(
        409,
        'record_confirmed',
        'This record is confirmed. Add a correction instead.',
      );
    return a;
  }

  async putItemTopics(
    userId: string,
    assessmentId: string,
    body:
      | { mode: 'whole_quiz'; topicIds: string[] }
      | {
          mode: 'per_question';
          questions: { label: string; maxMarks: number; topicIds: string[] }[];
        },
  ) {
    const a = await this.draftAssessment(userId, assessmentId);
    return this.db.asSystem(async (sys) => {
      if (body.mode === 'per_question') {
        const total = body.questions.reduce((n, q) => n + q.maxMarks, 0);
        if (Math.abs(total - Number(a.max_score)) > 0.001)
          throw new Problem(
            422,
            'questions_total_mismatch',
            'The questions’ maximums must add up to the quiz maximum.',
          );
      }
      const old = await sys
        .selectFrom('records.assessment_items')
        .select('id')
        .where('assessment_id', '=', assessmentId)
        .execute();
      if (old.length) {
        await sys
          .deleteFrom('analytics.item_topics')
          .where(
            'assessment_item_id',
            'in',
            old.map((o) => o.id),
          )
          .execute();
        await sys
          .deleteFrom('records.item_scores')
          .where(
            'assessment_item_id',
            'in',
            old.map((o) => o.id),
          )
          .execute();
        await sys
          .deleteFrom('records.assessment_items')
          .where('assessment_id', '=', assessmentId)
          .execute();
      }
      const questions =
        body.mode === 'whole_quiz'
          ? [{ label: 'Whole quiz', maxMarks: Number(a.max_score), topicIds: body.topicIds }]
          : body.questions;
      for (const [i, q] of questions.entries()) {
        const itemId = uuidv7();
        await sys
          .insertInto('records.assessment_items')
          .values({
            id: itemId,
            assessment_id: assessmentId,
            centre_id: a.centre_id,
            label: q.label,
            max_marks: String(q.maxMarks),
            position: i + 1,
          })
          .execute();
        for (const t of [...new Set(q.topicIds)])
          await sys
            .insertInto('analytics.item_topics')
            .values({ assessment_item_id: itemId, topic_node_id: t, centre_id: a.centre_id })
            .execute();
      }
      await sys
        .updateTable('records.assessments')
        .set({ tagging_mode: body.mode })
        .where('id', '=', assessmentId)
        .execute();
      return this.itemTopicsView(sys, assessmentId);
    });
  }

  private async itemTopicsView(sys: Tx, assessmentId: string) {
    const a = await sys
      .selectFrom('records.assessments')
      .select('tagging_mode')
      .where('id', '=', assessmentId)
      .executeTakeFirstOrThrow();
    const items = await sys
      .selectFrom('records.assessment_items')
      .select(['id', 'label', 'max_marks'])
      .where('assessment_id', '=', assessmentId)
      .orderBy('position')
      .execute();
    const tags = items.length
      ? await sys
          .selectFrom('analytics.item_topics')
          .select(['assessment_item_id', 'topic_node_id'])
          .where(
            'assessment_item_id',
            'in',
            items.map((i) => i.id),
          )
          .execute()
      : [];
    return {
      assessmentId,
      mode: a.tagging_mode as 'none' | 'whole_quiz' | 'per_question',
      questions: items.map((i) => ({
        id: i.id,
        label: i.label,
        maxMarks: Number(i.max_marks),
        topicIds: tags.filter((t) => t.assessment_item_id === i.id).map((t) => t.topic_node_id),
      })),
    };
  }

  /** Per-question marks; above a question's maximum is refused, never capped (BR-APR-09). */
  async putQuestionMarks(
    userId: string,
    assessmentId: string,
    body: { marks: { questionId: string; studentId: string; marks: number }[] },
  ) {
    const a = await this.draftAssessment(userId, assessmentId);
    if (a.tagging_mode !== 'per_question')
      throw new Problem(409, 'not_per_question', 'Tag the quiz per question first.');
    return this.db.asSystem(async (sys) => {
      const items = await sys
        .selectFrom('records.assessment_items')
        .select(['id', 'max_marks'])
        .where('assessment_id', '=', assessmentId)
        .execute();
      const roster = await sys
        .selectFrom('records.record_entries')
        .select(['id', 'student_id', 'attendance'])
        .where('session_record_id', '=', a.session_record_id!)
        .execute();
      for (const m of body.marks) {
        const item = items.find((i) => i.id === m.questionId);
        const entry = roster.find((e) => e.student_id === m.studentId);
        if (!item || !entry) throw notFound('question or student');
        if (m.marks > Number(item.max_marks))
          throw new Problem(422, 'score_out_of_range', 'A mark is above the question’s maximum.');
        if (entry.attendance === 'absent')
          throw new Problem(422, 'absent_no_score', 'An absent student has no mark.');
        await sys
          .insertInto('records.item_scores')
          .values({
            id: uuidv7(),
            assessment_item_id: item.id,
            student_id: m.studentId,
            centre_id: a.centre_id,
            marks: String(m.marks),
            record_entry_id: entry.id,
          })
          .onConflict((oc) =>
            oc
              .columns(['assessment_item_id', 'student_id'])
              .doUpdateSet({ marks: String(m.marks) }),
          )
          .execute();
      }
      return { ok: true as const };
    });
  }

  /** The teacher's (or centre's) view: the same view students and parents read (CF-58). */
  async groupTopicScores(userId: string, groupId: string, lang: Lang) {
    const { ctx, group, isTeacher } = await this.records.groupAccess(userId, groupId);
    if (!isTeacher && !hasPerm(ctx, group.centre_id, 'records.read'))
      throw forbidden('You need the records.read permission at this centre.');
    const scores = await this.db.asUser(userId, (tx) =>
      tx
        .selectFrom('analytics.student_topic_scores')
        .selectAll()
        .where('group_id', '=', groupId)
        .execute(),
    );
    return this.db.asSystem(async (sys) => {
      const names = await topicNames(
        sys,
        scores.map((s) => s.topic_node_id!),
        lang,
      );
      const studentIds = [...new Set(scores.map((s) => s.student_id!))];
      const people = studentIds.length
        ? await sys
            .selectFrom('org.students')
            .select(['id', 'display_name'])
            .where('id', 'in', studentIds)
            .execute()
        : [];
      return {
        groupId,
        students: studentIds.map((sid) => ({
          studentId: sid,
          name: people.find((p) => p.id === sid)?.display_name ?? '',
          topics: scores.filter((s) => s.student_id === sid).map((s) => topicView(s, names)),
        })),
      };
    });
  }

  // ── Weekly focus checklist ───────────────────────────────────────────────────
  async newFocusPlan(
    userId: string,
    groupId: string,
    body: {
      studentId: string;
      weekOf: string;
      items: { textAr: string; textEn?: string; topicId?: string }[];
    },
    lang: Lang,
  ) {
    const { group } = await this.teacherOfGroup(userId, groupId);
    await this.onRoster(userId, groupId, body.studentId);
    if (new Date(`${body.weekOf}T12:00:00Z`).getUTCDay() !== 1)
      throw new Problem(422, 'validation_failed', 'weekOf is the Monday of the week.');
    return this.db.asSystem(async (sys) => {
      const id = uuidv7();
      await sys
        .insertInto('analytics.focus_plans')
        .values({
          id,
          student_id: body.studentId,
          group_id: groupId,
          centre_id: group.centre_id,
          teacher_id: group.teacher_id,
          week_of: body.weekOf as never,
          created_by: userId,
        })
        .execute();
      for (const [i, it] of body.items.entries())
        await sys
          .insertInto('analytics.focus_plan_items')
          .values({
            id: uuidv7(),
            focus_plan_id: id,
            centre_id: group.centre_id,
            text_ar: it.textAr,
            text_en: it.textEn ?? null,
            topic_node_id: it.topicId ?? null,
            position: i + 1,
          })
          .execute();
      return (await this.planViews(sys, [id], lang))[0]!;
    });
  }

  async groupFocusPlans(userId: string, groupId: string, lang: Lang) {
    await this.teacherOfGroup(userId, groupId);
    return this.db.asSystem(async (sys) => {
      const ids = await sys
        .selectFrom('analytics.focus_plans')
        .select('id')
        .where('group_id', '=', groupId)
        .orderBy('week_of', 'desc')
        .limit(200)
        .execute();
      return {
        items: await this.planViews(
          sys,
          ids.map((x) => x.id),
          lang,
        ),
      };
    });
  }

  async approveFocusPlan(userId: string, id: string, lang: Lang, requestId?: string) {
    const p = await this.db.asUser(userId, (tx, ctx) =>
      tx
        .selectFrom('analytics.focus_plans')
        .selectAll()
        .where('id', '=', id)
        .where('teacher_id', '=', ctx.teacherId ?? '00000000-0000-0000-0000-000000000000')
        .executeTakeFirst(),
    );
    if (!p) throw notFound('focus plan');
    return this.db.asSystem(async (sys) => {
      if (p.status === 'drafted') {
        await sys
          .updateTable('analytics.focus_plans')
          .set({ status: 'approved', approved_by: userId, approved_at: new Date() })
          .where('id', '=', id)
          .execute();
        await writeAudit(sys, {
          actorId: userId,
          actorType: 'user',
          centreId: p.centre_id,
          action: 'focus_plan.approved',
          objectType: 'focus_plan',
          objectRef: id,
          requestId,
        });
      }
      return (await this.planViews(sys, [id], lang))[0]!;
    });
  }

  private async planViews(sys: Tx, ids: string[], lang: Lang) {
    if (!ids.length) return [];
    const plans = await sys
      .selectFrom('analytics.focus_plans')
      .selectAll()
      .where('id', 'in', ids)
      .execute();
    const items = await sys
      .selectFrom('analytics.focus_plan_items')
      .selectAll()
      .where('focus_plan_id', 'in', ids)
      .orderBy('position')
      .execute();
    const views = await focusViews(sys, plans, items, lang);
    return ids.map((id) => views.find((v) => v.id === id)!);
  }
}

/**
 * When a record is confirmed: every student on it gets a `set` status for each homework item
 * the record set (BR-APR-01: the teacher's confirmation makes it visible). Called by
 * Records.confirm in the same transaction.
 */
export async function onRecordConfirmed(sys: Tx, recordId: string) {
  await sql`
    INSERT INTO records.homework_statuses (homework_item_id, student_id, centre_id)
    SELECT i.id, e.student_id, i.centre_id
    FROM records.homework_items i
    JOIN records.record_entries e ON e.session_record_id = i.session_record_id
    WHERE i.session_record_id = ${recordId} AND i.archived_at IS NULL
    ON CONFLICT DO NOTHING`.execute(sys);
}
