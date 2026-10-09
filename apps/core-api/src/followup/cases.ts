import { sql } from 'kysely';
import { writeAudit } from '../platform/audit';
import type { Database, RlsContext } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import { Problem, forbidden, notFound } from '../platform/problem';
import * as dto from './dto';
import { caseEvent } from './rules';
import {
  type Lang,
  arNum,
  centresWithExtra,
  groupInfo,
  hasPerm,
  requireExtra,
  roleAt,
} from './world';

const CLOSED = ['resolved', 'dismissed'];

/**
 * Follow-up cases (FUP-CAS): an outcome is a contact attempt, kept open until confirmed
 * (BR-APR-10); dismissing needs a reason and the flag stays in history (BR-APR-14); reopening
 * brings it back. Staff with `cases.manage` (the owner always).
 */
export class Cases {
  constructor(private readonly db: Database) {}

  private async access(userId: string, id: string) {
    return this.db.asUser(userId, async (tx, ctx) => {
      const c = await tx
        .selectFrom('followup.cases')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!c || !roleAt(ctx, c.centre_id)) throw notFound('follow-up');
      return { ctx, c };
    });
  }
  private manage(ctx: RlsContext, centreId: string) {
    if (!hasPerm(ctx, centreId, 'cases.manage'))
      throw forbidden('You need the cases.manage permission.');
  }

  async list(userId: string, lang: Lang) {
    const ctx = await this.db.asUser(userId, async (_tx, c) => c);
    return this.db.asSystem(async (sys) => {
      const centres = await centresWithExtra(sys, ctx.centreIds);
      if (!centres.length) throw new Problem(403, 'extra_not_enabled', 'Follow-up is not on here.');
      const ids = await sys
        .selectFrom('followup.cases')
        .select('id')
        .where('centre_id', 'in', centres)
        .orderBy('due_on')
        .orderBy('created_at')
        .execute();
      return {
        data: await dto.cases(
          sys,
          ids.map((r) => r.id),
          lang,
        ),
        nextCursor: null,
      };
    });
  }

  async get(userId: string, id: string, lang: Lang) {
    const { c } = await this.access(userId, id);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, c.centre_id);
      return (await dto.cases(sys, [id], lang))[0]!;
    });
  }

  async attempt(
    userId: string,
    id: string,
    b: {
      channel?: 'phone' | 'whatsapp' | 'sms' | 'meeting';
      result?: 'reached' | 'no_answer' | 'wrong_number' | 'message_sent' | 'replied';
      learned?: string | null;
      nextAction?: string | null;
      followUpOn?: string | null;
      keepOpen?: boolean;
    },
    lang: Lang,
    requestId?: string,
  ) {
    const { ctx, c } = await this.access(userId, id);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, c.centre_id);
      this.manage(ctx, c.centre_id);
      if (CLOSED.includes(c.status))
        throw new Problem(409, 'case_closed', 'Reopen the follow-up first.');
      if (!b.channel || !b.result)
        throw new Problem(422, 'validation_failed', 'Contact method and result are required.');
      await sys
        .insertInto('followup.case_attempts')
        .values({
          id: uuidv7(),
          case_id: id,
          centre_id: c.centre_id,
          channel: b.channel,
          result: b.result,
          learned: b.learned?.trim() || null,
          next_action: b.nextAction?.trim() || null,
          follow_up_on: b.followUpOn ?? null,
          created_by: userId,
        })
        .execute();
      // BR-APR-10: an attempt is not a resolution. By default the case stays open until confirmed.
      const status = b.keepOpen === false ? 'resolved' : 'awaiting_confirmation';
      await sys
        .updateTable('followup.cases')
        .set({
          status,
          outcome: b.learned?.trim() || null,
          closed_at: status === 'resolved' ? new Date() : null,
        })
        .where('id', '=', id)
        .execute();
      await caseEvent(sys, {
        caseId: id,
        centreId: c.centre_id,
        kind: 'outcome',
        text: {
          en: 'Contact recorded. Next step set.',
          ar: 'تم تسجيل التواصل وتحديد الخطوة التالية.',
        },
        actorId: userId,
      });
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: c.centre_id,
        action: 'case.outcome',
        objectType: 'case',
        objectRef: id,
        before: { status: c.status },
        after: { channel: b.channel, result: b.result, status },
        requestId,
      });
      return (await dto.cases(sys, [id], lang))[0]!;
    });
  }

  async dismiss(userId: string, id: string, reason: string, lang: Lang, requestId?: string) {
    const { ctx, c } = await this.access(userId, id);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, c.centre_id);
      this.manage(ctx, c.centre_id);
      const why = reason?.trim();
      if (!why) throw new Problem(422, 'reason_required', 'Give a reason to dismiss.');
      await sys
        .updateTable('followup.cases')
        .set({ status: 'dismissed', dismiss_reason: why, closed_at: new Date() })
        .where('id', '=', id)
        .execute();
      await sys
        .updateTable('followup.signals')
        .set({ status: 'dismissed' })
        .where('id', '=', c.signal_id)
        .execute();
      await caseEvent(sys, {
        caseId: id,
        centreId: c.centre_id,
        kind: 'dismissed',
        text: { en: why, ar: why },
        actorId: userId,
      });
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: c.centre_id,
        action: 'case.dismissed',
        objectType: 'case',
        objectRef: id,
        before: { status: c.status },
        after: { status: 'dismissed' },
        reason: why,
        requestId,
      });
      return (await dto.cases(sys, [id], lang))[0]!;
    });
  }

  async reopen(userId: string, id: string, lang: Lang, requestId?: string) {
    const { ctx, c } = await this.access(userId, id);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, c.centre_id);
      this.manage(ctx, c.centre_id);
      if (!CLOSED.includes(c.status))
        throw new Problem(409, 'case_open', 'This follow-up is already open.');
      // The flag comes back, unless another one of the same rule is open for this student meanwhile.
      const other = await sys
        .selectFrom('followup.signals as s')
        .innerJoin('followup.signals as me', (j) =>
          j
            .onRef('me.rule_id', '=', 's.rule_id')
            .onRef('me.student_id', '=', 's.student_id')
            .onRef('me.group_id', '=', 's.group_id'),
        )
        .select('s.id')
        .where('me.id', '=', c.signal_id)
        .where('s.id', '<>', c.signal_id)
        .where('s.status', 'in', ['open', 'case_opened'])
        .executeTakeFirst();
      if (other)
        throw new Problem(
          409,
          'newer_flag_open',
          'A newer follow-up for this student and rule is open.',
        );
      await sys
        .updateTable('followup.cases')
        .set({ status: 'open', dismiss_reason: null, closed_at: null })
        .where('id', '=', id)
        .execute();
      await sys
        .updateTable('followup.signals')
        .set({ status: 'case_opened' })
        .where('id', '=', c.signal_id)
        .execute();
      await caseEvent(sys, {
        caseId: id,
        centreId: c.centre_id,
        kind: 'reopened',
        text: { en: 'Reopened', ar: 'أعيد فتحها' },
        actorId: userId,
      });
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: c.centre_id,
        action: 'case.reopened',
        objectType: 'case',
        objectRef: id,
        before: { status: c.status },
        after: { status: 'open' },
        requestId,
      });
      return (await dto.cases(sys, [id], lang))[0]!;
    });
  }

  /** V06 "Check a seat": the teacher's other groups for the same subject and year (a read, logged). */
  async seatCheck(userId: string, id: string, lang: Lang) {
    const { c } = await this.access(userId, id);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, c.centre_id);
      const g = await sys
        .selectFrom('market.groups')
        .select(['id', 'teacher_id', 'subject_id', 'school_year_id'])
        .where('id', '=', c.group_id)
        .executeTakeFirstOrThrow();
      const { rows } = await sql<{ id: string; left: number }>`
        SELECT o.id, (o.seat_cap - coalesce((SELECT committed FROM market.seats_committed(ARRAY[s.id])), 0))::int AS left
        FROM market.groups o
        JOIN LATERAL (SELECT id FROM market.group_sessions WHERE group_id = o.id AND starts_at > now()
                      AND status = 'scheduled' ORDER BY starts_at LIMIT 1) s ON true
        WHERE o.teacher_id = ${g.teacher_id} AND o.subject_id = ${g.subject_id}
          AND o.school_year_id = ${g.school_year_id} AND o.id <> ${g.id} AND o.status = 'published'
        ORDER BY left DESC LIMIT 1`.execute(sys);
      const alt = rows[0];
      let text: { en: string; ar: string };
      if (alt) {
        const info = await groupInfo(sys, alt.id);
        const days = info.weekdays.join(', ');
        text = {
          en: `Seat check: ${info.name.en} (days ${days}, ${info.startTime}) — ${alt.left} seats left`,
          ar: `فحص مقعد: ${info.name.ar} (${info.startTime}) — ${arNum(Math.max(0, alt.left))} مقاعد متاحة`,
        };
      } else
        text = {
          en: 'Seat check: the teacher has no other group for this subject and year',
          ar: 'فحص مقعد: لا توجد مجموعة أخرى للمعلّم لنفس المادة والسنة',
        };
      await caseEvent(sys, {
        caseId: id,
        centreId: c.centre_id,
        kind: 'seat_checked',
        text,
        actorId: userId,
      });
      return { text: text[lang], seatsLeft: Math.max(0, alt?.left ?? 0), groupId: alt?.id ?? null };
    });
  }
}
