import { sql } from 'kysely';
import type { WhatsAppSender } from '../adapters/whatsapp';
import type { Phones } from '../identity/phone';
import { writeAudit } from '../platform/audit';
import type { Database, RlsContext, Tx } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import type { Logger } from '../platform/logger';
import { enqueue } from '../platform/outbox';
import { Problem, forbidden, notFound } from '../platform/problem';
import { caseEvent } from './rules';
import {
  type Lang,
  arNum,
  centresWithExtra,
  fmtDate,
  groupInfo,
  hasPerm,
  maskPhone,
  namesOf,
  ref,
  requireExtra,
  roleAt,
} from './world';

type Tone = 'warm' | 'neutral' | 'formal';
type Status =
  'draft' | 'approved' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'not_sendable';
const IN_FLIGHT: Status[] = ['queued', 'sent', 'delivered', 'read'];
const ORDER: Status[] = ['queued', 'sent', 'delivered', 'read'];
const STOP = /^\s*(stop|إيقاف|ايقاف|الغاء|إلغاء)\s*$/i;
const PURPOSE: Record<string, { en: string; ar: string }> = {
  attendance_followup: { en: 'Attendance follow-up', ar: 'متابعة الغياب' },
  score_followup: { en: 'Scores follow-up', ar: 'متابعة الدرجات' },
  participation_followup: { en: 'Participation follow-up', ar: 'متابعة المشاركة' },
  concern_followup: { en: 'Teacher concern follow-up', ar: 'متابعة ملاحظة المعلّم' },
};
const PURPOSE_OF: Record<string, string> = {
  consecutive_absences: 'attendance_followup',
  score_decline: 'score_followup',
  low_participation: 'participation_followup',
  repeated_concern: 'concern_followup',
};
const lastWords = (n: number) =>
  n === 2 ? 'آخر حصتين' : n <= 10 ? `آخر ${arNum(n)} حصص` : `آخر ${arNum(n)} حصة`;

/**
 * Parent messages (FUP-MSG). Drafts are written from CONFIRMED facts only, each with its source
 * (FUP-MSG-01): no LLM, no internal notes. Staff with `messages.approve` approve with the tick
 * (BR-APR-02); the approved text is locked. Link's own status after approval is `queued` (or
 * `not_sendable` without opt-in / after STOP); after that the status moves ONLY on the provider's
 * signed events (BR-APR-11). STOP takes effect at once (BR-DAT-02).
 */
export class Messages {
  constructor(
    private readonly db: Database,
    private readonly sender: WhatsAppSender,
    private readonly phones: Phones,
    private readonly log: Logger,
  ) {}

