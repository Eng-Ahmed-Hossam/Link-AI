import { sql } from 'kysely';
import type { Database, RlsContext, Tx } from '../platform/db';
import { notFound, Problem } from '../platform/problem';
import { studentsOnly } from './accounts';
import {
  cairoMonday,
  groupInfo,
  hallNames,
  type Lang,
  roomNames,
  sessionStarts,
  topicNames,
} from './lookups';
import { type Band, starsOf, subjectProgress } from './progress';

/** Who is asking: the student themself (`me`), or a parent about one child. */
export type Who = { kind: 'me' } | { kind: 'child'; studentId: string };

/**
 * What students and parents read (database v2 groups B and C). Every row comes through the
 * family policies and views (org.family_student_ids(): the student's own rows, or a parent's own
 * children's), read as the caller, so the database itself refuses anyone else's. The parent sees
 * exactly what the child sees. Display names (subject, teacher, hall) are looked up as the system
 * after access is settled. No class average, rank or classmate's row is ever read here.
 */
export class Learning {
  constructor(private readonly db: Database) {}

  /** Runs `fn` as the caller, scoped to one student: their own account, or a parent's child. */
  private as<T>(
    userId: string,
    who: Who,
    fn: (tx: Tx, studentId: string, ctx: RlsContext) => Promise<T>,
  ) {
    return this.db.asUser(userId, async (tx, ctx) => {
      if (who.kind === 'me') {
        if (!ctx.studentId) throw studentsOnly();
        return fn(tx, ctx.studentId, ctx);
      }
      if (!ctx.guardianId || ctx.studentId) throw notFound('child');
      const mine = await sql<{ ok: boolean }>`
        SELECT ${who.studentId}::uuid IN (SELECT org.my_student_ids()) AS ok`.execute(tx);
      if (!mine.rows[0]?.ok) throw notFound('child');
      return fn(tx, who.studentId, ctx);
    });
  }

  // ── Schedule ─────────────────────────────────────────────────────────────────
  async schedule(userId: string, range: { from?: string; to?: string }, lang: Lang) {
    const from = range.from
      ? new Date(`${range.from}T00:00:00+02:00`)
      : new Date(Date.now() - 86_400_000);
    const to = range.to
      ? new Date(`${range.to}T23:59:59+02:00`)
      : new Date(Date.now() + 14 * 86_400_000);
    if (to.getTime() - from.getTime() > 93 * 86_400_000)
      throw new Problem(422, 'validation_failed', 'Ask for at most three months at a time.');
    const rows = await this.as(userId, { kind: 'me' }, async (tx) => {
      const sessions = await sql<{
        session_id: string;
        group_id: string;
      }>`SELECT session_id, group_id FROM market.my_student_sessions()`.execute(tx);
      const ids = sessions.rows.map((r) => r.session_id);
      if (!ids.length) return [];
      const enrolled = await sql<{ group_id: string }>`
        SELECT DISTINCT s.group_id FROM market.my_student_sessions() ms
        JOIN market.group_sessions s ON s.id = ms.session_id
        WHERE NOT EXISTS (SELECT 1 FROM market.makeup_requests m WHERE m.makeup_session_id = s.id
                          AND m.status = 'accepted')`.execute(tx);
      const enrolledGroups = new Set(enrolled.rows.map((r) => r.group_id));
      const list = await tx
        .selectFrom('market.group_sessions')
        .select(['id', 'group_id', 'starts_at', 'ends_at', 'status'])
        .where('id', 'in', ids)
        .where('starts_at', '>=', from)
        .where('starts_at', '<=', to)
        .orderBy('starts_at')
        .execute();
      return list.map((s) => ({ ...s, makeup: !enrolledGroups.has(s.group_id) }));
    });
    return this.db.asSystem(async (sys) => {
      const info = await groupInfo(
        sys,
        rows.map((r) => r.group_id),
        lang,
      );
      const halls = await hallNames(
        sys,
        rows.map((r) => r.id),
      );
      return {
        items: rows.map((s) => ({
          sessionId: s.id,
          groupId: s.group_id,
          subject: info.get(s.group_id)!.subject,
          startsAt: s.starts_at.toISOString(),
          endsAt: s.ends_at.toISOString(),
          status: s.status as 'scheduled' | 'held' | 'cancelled' | 'not_held',
          hall: halls.get(s.id) ?? null,
          makeup: s.makeup,
        })),
      };
    });
  }

