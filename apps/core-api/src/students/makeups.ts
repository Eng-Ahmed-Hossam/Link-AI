import { sql } from 'kysely';
import type { Seats } from '../enrolment/seats';
import { writeAudit } from '../platform/audit';
import { can, type Database, type Tx } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import { forbidden, notFound, pgConstraint, Problem } from '../platform/problem';
import { groupInfo, type Lang, sessionStarts } from './lookups';

const LIVE_SEAT_TTL_MS = 60_000;

/**
 * Make-up requests (database v2 B2; decision of 2026-10-16). The student or a parent asks; the
 * parent sees it; the centre (bookings.manage) accepts into one coming session or declines. An
 * accepted make-up holds ONE seat in that one session (INV-05, counted by
 * market.seats_committed): no enrolment row, no payment, no ledger entry. A full session can't
 * be accepted. Every change writes an audit row in the same transaction.
 */
export class Makeups {
  constructor(
    private readonly db: Database,
    private readonly seats: Seats,
  ) {}

  async create(
    userId: string,
    body: { missedSessionId: string; studentId?: string; note?: string },
    lang: Lang,
    requestId?: string,
  ) {
    const who = await this.db.asUser(userId, async (tx, ctx) => {
      let studentId: string;
      let by: 'student' | 'parent';
      if (ctx.studentId) {
        studentId = ctx.studentId;
        by = 'student';
        const ok = await sql<{ ok: boolean }>`
          SELECT EXISTS (SELECT 1 FROM market.my_student_sessions() WHERE session_id = ${body.missedSessionId}) AS ok`.execute(
          tx,
        );
        if (!ok.rows[0]?.ok) throw notFound('session');
      } else {
        if (!ctx.guardianId || !body.studentId) throw notFound('session');
        studentId = body.studentId;
        by = 'parent';
        const ok = await sql<{ ok: boolean }>`
          SELECT EXISTS (
            SELECT 1 FROM market.enrolments e JOIN market.group_sessions s ON s.group_id = e.group_id
            WHERE e.student_id = ${studentId} AND s.id = ${body.missedSessionId}
              AND ${studentId}::uuid IN (SELECT org.my_student_ids())
              AND e.status IN ('confirmed', 'awaiting_teacher', 'past_due', 'ended')
              AND market.covers(e, s.id, market.session_day(s.starts_at))) AS ok`.execute(tx);
        if (!ok.rows[0]?.ok) throw notFound('session');
      }
      return { studentId, by, guardianId: ctx.guardianId };
    });
    return this.db.asSystem(async (sys) => {
      const s = await sys
        .selectFrom('market.group_sessions')
        .select(['group_id', 'centre_id', 'starts_at'])
        .where('id', '=', body.missedSessionId)
        .executeTakeFirstOrThrow();
      if (s.starts_at.getTime() > Date.now())
        throw new Problem(422, 'session_not_missed', 'This session has not happened yet.');
      const guardianId =
        who.guardianId ??
        (
          await sys
            .selectFrom('identity.student_accounts')
            .select('guardian_id')
            .where('student_id', '=', who.studentId)
            .executeTakeFirstOrThrow()
        ).guardian_id;
      const id = uuidv7();
      await sys
        .insertInto('market.makeup_requests')
        .values({
          id,
          student_id: who.studentId,
          guardian_id: guardianId,
          group_id: s.group_id,
          centre_id: s.centre_id,
          missed_session_id: body.missedSessionId,
          requested_by_user_id: userId,
          requested_by: who.by,
          note: body.note || null,
          ...(who.by === 'parent' ? { parent_seen_at: new Date() } : {}),
        })
        .execute();
      const row = await this.row(sys, id);
      await this.audit(sys, userId, 'makeup.requested', row, requestId);
      // The parents see what the child asked for.
      if (who.by === 'student')
        await this.notifyFamily(sys, row, 'makeup_requested', id, 'parents');
      return (await this.views(sys, [row], lang))[0]!;
    });
  }

  async withdraw(userId: string, id: string, lang: Lang, requestId?: string) {
    await this.familyAccess(userId, id);
    return this.db.asSystem(async (sys) => {
      const row = await this.row(sys, id, true);
      if (row.status !== 'requested')
        throw new Problem(409, 'makeup_decided', 'This make-up request was already decided.');
      await sys
        .updateTable('market.makeup_requests')
        .set({ status: 'withdrawn' })
        .where('id', '=', id)
        .execute();
      const after = await this.row(sys, id);
      await this.audit(sys, userId, 'makeup.withdrawn', after, requestId);
      return (await this.views(sys, [after], lang))[0]!;
    });
  }

  async seen(userId: string, id: string, lang: Lang) {
    const ctx = await this.familyAccess(userId, id);
    if (!ctx.guardianId) throw forbidden('Parents mark a request seen.');
    return this.db.asSystem(async (sys) => {
      await sys
        .updateTable('market.makeup_requests')
        .set({ parent_seen_at: new Date() })
        .where('id', '=', id)
        .where('parent_seen_at', 'is', null)
        .execute();
      return (await this.views(sys, [await this.row(sys, id)], lang))[0]!;
    });
  }