  // ── access ───────────────────────────────────────────────────────────────────
  private async messageAccess(userId: string, id: string) {
    return this.db.asUser(userId, async (tx, ctx) => {
      const m = await tx
        .selectFrom('messaging.messages')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!m || !roleAt(ctx, m.centre_id)) throw notFound('message');
      return { ctx, m };
    });
  }
  private staffOnly(ctx: RlsContext, centreId: string) {
    if (!hasPerm(ctx, centreId, 'cases.manage') && !hasPerm(ctx, centreId, 'messages.approve'))
      throw forbidden('You need the cases.manage or messages.approve permission.');
  }

  // ── guardian contact (masked) and consents (never cached) ────────────────────
  private async guardian(sys: Tx, guardianId: string) {
    const g = await sys
      .selectFrom('org.guardians as g')
      .leftJoin('identity.users as u', 'u.id', 'g.user_id')
      .select(['g.id', 'g.user_id', 'g.phone_encrypted', 'u.phone_enc', 'u.name'])
      .where('g.id', '=', guardianId)
      .executeTakeFirst();
    if (!g) throw notFound('guardian');
    const enc = g.phone_enc ?? g.phone_encrypted;
    const phone = enc ? this.phones.decrypt(enc) : null;
    const latest = async (kind: string) =>
      sys
        .selectFrom('org.consent_events')
        .select(['granted', 'source'])
        .where('kind', '=', kind)
        .where((w) =>
          w.or([w('guardian_id', '=', g.id), ...(g.user_id ? [w('user_id', '=', g.user_id)] : [])]),
        )
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirst();
    const wa = await latest('whatsapp_updates');
    const sms = await latest('sms_updates');
    return {
      id: g.id,
      displayName: g.name ?? '—',
      phone,
      phoneMasked: maskPhone(phone),
      whatsappOptIn: !!wa?.granted && !!phone,
      smsConsent: !!sms?.granted && !!phone,
      stopped: !!wa && !wa.granted && wa.source === 'whatsapp_stop',
    };
  }

  private async dto(sys: Tx, ids: string[], lang: Lang) {
    if (!ids.length) return [];
    const rows = await sys
      .selectFrom('messaging.messages')
      .selectAll()
      .where('id', 'in', ids)
      .execute();
    const hist = await sys
      .selectFrom('messaging.message_status_events')
      .select(['message_id', 'status', 'created_at'])
      .where('message_id', 'in', ids)
      .orderBy('created_at')
      .execute();
    const replies = await sys
      .selectFrom('messaging.inbound_messages')
      .selectAll()
      .where('message_id', 'in', ids)
      .orderBy('received_at')
      .execute();
    const names = await namesOf(sys, [
      ...rows.flatMap((m) => [m.student_id, m.approved_by, m.sent_manually_by]),
    ]);
    const facts = new Map<string, { text: string; source: string; recordId: string }[]>();
    for (const m of rows) facts.set(m.id, await this.facts(sys, m.case_id, lang));
    const out = [];
    for (const id of ids) {
      const m = rows.find((x) => x.id === id);
      if (!m) continue;
      const g = await this.guardian(sys, m.guardian_id);
      const status = m.delivery_status as Status;
      const blocked = g.stopped ? 'stopped' : !g.whatsappOptIn ? 'not_opted_in' : null;
      out.push({
        id: m.id,
        caseId: m.case_id,
        student: ref(names, m.student_id),
        guardian: {
          id: g.id,
          displayName: g.displayName,
          phoneMasked: g.phoneMasked,
          whatsappOptIn: g.whatsappOptIn,
          smsConsent: g.smsConsent,
          stopped: g.stopped,
        },
        purpose: PURPOSE[m.purpose]?.[lang] ?? m.purpose,
        draft: m.draft,
        finalText: m.final_text,
        tone: m.tone as Tone,
        groundedFacts: facts.get(m.id) ?? [],
        status,
        channel: m.channel as 'whatsapp' | 'sms' | null,
        blockedReason:
          (status === 'draft' || status === 'not_sendable') && this.sender.sends
            ? (blocked as 'stopped' | 'not_opted_in' | null)
            : null,
        approvedBy: m.approved_by ? ref(names, m.approved_by) : null,
        approvedAt: m.approved_at?.toISOString() ?? null,
        failureReason: m.failure_reason,
        replies: replies
          .filter((r) => r.message_id === m.id)
          .map((r) => ({
            id: r.id,
            body: r.body,
            summary: r.summary ?? r.body,
            intent: r.intent ?? (lang === 'ar' ? 'غير محدد' : 'Unclear'),
            receivedAt: r.received_at.toISOString(),
            suggestions: (r.is_stop
              ? ['record_outcome']
              : ['record_outcome', 'check_seat', 'draft_reply']) as (
              'record_outcome' | 'check_seat' | 'draft_reply'
            )[],
          })),
        history: hist
          .filter((h) => h.message_id === m.id)
          .map((h) => ({ status: h.status as Status, at: h.created_at.toISOString() })),
        sentManually:
          m.sent_manually_by && m.sent_manually_at
            ? { by: ref(names, m.sent_manually_by), at: m.sent_manually_at.toISOString() }
            : null,
      });
    }
    return out;
  }

  /** "Grounded in records": every fact the draft uses, each with its source (FUP-MSG-01 AC2). */
  private async facts(sys: Tx, caseId: string | null, lang: Lang) {
    if (!caseId) return [];
    const s = await sys
      .selectFrom('followup.cases as c')
      .innerJoin('followup.signals as s', 's.id', 'c.signal_id')
      .select(['s.evidence', 's.student_id', 's.rule_code'])
      .where('c.id', '=', caseId)
      .executeTakeFirst();
    if (!s) return [];
    const ids = (s.evidence as { recordIds: string[] }).recordIds;
    if (!ids.length) return [];
    const { rows } = await sql<{
      id: string;
      session_date: string;
      attendance: string;
      participation: string;
      score: string | null;
      max_score: string | null;
      confirmed_by: string;
    }>`
      SELECT r.id, r.session_date::text, e.attendance, e.participation, e.score::text, a.max_score::text, r.confirmed_by
      FROM records.session_records r
      JOIN records.record_entries e ON e.session_record_id = r.id AND e.student_id = ${s.student_id}
      LEFT JOIN records.assessments a ON a.id = e.assessment_id
      WHERE r.id = ANY (${ids}::uuid[]) AND r.status = 'confirmed'
      ORDER BY r.session_date`.execute(sys);
    const names = await namesOf(
      sys,
      rows.map((r) => r.confirmed_by),
    );
    const ATT: Record<string, { en: string; ar: string }> = {
      absent: { en: 'Absent', ar: 'غائب' },
      present: { en: 'Present', ar: 'حاضر' },
      late: { en: 'Late', ar: 'متأخر' },
      not_recorded: { en: 'Not recorded', ar: 'غير مسجّل' },
    };
    return rows.map((r) => {
      const by = names.get(r.confirmed_by) ?? '';
      const what =
        s.rule_code === 'score_decline' && r.score != null
          ? lang === 'ar'
            ? `الدرجة • ${fmtDate(r.session_date, lang)} • ${arNum(Number(r.score))} من ${arNum(Number(r.max_score))}`
            : `Score • ${fmtDate(r.session_date, lang)} • ${Number(r.score)} / ${Number(r.max_score)}`
          : s.rule_code === 'low_participation'
            ? lang === 'ar'
              ? `المشاركة • ${fmtDate(r.session_date, lang)} • ${r.participation === 'low' ? 'منخفضة' : r.participation}`
              : `Participation • ${fmtDate(r.session_date, lang)} • ${r.participation}`
            : lang === 'ar'
              ? `الحضور • ${fmtDate(r.session_date, lang)} • ${ATT[r.attendance]!.ar}`
              : `Attendance • ${fmtDate(r.session_date, lang)} • ${ATT[r.attendance]!.en}`;
      return {
        text: `${what} • ${lang === 'ar' ? 'أكّده المعلّم' : 'Teacher confirmed'}`,
        source: lang === 'ar' ? `سجل الحصة • أكّدته ${by}` : `Session record • confirmed by ${by}`,
        recordId: r.id,
      };
    });
  }

  /** Egyptian Arabic, from the flag's confirmed facts only (no LLM; staff edit freely). */
  private async draftText(sys: Tx, caseId: string, tone: Tone) {
    const c = await sys
      .selectFrom('followup.cases as c')
      .innerJoin('followup.signals as s', 's.id', 'c.signal_id')
      .innerJoin('org.centres as ce', 'ce.id', 'c.centre_id')
      .select([
        's.rule_code',
        's.evidence',
        's.params',
        's.student_id',
        's.group_id',
        'ce.name as centre',
      ])
      .where('c.id', '=', caseId)
      .executeTakeFirstOrThrow();
    const names = await namesOf(sys, [c.student_id]);
    const first = (names.get(c.student_id) ?? '').split(' ')[0];
    const g = await groupInfo(sys, c.group_id);
    const ids = (c.evidence as { recordIds: string[] }).recordIds;
    const dates = (
      await sys
        .selectFrom('records.session_records')
        .select(sql<string>`session_date::text`.as('d'))
        .where('id', 'in', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
        .orderBy('session_date')
        .execute()
    ).map((r) => fmtDate(r.d, 'ar'));
    const when = dates.join(' و');
    const subject = g.subject.ar;
    const what =
      c.rule_code === 'consecutive_absences'
        ? `غياب ${first} عن ${lastWords((c.params as { n?: number }).n ?? dates.length)} ${subject} (${when})`
        : c.rule_code === 'score_decline'
          ? `إن درجات ${first} الأخيرة في ${subject} أقل من المعتاد (${when})`
          : c.rule_code === 'low_participation'
            ? `إن مشاركة ${first} في حصص ${subject} كانت أقل من المعتاد (${when})`
            : `ملاحظة المعلّم عن ${first} في ${subject} تكررت مؤخرًا`;
    // Gender is not stored, so the wording stays neutral (sample names are fictional).
    if (tone === 'formal')
      return `السلام عليكم، معكم ${c.centre}. نود إبلاغكم بتسجيل ${what}. يسعدنا التواصل معكم إن كان هناك ما يمكننا المساعدة فيه.`;
    if (tone === 'neutral')
      return `أهلاً بحضرتك، معاك ${c.centre}. سجّلنا ${what}. لو في حاجة نقدر نساعد فيها، بلّغنا.`;
    return `أهلاً بحضرتك، معاك ${c.centre} 😊 حبينا نطمّن على ${first}: سجّلنا ${what}. لو في أي ظرف أو حاجة نقدر نساعد فيها، ياريت تقولنا. شكرًا!`;
  }

  // ── staff ────────────────────────────────────────────────────────────────────
  async list(userId: string, lang: Lang) {
    const ctx = await this.db.asUser(userId, async (_tx, c) => c);
    return this.db.asSystem(async (sys) => {
      const centres = await centresWithExtra(sys, ctx.centreIds);
      if (!centres.length) throw new Problem(403, 'extra_not_enabled', 'Follow-up is not on here.');
      const ids = await sys
        .selectFrom('messaging.messages')
        .select('id')
        .where('centre_id', 'in', centres)
        .orderBy('created_at', 'desc')
        .limit(100)
        .execute();
      return {
        data: await this.dto(
          sys,
          ids.map((r) => r.id),
          lang,
        ),
        nextCursor: null,
      };
    });
  }

  async get(userId: string, id: string, lang: Lang) {
    const { m } = await this.messageAccess(userId, id);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, m.centre_id);
      return (await this.dto(sys, [id], lang))[0]!;
    });
  }

  async draft(userId: string, b: { caseId: string; tone?: Tone }, lang: Lang, requestId?: string) {
    const { ctx, c } = await this.db.asUser(userId, async (tx, ctx) => {
      const c = await tx
        .selectFrom('followup.cases')
        .selectAll()
        .where('id', '=', b.caseId)
        .executeTakeFirst();
      if (!c || !roleAt(ctx, c.centre_id)) throw notFound('follow-up');
      return { ctx, c };
    });
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, c.centre_id);
      this.staffOnly(ctx, c.centre_id);
      const sig = await sys
        .selectFrom('followup.signals')
        .select(['rule_code'])
        .where('id', '=', c.signal_id)
        .executeTakeFirstOrThrow();
      const e = await sys
        .selectFrom('market.enrolments')
        .select('guardian_id')
        .where('student_id', '=', c.student_id)
        .where('group_id', '=', c.group_id)
        .orderBy('created_at', 'desc')
        .executeTakeFirst();
      if (!e) throw new Problem(409, 'no_guardian', 'This student has no guardian on file here.');
      const tone = b.tone ?? 'warm';
      const id = uuidv7();
      const facts = await this.facts(sys, c.id, 'ar');
      await sys
        .insertInto('messaging.messages')
        .values({
          id,
          centre_id: c.centre_id,
          case_id: c.id,
          group_id: c.group_id,
          guardian_id: e.guardian_id,
          student_id: c.student_id,
          purpose: PURPOSE_OF[sig.rule_code] ?? 'attendance_followup',
          draft: await this.draftText(sys, c.id, tone),
          tone,
          grounded_facts: JSON.stringify(facts.map((f) => ({ recordId: f.recordId }))),
          language: 'ar',
          created_by: userId,
        })
        .execute();
      await this.status(sys, id, c.centre_id, 'draft');
      await caseEvent(sys, {
        caseId: c.id,
        centreId: c.centre_id,
        kind: 'message_drafted',
        text: {
          en: 'Parent message drafted (not sent)',
          ar: 'تمت صياغة رسالة لوليّ الأمر (لم تُرسل)',
        },
        actorId: userId,
      });
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: c.centre_id,
        action: 'message.drafted',
        objectType: 'message',
        objectRef: id,
        after: { caseId: c.id, studentId: c.student_id, tone },
        requestId,
      });
      return (await this.dto(sys, [id], lang))[0]!;
    });
  }

  async edit(userId: string, id: string, b: { text?: string; tone?: Tone }, lang: Lang) {
    const { ctx, m } = await this.messageAccess(userId, id);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, m.centre_id);
      this.staffOnly(ctx, m.centre_id);
      if (m.delivery_status !== 'draft')
        throw new Problem(
          409,
          'message_locked',
          'An approved message is locked. Start a new draft to change it.',
        );
      const set: Record<string, unknown> = {};
      if (b.tone && b.tone !== m.tone && m.case_id) {
        set.tone = b.tone;
        set.draft = await this.draftText(sys, m.case_id, b.tone);
      }
      if (b.text !== undefined) {
        if (!b.text.trim()) throw new Problem(422, 'validation_failed', 'The message is empty.');
        set.draft = b.text;
      }
      if (Object.keys(set).length)
        await sys.updateTable('messaging.messages').set(set).where('id', '=', id).execute();
      return (await this.dto(sys, [id], lang))[0]!;
    });
  }

  /**
   * Approval 2 (FUP-MSG-02/03): `messages.approve` and the tick. WhatsApp only with opt-in and no
   * STOP; SMS only with SMS consent; otherwise `not_sendable` with the reason. The send itself is
   * the gateway's (`message.approved` → WhatsAppSender); with the manual provider staff send it.
   */
  async approve(
    userId: string,
    id: string,
    b: { checked?: boolean; channel?: 'whatsapp' | 'sms' },
    lang: Lang,
    requestId?: string,
  ) {
    const { ctx, m } = await this.messageAccess(userId, id);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, m.centre_id);
      if (!hasPerm(ctx, m.centre_id, 'messages.approve'))
        throw forbidden('You need the messages.approve permission.');
      const row = await sys
        .selectFrom('messaging.messages')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (row.delivery_status !== 'draft')
        throw new Problem(409, 'message_locked', 'Already approved.');
      if (b.checked !== true)
        throw new Problem(
          422,
          'check_required',
          'Tick "I checked the student, guardian and dates".',
        );
      const g = await this.guardian(sys, row.guardian_id);
      const at = new Date();
      const base = { final_text: row.draft, approved_by: userId, approved_at: at };
      let status: Status;
      let channel: 'whatsapp' | 'sms' | null = null;
      if (!this.sender.sends)
        status = 'approved'; // manual: staff send it and press "I sent it"
      else {
        const wanted = b.channel ?? 'whatsapp';
        // FUP-MSG-03 AC2, FUP-MSG-07; SMS updates are not sent by Link yet (WhatsApp first).
        channel = wanted === 'whatsapp' && g.whatsappOptIn && !g.stopped ? 'whatsapp' : null;
        status = channel ? 'queued' : 'not_sendable';
      }
      await sys
        .updateTable('messaging.messages')
        .set({
          ...base,
          delivery_status: status,
          channel,
          provider: channel ? this.sender.name : null,
        })
        .where('id', '=', id)
        .execute();
      await this.status(sys, id, row.centre_id, 'approved');
      if (status !== 'approved') await this.status(sys, id, row.centre_id, status);
      if (row.case_id) {
        const c = await sys
          .selectFrom('followup.cases')
          .select(['id', 'status'])
          .where('id', '=', row.case_id)
          .executeTakeFirstOrThrow();
        if (status === 'queued')
          // FUP-MSG-03 AC4: sending logs an attempt; the case stays open ("Sending is not solving").
          await sys
            .insertInto('followup.case_attempts')
            .values({
              id: uuidv7(),
              case_id: c.id,
              centre_id: row.centre_id,
              channel: 'whatsapp',
              result: 'message_sent',
              message_id: id,
              created_by: userId,
            })
            .execute();
        if (c.status === 'open' && status !== 'not_sendable')
          await sys
            .updateTable('followup.cases')
            .set({ status: 'in_progress' })
            .where('id', '=', c.id)
            .execute();
        await caseEvent(sys, {
          caseId: c.id,
          centreId: row.centre_id,
          kind: 'message_approved',
          text:
            status === 'queued'
              ? {
                  en: 'Message approved and queued',
                  ar: 'تم اعتماد الرسالة ووضعها في قائمة الإرسال',
                }
              : status === 'approved'
                ? {
                    en: "Message approved — send it from the centre's WhatsApp",
                    ar: 'تم اعتماد الرسالة — أرسلها من واتساب المركز',
                  }
                : {
                    en: 'Message approved, not sendable (no WhatsApp opt-in or STOP)',
                    ar: 'تم اعتماد الرسالة ولا يمكن إرسالها (لا موافقة على واتساب أو طلب إيقاف)',
                  },
          actorId: userId,
        });
      }
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: row.centre_id,
        action: 'message.approved',
        objectType: 'message',
        objectRef: id,
        after: { caseId: row.case_id, status, channel },
        requestId,
      });
      if (status === 'queued')
        await enqueue(sys, {
          type: 'message.approved',
          aggregateType: 'message',
          aggregateId: id,
          centreId: row.centre_id,
          data: { messageId: id, channel },
          requestId,
        });
      return (await this.dto(sys, [id], lang))[0]!;
    });
  }

  /** FUP-MSG-02 AC3: an approved message is locked; changing it starts a NEW draft. */
  async revise(userId: string, id: string, lang: Lang, requestId?: string) {
    const { ctx, m } = await this.messageAccess(userId, id);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, m.centre_id);
      this.staffOnly(ctx, m.centre_id);
      if (m.delivery_status === 'draft')
        throw new Problem(409, 'still_draft', 'This draft can be edited directly.');
      const nid = uuidv7();
      await sys
        .insertInto('messaging.messages')
        .values({
          id: nid,
          centre_id: m.centre_id,
          case_id: m.case_id,
          group_id: m.group_id,
          guardian_id: m.guardian_id,
          student_id: m.student_id,
          purpose: m.purpose,
          draft: m.final_text ?? m.draft,
          tone: m.tone,
          grounded_facts: JSON.stringify(m.grounded_facts),
          language: m.language,
          created_by: userId,
          revises_id: m.id,
        })
        .execute();
      await this.status(sys, nid, m.centre_id, 'draft');
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: m.centre_id,
        action: 'message.drafted',
        objectType: 'message',
        objectRef: nid,
        after: { revises: m.id, caseId: m.case_id },
        requestId,
      });
      return (await this.dto(sys, [nid], lang))[0]!;
    });
  }

  /**
   * "I sent it" (OD-56): staff sent the approved text themselves. A contact attempt
   * (`whatsapp_manual`) by this person at this time — never a delivery: the status stays
   * `approved` and never becomes Delivered or Read (BR-APR-11).
   */
  async sentManually(userId: string, id: string, lang: Lang, requestId?: string) {
    const { ctx, m } = await this.messageAccess(userId, id);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, m.centre_id);
      this.staffOnly(ctx, m.centre_id);
      const row = await sys
        .selectFrom('messaging.messages')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (row.delivery_status !== 'approved')
        throw new Problem(
          409,
          'not_approved',
          'Only an approved message that Link does not send itself can be marked as sent by hand.',
        );
      if (row.sent_manually_by)
        throw new Problem(
          409,
          'already_sent',
          'Already marked as sent. Start a new draft to send again.',
        );
      const at = new Date();
      await sys
        .updateTable('messaging.messages')
        .set({ sent_manually_by: userId, sent_manually_at: at })
        .where('id', '=', id)
        .execute();
      if (row.case_id) {
        await sys
          .insertInto('followup.case_attempts')
          .values({
            id: uuidv7(),
            case_id: row.case_id,
            centre_id: row.centre_id,
            channel: 'whatsapp_manual',
            result: 'message_sent',
            message_id: id,
            created_by: userId,
          })
          .execute();
        await sys
          .updateTable('followup.cases')
          .set({ status: 'in_progress' })
          .where('id', '=', row.case_id)
          .where('status', '=', 'open')
          .execute();
        await caseEvent(sys, {
          caseId: row.case_id,
          centreId: row.centre_id,
          kind: 'message_sent_manually',
          text: {
            en: "Sent from the centre's WhatsApp (by hand)",
            ar: 'أُرسلت من واتساب المركز (يدويًا)',
          },
          actorId: userId,
        });
      }
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: row.centre_id,
        action: 'message.sent_manually',
        objectType: 'message',
        objectRef: id,
        after: { caseId: row.case_id, channel: 'whatsapp_manual' },
        requestId,
      });
      return (await this.dto(sys, [id], lang))[0]!;
    });
  }

  private async status(
    sys: Tx,
    messageId: string,
    centreId: string,
    status: Status,
    eventId?: string,
  ) {
    await sys
      .insertInto('messaging.message_status_events')
      .values({
        id: uuidv7(),
        message_id: messageId,
        centre_id: centreId,
        status,
        provider_event_id: eventId ?? null,
      })
      .execute();
  }

  // ── the messaging-gateway (consumer of `message.approved`) ───────────────────
  /**
   * Hand an approved, queued message to the provider. Consent is checked again at the last moment:
   * a STOP between approval and sending means it is not sent (BR-DAT-02). Idempotent: the
   * provider dedupes on Link's message ID, and a message with a provider ID is never sent again.
   */
  async send(messageId: string) {
    const m = await this.db.asSystem((sys) =>
      sys
        .selectFrom('messaging.messages')
        .selectAll()
        .where('id', '=', messageId)
        .executeTakeFirst(),
    );
    if (!m || m.delivery_status !== 'queued' || m.provider_message_id || !this.sender.sends)
      return 'skipped';
    const g = await this.db.asSystem((sys) => this.guardian(sys, m.guardian_id));
    if (!g.whatsappOptIn || g.stopped || !g.phone) {
      await this.db.asSystem(async (sys) => {
        await sys
          .updateTable('messaging.messages')
          .set({
            delivery_status: 'not_sendable',
            failure_reason: g.stopped ? 'stopped' : 'not_opted_in',
          })
          .where('id', '=', messageId)
          .where('delivery_status', '=', 'queued')
          .execute();
        await this.status(sys, messageId, m.centre_id, 'not_sendable');
      });
      return 'not_sendable';
    }
    const { providerMessageId } = await this.sender.send({
      to: g.phone,
      body: m.final_text!,
      idempotencyKey: m.id,
    });
    await this.db.asSystem((sys) =>
      sys
        .updateTable('messaging.messages')
        .set({ provider_message_id: providerMessageId })
        .where('id', '=', messageId)
        .where('provider_message_id', 'is', null)
        .execute(),
    );
    return 'handed_over';
  }

  /** Queued messages the gateway has not handed over yet (a send failed, or the queue lost it). */
  async sendPending() {
    const ids = await this.db.asSystem((sys) =>
      sys
        .selectFrom('messaging.messages')
        .select('id')
        .where('delivery_status', '=', 'queued')
        .where('provider_message_id', 'is', null)
        .where('approved_at', '<', new Date(Date.now() - 30_000))
        .execute(),
    );
    for (const { id } of ids)
      await this.send(id).catch((err) => this.log.warn({ err, id }, 'message not handed over'));
    return ids.length;
  }

  // ── provider webhooks (signature checked by the controller first) ────────────
  async webhook(e: {
    eventId: string;
    type: 'status' | 'inbound';
    messageId?: string;
    status?: 'sent' | 'delivered' | 'read' | 'failed';
    reason?: string;
    from?: string;
    body?: string;
    inReplyTo?: string;
    at?: string;
  }) {
    return this.db.asSystem(async (sys) => {
      if (e.type === 'status') {
        const dup = await sys
          .selectFrom('messaging.message_status_events')
          .select('id')
          .where('provider_event_id', '=', e.eventId)
          .executeTakeFirst();
        if (dup) return 'duplicate';
        const m = await sys
          .selectFrom('messaging.messages')
          .selectAll()
          .where('provider_message_id', '=', e.messageId ?? '')
          .forUpdate()
          .executeTakeFirst();
        if (!m || !e.status) return 'unknown_message';
        const cur = m.delivery_status as Status;
        // Never backwards; `failed` only while in flight (BR-APR-11).
        if (!IN_FLIGHT.includes(cur)) return `ignored_${cur}`;
        if (
          e.status === 'failed'
            ? !IN_FLIGHT.slice(0, 2).includes(cur)
            : ORDER.indexOf(e.status) <= ORDER.indexOf(cur)
        )
          return `ignored_${cur}`;
        await sys
          .updateTable('messaging.messages')
          .set({
            delivery_status: e.status,
            ...(e.status === 'failed'
              ? { failure_reason: (e.reason ?? 'Provider reported: not delivered').slice(0, 300) }
              : {}),
          })
          .where('id', '=', m.id)
          .execute();
        await this.status(sys, m.id, m.centre_id, e.status, e.eventId);
        await writeAudit(sys, {
          actorId: null,
          actorType: 'provider',
          centreId: m.centre_id,
          action: 'message.status',
          objectType: 'message',
          objectRef: m.id,
          before: { status: cur },
          after: { status: e.status },
        });
        if (m.case_id && e.status === 'failed')
          await caseEvent(sys, {
            caseId: m.case_id,
            centreId: m.centre_id,
            kind: 'message_failed',
            text: {
              en: 'The provider reported the message was not delivered',
              ar: 'أبلغ المزوّد أن الرسالة لم تصل',
            },
            actorId: null,
          });
        return e.status;
      }
      // An inbound reply, linked to the latest message to that guardian (FUP-MSG-05).
      const dup = await sys
        .selectFrom('messaging.inbound_messages')
        .select('id')
        .where('provider_message_id', '=', e.messageId ?? e.eventId)
        .executeTakeFirst();
      if (dup) return 'duplicate';
      if (!e.from || !e.body) return 'ignored';
      const hmac = this.phones.hmac(e.from.startsWith('+') ? e.from : `+${e.from}`);
      const g = await sys
        .selectFrom('org.guardians as g')
        .leftJoin('identity.users as u', 'u.id', 'g.user_id')
        .select(['g.id', 'g.user_id'])
        .where((w) => w.or([w('u.phone_hmac', '=', hmac), w('g.phone_hmac', '=', hmac)]))
        .executeTakeFirst();
      if (!g) return 'unknown_sender';
      let msg = e.inReplyTo
        ? await sys
            .selectFrom('messaging.messages')
            .selectAll()
            .where('provider_message_id', '=', e.inReplyTo)
            .executeTakeFirst()
        : undefined;
      msg ??= await sys
        .selectFrom('messaging.messages')
        .selectAll()
        .where('guardian_id', '=', g.id)
        .where('delivery_status', 'in', ['sent', 'delivered', 'read'])
        .orderBy('approved_at', 'desc')
        .executeTakeFirst();
      if (!msg) return 'no_message';
      const stop = STOP.test(e.body);
      const id = uuidv7();
      await sys
        .insertInto('messaging.inbound_messages')
        .values({
          id,
          centre_id: msg.centre_id,
          guardian_id: g.id,
          message_id: msg.id,
          channel: 'whatsapp',
          body: e.body.slice(0, 4000),
          is_stop: stop,
          intent: stop ? 'STOP' : null,
          summary: stop ? 'Asked to stop WhatsApp updates' : null,
          provider_message_id: e.messageId ?? e.eventId,
          received_at: e.at ? new Date(e.at) : new Date(),
        })
        .execute();
      if (stop)
        // BR-DAT-02: STOP takes effect at once — an append-only consent row, read on every send.
        await sys
          .insertInto('org.consent_events')
          .values({
            id: uuidv7(),
            user_id: g.user_id,
            guardian_id: g.id,
            kind: 'whatsapp_updates',
            granted: false,
            version: 'stop-reply',
            source: 'whatsapp_stop',
          })
          .execute();
      await sys
        .updateTable('messaging.messages')
        .set({ reply: e.body.slice(0, 500), reply_intent: stop ? 'stop' : null })
        .where('id', '=', msg.id)
        .execute();
      if (msg.case_id)
        await caseEvent(sys, {
          caseId: msg.case_id,
          centreId: msg.centre_id,
          kind: 'parent_replied',
          text: stop
            ? {
                en: 'Parent replied STOP: no more WhatsApp updates',
                ar: 'ردّ وليّ الأمر بإيقاف: لا رسائل واتساب بعد الآن',
              }
            : { en: 'Parent replied', ar: 'ردّ وليّ الأمر' },
          actorId: null,
        });
      await writeAudit(sys, {
        actorId: null,
        actorType: 'provider',
        centreId: msg.centre_id,
        action: stop ? 'message.stop_received' : 'message.reply_received',
        objectType: 'message',
        objectRef: msg.id,
        after: { inboundId: id, caseId: msg.case_id },
      });
      return stop ? 'stop' : 'reply';
    });
  }

  // ── parent (P09) ─────────────────────────────────────────────────────────────
  /** Approved and handed-over messages for the parent's own children, from centres with the extra. */
  async parentUpdates(userId: string, lang: Lang) {
    const rows = await this.db.asUser(userId, async (tx, ctx) => {
      if (!ctx.guardianId) return [];
      // GUARDIAN RLS: only queued/sent/delivered/read rows of this guardian are visible.
      return tx
        .selectFrom('messaging.messages')
        .select(['id', 'student_id', 'final_text', 'approved_at', 'centre_id'])
        .where('guardian_id', '=', ctx.guardianId)
        .orderBy('approved_at', 'desc')
        .execute();
    });
    return this.db.asSystem(async (sys) => {
      const on = await centresWithExtra(
        sys,
        rows.map((r) => r.centre_id),
      );
      const centres = await sys
        .selectFrom('org.centres')
        .select(['id', 'name'])
        .where('id', 'in', on.length ? on : ['00000000-0000-0000-0000-000000000000'])
        .execute();
      void lang;
      return {
        data: rows
          .filter((r) => on.includes(r.centre_id) && r.final_text)
          .map((r) => ({
            id: r.id,
            studentId: r.student_id,
            kind: 'message' as const,
            text: r.final_text!,
            from: centres.find((c) => c.id === r.centre_id)?.name ?? '',
            at: r.approved_at!.toISOString(),
          })),
        nextCursor: null,
      };
    });
  }

  /** CF-39: the children's groups at centres with the extra (P09 when the marketplace is off). */
  async centreGroups(userId: string, lang: Lang) {
    const rows = await this.db.asUser(userId, async (tx, ctx) => {
      if (!ctx.guardianId) return [];
      return tx
        .selectFrom('market.enrolments')
        .select(['student_id', 'group_id', 'centre_id'])
        .where('guardian_id', '=', ctx.guardianId)
        .where('status', 'in', ['confirmed', 'past_due'])
        .execute();
    });
    return this.db.asSystem(async (sys) => {
      const on = await centresWithExtra(
        sys,
        rows.map((r) => r.centre_id),
      );
      const out = [];
      for (const r of rows.filter((x) => on.includes(x.centre_id))) {
        const g = await groupInfo(sys, r.group_id);
        const c = await sys
          .selectFrom('org.centres')
          .select('name')
          .where('id', '=', r.centre_id)
          .executeTakeFirstOrThrow();
        out.push({
          childId: r.student_id,
          groupId: r.group_id,
          groupName: g.name[lang],
          centreName: c.name,
          teacher: { id: g.teacherUserId, displayName: g.teacherName },
          weekdays: g.weekdays,
          startTime: g.startTime,
          endTime: g.endTime,
        });
      }
      return out;
    });
  }
}