  /** Moved, cancelled and hall-changed sessions: the last 30 days and anything still to come. */
  async changes(userId: string, who: Who, lang: Lang) {
    const rows = await this.as(userId, who, async (tx, studentId, ctx) => {
      let q = tx
        .selectFrom('market.session_changes')
        .selectAll()
        .where((w) =>
          w.or([
            w('created_at', '>=', new Date(Date.now() - 30 * 86_400_000)),
            w('new_starts_at', '>=', new Date()),
          ]),
        )
        .orderBy('created_at', 'desc')
        .limit(100);
      // A parent's policy covers every child's groups: keep this child's.
      if (!ctx.studentId)
        q = q.where(
          'group_id',
          'in',
          tx.selectFrom('market.enrolments').select('group_id').where('student_id', '=', studentId),
        );
      return q.execute();
    });
    return this.db.asSystem(async (sys) => {
      const info = await groupInfo(
        sys,
        rows.map((r) => r.group_id),
        lang,
      );
      const rooms = await roomNames(
        sys,
        rows.flatMap((r) => [r.old_room_id, r.new_room_id]),
      );
      return {
        items: rows.map((c) => ({
          id: c.id,
          sessionId: c.group_session_id,
          groupId: c.group_id,
          subject: info.get(c.group_id)!.subject,
          kind: c.kind as 'moved' | 'cancelled' | 'room_changed',
          oldStartsAt: c.old_starts_at.toISOString(),
          newStartsAt: c.new_starts_at.toISOString(),
          oldEndsAt: c.old_ends_at.toISOString(),
          newEndsAt: c.new_ends_at.toISOString(),
          oldHall: c.old_room_id ? (rooms.get(c.old_room_id) ?? null) : null,
          newHall: c.new_room_id ? (rooms.get(c.new_room_id) ?? null) : null,
          reason: c.reason,
          changedAt: c.created_at.toISOString(),
        })),
      };
    });
  }

  // ── Notifications (any account) ──────────────────────────────────────────────
  notifications(userId: string) {
    return this.db.asUser(userId, async (tx) => {
      const rows = await tx
        .selectFrom('messaging.in_app_notifications')
        .selectAll()
        .where('created_at', '>=', new Date(Date.now() - 90 * 86_400_000))
        .orderBy('created_at', 'desc')
        .limit(100)
        .execute();
      return {
        items: rows.map((n) => ({
          id: n.id,
          kind: n.kind as never,
          objectType: n.object_type,
          objectId: n.object_id,
          studentId: n.student_id,
          groupId: n.group_id,
          readAt: n.read_at?.toISOString() ?? null,
          createdAt: n.created_at.toISOString(),
        })),
      };
    });
  }

  readNotification(userId: string, id: string) {
    return this.db.asUser(userId, async (tx) => {
      const r = await tx
        .updateTable('messaging.in_app_notifications')
        .set({ read_at: new Date() })
        .where('id', '=', id)
        .where('read_at', 'is', null)
        .returning('id')
        .executeTakeFirst();
      if (!r) {
        const exists = await tx
          .selectFrom('messaging.in_app_notifications')
          .select('id')
          .where('id', '=', id)
          .executeTakeFirst();
        if (!exists) throw notFound('notification');
      }
      return { ok: true as const };
    });
  }