  /** The student's or one child's requests (family policy). */
  async listFamily(userId: string, childId: string | null, lang: Lang) {
    const rows = await this.db.asUser(userId, async (tx, ctx) => {
      const studentId = childId ?? ctx.studentId;
      if (!studentId) throw new Problem(403, 'students_only', 'This is for a student account.');
      if (childId && (!ctx.guardianId || ctx.studentId)) throw notFound('child');
      const r = await tx
        .selectFrom('market.makeup_requests')
        .selectAll()
        .where('student_id', '=', studentId)
        .orderBy('created_at', 'desc')
        .limit(100)
        .execute();
      if (childId && !r.length) {
        const mine = await sql<{ ok: boolean }>`
          SELECT ${childId}::uuid IN (SELECT org.my_student_ids()) AS ok`.execute(tx);
        if (!mine.rows[0]?.ok) throw notFound('child');
      }
      return r;
    });
    return this.db.asSystem(async (sys) => ({ items: await this.views(sys, rows, lang) }));
  }

  async listCentre(userId: string, centreId: string, lang: Lang) {
    const rows = await this.db.asUser(userId, async (tx, ctx) => {
      if (!can(ctx, centreId, 'bookings.manage'))
        throw forbidden('You need the bookings.manage permission at this centre.');
      return tx
        .selectFrom('market.makeup_requests')
        .selectAll()
        .where('centre_id', '=', centreId)
        .orderBy('created_at', 'desc')
        .limit(200)
        .execute();
    });
    return this.db.asSystem(async (sys) => ({ items: await this.views(sys, rows, lang) }));
  }

  /** Accept into one session: one seat there, or 409 session_full. */
  async accept(
    userId: string,
    id: string,
    body: { makeupSessionId: string; note?: string },
    lang: Lang,
    requestId?: string,
  ) {
    const req = await this.centreAccess(userId, id);
    const target = await this.db.asSystem(async (sys) => {
      const s = await sys
        .selectFrom('market.group_sessions as s')
        .innerJoin('market.groups as g', 'g.id', 's.group_id')
        .select(['s.id', 's.group_id', 's.centre_id', 'g.seat_cap'])
        .where('s.id', '=', body.makeupSessionId)
        .executeTakeFirst();
      if (!s || s.centre_id !== req.centre_id)
        throw new Problem(
          422,
          'makeup_session_invalid',
          'Pick a coming session of this centre, for the same subject and school year.',
        );
      // Already in that session through an enrolment: no second seat.
      const already = await sql<{ n: number }>`
        SELECT count(*)::int AS n FROM market.enrolments e
        WHERE e.student_id = ${req.student_id} AND e.group_id = ${s.group_id}
          AND e.status IN ('confirmed', 'awaiting_teacher', 'past_due')
          AND market.covers(e, ${s.id}::uuid, market.session_day(
                (SELECT starts_at FROM market.group_sessions WHERE id = ${s.id})))`.execute(sys);
      if (already.rows[0]!.n > 0)
        throw new Problem(
          409,
          'already_in_session',
          'The student already has a seat in that session.',
        );
      return s;
    });
    const g = { groupId: target.group_id, centreId: target.centre_id, seatCap: target.seat_cap };
    // Redis first (holds live there, 08 §4); the database trigger checks the cap again.
    const hold = await this.seats.acquire(g, id, [target.id], LIVE_SEAT_TTL_MS);
    if (!hold.ok) throw sessionFull();
    try {
      const out = await this.db.asSystem(async (sys) => {
        const row = await this.row(sys, id, true);
        if (row.status !== 'requested')
          throw new Problem(409, 'makeup_decided', 'This make-up request was already decided.');
        await sys
          .updateTable('market.makeup_requests')
          .set({
            status: 'accepted',
            makeup_session_id: target.id,
            decided_by: userId,
            decided_at: new Date(),
            decision_note: body.note || null,
          })
          .where('id', '=', id)
          .execute();
        const after = await this.row(sys, id);
        await this.audit(sys, userId, 'makeup.accepted', after, requestId);
        await this.notifyFamily(sys, after, 'makeup_decided', id, 'all');
        return (await this.views(sys, [after], lang))[0]!;
      });
      await this.seats.commit(g, id, [target.id]);
      return out;
    } catch (e) {
      await this.seats.release(g, id, [target.id]);
      if (pgConstraint(e) === 'seat_cap_exceeded') throw sessionFull();
      throw e;
    }
  }