  // ── Homework ─────────────────────────────────────────────────────────────────
  private async homeworkRows(tx: Tx, studentId: string) {
    return tx
      .selectFrom('records.student_homework')
      .selectAll()
      .where('student_id', '=', studentId)
      .orderBy('set_at', 'desc')
      .limit(200)
      .execute();
  }

  private async homeworkViews(
    sys: Tx,
    rows: Awaited<ReturnType<Learning['homeworkRows']>>,
    lang: Lang,
  ) {
    const info = await groupInfo(
      sys,
      rows.map((r) => r.group_id!),
      lang,
    );
    const due = await sessionStarts(
      sys,
      rows.map((r) => r.due_session_id),
    );
    return rows.map((h) => ({
      id: h.homework_item_id!,
      groupId: h.group_id!,
      subject: info.get(h.group_id!)!.subject,
      sessionId: h.group_session_id!,
      title: h.title!,
      details: h.details,
      dueSessionId: h.due_session_id,
      dueAt: h.due_session_id ? (due.get(h.due_session_id)?.toISOString() ?? null) : null,
      setAt: new Date(h.set_at!).toISOString(),
      status: h.status as 'set' | 'handed_in' | 'late',
      markedAt: h.marked_at ? new Date(h.marked_at).toISOString() : null,
    }));
  }

  async homework(userId: string, who: Who, lang: Lang) {
    const rows = await this.as(userId, who, (tx, s) => this.homeworkRows(tx, s));
    return this.db.asSystem(async (sys) => ({ items: await this.homeworkViews(sys, rows, lang) }));
  }

  // ── What you missed ──────────────────────────────────────────────────────────
  /** Sessions the confirmed record says the student was absent from. "Not recorded" is never absence. */
  async missed(userId: string, who: Who, lang: Lang) {
    const data = await this.as(userId, who, async (tx, studentId) => {
      const sessions = await tx
        .selectFrom('records.student_session_summaries')
        .selectAll()
        .where('student_id', '=', studentId)
        .where('attendance', '=', 'absent')
        .orderBy('session_date', 'desc')
        .limit(50)
        .execute();
      const sessionIds = sessions.map((s) => s.group_session_id!);
      const topics = sessionIds.length
        ? await tx
            .selectFrom('records.student_session_topics')
            .select(['group_session_id', 'topic_node_id'])
            .where('student_id', '=', studentId)
            .where('group_session_id', 'in', sessionIds)
            .execute()
        : [];
      const homework = (await this.homeworkRows(tx, studentId)).filter((h) =>
        sessionIds.includes(h.group_session_id!),
      );
      const makeups = sessionIds.length
        ? await tx
            .selectFrom('market.makeup_requests')
            .select(['id', 'missed_session_id'])
            .where('student_id', '=', studentId)
            .where('missed_session_id', 'in', sessionIds)
            .where('status', 'in', ['requested', 'accepted'])
            .execute()
        : [];
      const names = await topicNames(
        tx,
        topics.map((t) => t.topic_node_id!),
        lang,
      );
      return { sessions, topics, homework, makeups, names };
    });
    return this.db.asSystem(async (sys) => {
      const info = await groupInfo(
        sys,
        data.sessions.map((s) => s.group_id!),
        lang,
      );
      const hw = await this.homeworkViews(sys, data.homework, lang);
      return {
        items: data.sessions.map((s) => ({
          sessionId: s.group_session_id!,
          groupId: s.group_id!,
          subject: info.get(s.group_id!)!.subject,
          sessionDate: dayString(s.session_date!),
          topicCovered: s.topic_covered,
          homeworkSet: s.homework_set,
          topics: data.topics
            .filter((t) => t.group_session_id === s.group_session_id)
            .map((t) => ({ id: t.topic_node_id!, name: data.names.get(t.topic_node_id!) ?? '' })),
          homework: hw.filter((h) => h.sessionId === s.group_session_id),
          makeupRequestId:
            data.makeups.find((m) => m.missed_session_id === s.group_session_id)?.id ?? null,
        })),
      };
    });
  }

  // ── Teacher notes for the student (approved only: the policy shows nothing else) ─
  async notes(userId: string, who: Who, lang: Lang) {
    const rows = await this.as(userId, who, (tx, studentId) =>
      tx
        .selectFrom('records.student_notes')
        .selectAll()
        .where('student_id', '=', studentId)
        .where('status', '=', 'approved')
        .orderBy('approved_at', 'desc')
        .limit(100)
        .execute(),
    );
    return this.db.asSystem(async (sys) => ({ items: await noteViews(sys, rows, lang) }));
  }

  // ── Topic scores, stars and level ────────────────────────────────────────────
  async topics(userId: string, who: Who, groupId: string | undefined, lang: Lang) {
    const data = await this.as(userId, who, async (tx, studentId) => {
      let q = tx
        .selectFrom('analytics.student_topic_scores')
        .selectAll()
        .where('student_id', '=', studentId);
      if (groupId) q = q.where('group_id', '=', groupId);
      const scores = await q.execute();
      const month = lastMonth();
      const snaps = await tx
        .selectFrom('analytics.topic_score_snapshots')
        .select(['group_id', 'topic_node_id', 'score_display', 'band'])
        .where('student_id', '=', studentId)
        .where('month', '=', month)
        .execute();
      return { studentId, scores, snaps };
    });
    return progressView(this.db, data.studentId, data.scores, data.snaps, lang);
  }

  // ── Weekly focus checklist ───────────────────────────────────────────────────
  async focusPlans(userId: string, who: Who, lang: Lang) {
    const data = await this.as(userId, who, async (tx, studentId) => {
      // The family policy shows only approved plans whose child has the focus_plans consent.
      const plans = await tx
        .selectFrom('analytics.focus_plans')
        .selectAll()
        .where('student_id', '=', studentId)
        .where('status', '=', 'approved')
        .where('week_of', '=', cairoMonday() as never)
        .execute();
      const items = plans.length
        ? await tx
            .selectFrom('analytics.focus_plan_items')
            .selectAll()
            .where(
              'focus_plan_id',
              'in',
              plans.map((p) => p.id),
            )
            .orderBy('position')
            .execute()
        : [];
      return { plans, items };
    });
    return this.db.asSystem(async (sys) => ({
      items: await focusViews(sys, data.plans, data.items, lang),
    }));
  }

  /** The student ticks an item of their own approved plan (the teacher sees it). */
  async tick(userId: string, itemId: string, ticked: boolean) {
    const item = await this.as(userId, { kind: 'me' }, async (tx, studentId) => {
      const it = await tx
        .selectFrom('analytics.focus_plan_items as i')
        .innerJoin('analytics.focus_plans as p', 'p.id', 'i.focus_plan_id')
        .select(['i.id'])
        .where('i.id', '=', itemId)
        .where('p.student_id', '=', studentId)
        .where('p.status', '=', 'approved')
        .executeTakeFirst();
      if (!it) throw notFound('checklist item');
      return it;
    });
    await this.db.asSystem((sys) =>
      sys
        .updateTable('analytics.focus_plan_items')
        .set({ ticked_at: ticked ? new Date() : null })
        .where('id', '=', item.id)
        .execute(),
    );
    return { ok: true as const };
  }
}

// ── Shared views (also used by the teacher's side) ──────────────────────────────
export const dayString = (d: Date | string) =>
  typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);