  async decline(
    userId: string,
    id: string,
    body: { note?: string },
    lang: Lang,
    requestId?: string,
  ) {
    await this.centreAccess(userId, id);
    return this.db.asSystem(async (sys) => {
      const row = await this.row(sys, id, true);
      if (row.status !== 'requested')
        throw new Problem(409, 'makeup_decided', 'This make-up request was already decided.');
      await sys
        .updateTable('market.makeup_requests')
        .set({
          status: 'declined',
          decided_by: userId,
          decided_at: new Date(),
          decision_note: body.note || null,
        })
        .where('id', '=', id)
        .execute();
      const after = await this.row(sys, id);
      await this.audit(sys, userId, 'makeup.declined', after, requestId);
      await this.notifyFamily(sys, after, 'makeup_decided', id, 'all');
      return (await this.views(sys, [after], lang))[0]!;
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────────────
  private familyAccess(userId: string, id: string) {
    return this.db.asUser(userId, async (tx, ctx) => {
      const r = await tx
        .selectFrom('market.makeup_requests')
        .select('id')
        .where('id', '=', id)
        .where('student_id', 'in', sql<string>`(SELECT org.family_student_ids())`)
        .executeTakeFirst();
      if (!r) throw notFound('make-up request');
      return ctx;
    });
  }

  private centreAccess(userId: string, id: string) {
    return this.db.asUser(userId, async (tx, ctx) => {
      const r = await tx
        .selectFrom('market.makeup_requests')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!r || !ctx.centreIds.includes(r.centre_id)) throw notFound('make-up request');
      if (!can(ctx, r.centre_id, 'bookings.manage'))
        throw forbidden('You need the bookings.manage permission at this centre.');
      return r;
    });
  }

  private async row(sys: Tx, id: string, lock = false) {
    let q = sys.selectFrom('market.makeup_requests').selectAll().where('id', '=', id);
    if (lock) q = q.forUpdate();
    const r = await q.executeTakeFirst();
    if (!r) throw notFound('make-up request');
    return r;
  }

  private async views(sys: Tx, rows: Awaited<ReturnType<Makeups['row']>>[], lang: Lang) {
    const info = await groupInfo(
      sys,
      rows.map((r) => r.group_id),
      lang,
    );
    const starts = await sessionStarts(
      sys,
      rows.flatMap((r) => [r.missed_session_id, r.makeup_session_id]),
    );
    const students = rows.length
      ? await sys
          .selectFrom('org.students')
          .select(['id', 'display_name'])
          .where('id', 'in', [...new Set(rows.map((r) => r.student_id))])
          .execute()
      : [];
    return rows.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      studentName: students.find((s) => s.id === r.student_id)?.display_name ?? '',
      groupId: r.group_id,
      subject: info.get(r.group_id)!.subject,
      missedSessionId: r.missed_session_id,
      missedStartsAt: starts.get(r.missed_session_id)!.toISOString(),
      requestedBy: r.requested_by as 'student' | 'parent',
      note: r.note,
      status: r.status as 'requested' | 'accepted' | 'declined' | 'withdrawn',
      parentSeenAt: r.parent_seen_at?.toISOString() ?? null,
      decidedAt: r.decided_at?.toISOString() ?? null,
      decisionNote: r.decision_note,
      makeupSessionId: r.makeup_session_id,
      makeupStartsAt: r.makeup_session_id
        ? (starts.get(r.makeup_session_id)?.toISOString() ?? null)
        : null,
      createdAt: r.created_at.toISOString(),
    }));
  }

  /** In-app notifications: to the parents, or to the parents and the student account. */
  private async notifyFamily(
    sys: Tx,
    r: { id: string; student_id: string; group_id: string; centre_id: string },
    kind: 'makeup_requested' | 'makeup_decided',
    eventId: string,
    to: 'parents' | 'all',
  ) {
    await sql`
      INSERT INTO messaging.in_app_notifications (id, user_id, kind, object_type, object_id, student_id, group_id, centre_id, event_id)
      SELECT platform.uuidv7(), who.user_id, ${kind}, 'makeup_request', ${r.id}, ${r.student_id}, ${r.group_id}, ${r.centre_id}, ${eventId}
      FROM (
        SELECT g.user_id FROM org.student_guardians sg JOIN org.guardians g ON g.id = sg.guardian_id
        WHERE sg.student_id = ${r.student_id} AND g.user_id IS NOT NULL
        UNION
        SELECT sa.user_id FROM identity.student_accounts sa
        WHERE sa.student_id = ${r.student_id} AND ${to} = 'all' AND sa.status <> 'closed'
      ) who
      ON CONFLICT DO NOTHING`.execute(sys);
  }

  private audit(
    sys: Tx,
    userId: string,
    action: string,
    r: { id: string; centre_id: string; status: string; makeup_session_id: string | null },
    requestId?: string,
  ) {
    return writeAudit(sys, {
      actorId: userId,
      actorType: 'user',
      centreId: r.centre_id,
      action,
      objectType: 'makeup_request',
      objectRef: r.id,
      after: { status: r.status, makeupSessionId: r.makeup_session_id },
      requestId,
    });
  }
}

const sessionFull = () =>
  new Problem(
    409,
    'session_full',
    'That session is full: accept into another session, or decline with a note.',
  );