/** The first day of the month before this one (Cairo), for the "last month" snapshot. */
export function lastMonth(now = new Date()) {
  const c = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
  const m = new Date(c.getFullYear(), c.getMonth() - 1, 1);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01` as never;
}

type ScoreRow = {
  student_id: string | null;
  group_id: string | null;
  topic_node_id: string | null;
  unit_node_id: string | null;
  quiz_count: number | null;
  score: string | null;
  score_display: number | null;
  band: string | null;
};

export function topicView(
  s: ScoreRow,
  names: Map<string, string>,
  snap?: { score_display: number | null; band: string },
) {
  const band = s.band as Band;
  return {
    topicId: s.topic_node_id!,
    name: names.get(s.topic_node_id!) ?? '',
    unitId: s.unit_node_id!,
    quizCount: s.quiz_count ?? 0,
    score: s.quiz_count != null && s.quiz_count >= 2 ? (s.score_display ?? null) : null,
    band,
    stars: starsOf(band),
    lastMonth: snap ? { score: snap.score_display, band: snap.band as Band } : null,
  };
}

export async function progressView(
  db: Database,
  studentId: string,
  scores: ScoreRow[],
  snaps: { group_id: string; topic_node_id: string; score_display: number | null; band: string }[],
  lang: Lang,
) {
  return db.asSystem(async (sys) => {
    const groups = [...new Set(scores.map((s) => s.group_id!))];
    const info = await groupInfo(sys, groups, lang);
    const names = await topicNames(
      sys,
      scores.map((s) => s.topic_node_id!),
      lang,
    );
    return {
      studentId,
      subjects: groups.map((g) => {
        const topics = scores
          .filter((s) => s.group_id === g)
          .map((s) =>
            topicView(
              s,
              names,
              snaps.find((x) => x.group_id === g && x.topic_node_id === s.topic_node_id),
            ),
          );
        const { stars, level } = subjectProgress(topics.map((t) => t.band));
        return { groupId: g, subject: info.get(g)!.subject, level, stars, topics };
      }),
    };
  });
}

type NoteRow = {
  id: string;
  student_id: string;
  group_id: string;
  body: string;
  status: string;
  rejected_reason: string | null;
  approved_at: Date | null;
  created_at: Date;
};
export async function noteViews(sys: Tx, rows: NoteRow[], lang: Lang) {
  const info = await groupInfo(
    sys,
    rows.map((r) => r.group_id),
    lang,
  );
  const students = rows.length
    ? await sys
        .selectFrom('org.students')
        .select(['id', 'display_name'])
        .where('id', 'in', [...new Set(rows.map((r) => r.student_id))])
        .execute()
    : [];
  return rows.map((n) => ({
    id: n.id,
    studentId: n.student_id,
    studentName: students.find((s) => s.id === n.student_id)?.display_name ?? '',
    groupId: n.group_id,
    subject: info.get(n.group_id)!.subject,
    teacherName: info.get(n.group_id)!.teacherName,
    body: n.body,
    status: n.status as 'draft' | 'submitted' | 'approved' | 'rejected',
    rejectedReason: n.rejected_reason,
    approvedAt: n.approved_at?.toISOString() ?? null,
    createdAt: n.created_at.toISOString(),
  }));
}

type PlanRow = {
  id: string;
  student_id: string;
  group_id: string;
  week_of: Date | string;
  status: string;
};
type ItemRow = {
  id: string;
  focus_plan_id: string;
  text_ar: string;
  text_en: string | null;
  topic_node_id: string | null;
  ticked_at: Date | null;
};
export async function focusViews(sys: Tx, plans: PlanRow[], items: ItemRow[], lang: Lang) {
  const info = await groupInfo(
    sys,
    plans.map((p) => p.group_id),
    lang,
  );
  return plans.map((p) => ({
    id: p.id,
    studentId: p.student_id,
    groupId: p.group_id,
    subject: info.get(p.group_id)!.subject,
    weekOf: dayString(p.week_of),
    status: p.status as 'drafted' | 'approved' | 'skipped',
    items: items
      .filter((i) => i.focus_plan_id === p.id)
      .map((i) => ({
        id: i.id,
        text: lang === 'en' && i.text_en ? i.text_en : i.text_ar,
        topicId: i.topic_node_id,
        tickedAt: i.ticked_at?.toISOString() ?? null,
      })),
  }));
}
