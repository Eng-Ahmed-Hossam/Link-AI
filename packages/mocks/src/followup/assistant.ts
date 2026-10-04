/**
 * Mock "Ask Link" assistant (FUP-DSH-05, V03/V07). It acts AS the signed-in user, with that user's
 * permissions, through three tool tiers: Read (answers from records), Draft (creates a draft for
 * approval) and Act (always needs a person's approval — the assistant never sends or closes
 * anything). Intents are matched on keywords; the real assistant is an LLM in ai-service.
 */
import type { AssistantEvent, PersonRef } from '@link/api-client';
import { MockProblem, type Lang } from '../db';
import * as fx from './data';
import { centreSessions, createDraft, getMessage, listCases, listMessages, ownerToday } from './db';

/** The fixed transcript of the presenter's spoken request (V03). Sample data. */
export const ASSISTANT_VOICE_FIXTURE =
  'ابعت لولي أمر مريم إنها غابت حصتين، وإننا عايزين نطمن عليها';

const words = (text: string): AssistantEvent[] =>
  text.split(/(?<=\s)/).map((w) => ({ type: 'token' as const, text: w }));

/** Every roster student whose first name appears in the request. Several = ask, never guess. */
function findStudents(text: string, lang: Lang): PersonRef[] {
  const t = text.toLowerCase();
  return fx.roster
    .filter((s) =>
      [s.name.en.split(' ')[0]!.toLowerCase(), s.name.ar.split(' ')[0]!].some((f) => t.includes(f)),
    )
    .map((s) => ({ id: s.id, displayName: s.name[lang] }));
}

/** Opening briefing of the panel (V07). */
export function briefing(userId: string, lang: Lang) {
  const cases = listCases(userId, lang).filter(
    (c) => !['resolved', 'dismissed'].includes(c.status),
  );
  const msgs = listMessages(userId, lang);
  const items = cases.map((c) => {
    const draft = msgs.find((m) => m.caseId === c.id && m.status === 'draft');
    // The newest approved message's provider status, so the briefing never reads "no draft yet" after a send.
    const sent = msgs.filter((m) => m.caseId === c.id && m.status !== 'draft').at(-1);
    return {
      caseId: c.id,
      student: c.student,
      reason: c.signal.explanation,
      draftMessageId: draft?.id ?? null,
      latestSent: sent ? { messageId: sent.id, status: sent.status } : null,
      blocked: msgs.find((m) => m.caseId === c.id)?.blockedReason ?? null,
    };
  });
  const n = items.length;
  const text =
    lang === 'ar'
      ? `صباح الخير. ${new Intl.NumberFormat('ar-EG').format(n)} من أولياء الأمور قد يحتاجون تحديثًا اليوم.`
      : `Good morning. ${n} ${n === 1 ? 'parent may need' : 'parents may need'} an update today.`;
  return { text, items };
}

export function assistantTurn(userId: string, text: string, lang: Lang): AssistantEvent[] {
  if (!text?.trim()) throw new MockProblem(422, 'validation_failed', 'Ask something.');
  const ar = lang === 'ar';
  const out: AssistantEvent[] = [];
  const matches = findStudents(text, lang);
  if (matches.length > 1) {
    out.push({ type: 'tier', tier: 'read' });
    out.push(
      ...words(
        ar
          ? `أكثر من طالب يطابق الاسم: ${matches.map((m) => m.displayName).join('، ')}. أي طالب تقصد؟`
          : `More than one student matches: ${matches.map((m) => m.displayName).join(', ')}. Which one do you mean?`,
      ),
    );
    out.push({ type: 'done' });
    return out;
  }
  const student = matches[0] ?? null;
  const wantsSend = /(approve|send it|ابعتها|وافق|اعتمد)/i.test(text);
  const wantsDraft = /(ابعت|رسال|بلّغ|بلغ|note|message|send|tell|write)/i.test(text);

  if (wantsSend && !student) {
    // Act tier: never acts on its own.
    out.push({ type: 'tier', tier: 'act' });
    out.push({
      type: 'needs_approval',
      text: ar
        ? 'الإرسال يحتاج موافقتك: افتح المسودة، راجعها، ثم اعتمدها بنفسك.'
        : 'Sending needs your approval: open the draft, check it, then approve it yourself.',
    });
  } else if (student && wantsDraft) {
    out.push({ type: 'tier', tier: 'draft' });
    const c = listCases(userId, lang).find(
      (x) => x.student.id === student.id && !['resolved', 'dismissed'].includes(x.status),
    );
    if (!c) {
      out.push(
        ...words(
          ar
            ? `لا توجد متابعة مفتوحة لـ${student.displayName}، فلا توجد وقائع مؤكَّدة أصيغ منها رسالة.`
            : `There's no open follow-up for ${student.displayName}, so there are no confirmed facts to draft from.`,
        ),
      );
    } else {
      const existing = listMessages(userId, lang).find(
        (m) => m.caseId === c.id && m.status === 'draft',
      );
      const m = existing ?? createDraft(userId, { caseId: c.id, tone: 'warm' }, lang);
      const full = getMessage(userId, m.id, lang);
      out.push(
        ...words(
          ar
            ? 'تمام. هذا ما وجدته في السجلات المؤكَّدة: '
            : "Got it. Here's what I found in the confirmed records: ",
        ),
      );
      out.push({
        type: 'draft',
        messageId: m.id,
        caseId: c.id,
        student: c.student,
        guardian: full.guardian.displayName,
        evidence: full.groundedFacts.map((f) => f.text),
        tone: full.tone,
      });
      out.push(
        ...words(
          ar
            ? 'المسودة جاهزة بنبرة ودودة. لن يُرسل شيء قبل أن تعتمدها.'
            : 'The draft is ready in a warm tone. Nothing is sent until you approve it.',
        ),
      );
    }
  } else if (/(contact|اتواصل|تواصل|كلّم|كلم)/i.test(text)) {
    out.push({ type: 'tier', tier: 'read' });
    const open = listCases(userId, lang).filter(
      (c) => !['resolved', 'dismissed'].includes(c.status) && c.attempts.length === 0,
    );
    out.push(
      ...words(
        ar
          ? `لم يتم التواصل بعد مع ${new Intl.NumberFormat('ar-EG').format(open.length)}:`
          : `Not contacted yet: ${open.length}.`,
      ),
    );
    out.push({
      type: 'list',
      items: open.map((c) => ({
        label: c.student.displayName,
        detail: c.signal.explanation,
        href: `follow-ups/${c.id}`,
      })),
    });
  } else if (/(summar|لخص|ملخص|لخّص)/i.test(text)) {
    out.push({ type: 'tier', tier: 'read' });
    const d = ownerToday(userId, lang);
    const nf = (n: number) => (ar ? new Intl.NumberFormat('ar-EG').format(n) : String(n));
    out.push(
      ...words(
        ar
          ? `${fx.groupName.ar}: ${nf(fx.roster.length)} طالبًا، السجلات المؤكَّدة ${nf(d.recordsComplete.confirmed)} من ${nf(d.recordsComplete.eligible)}، ومتابعات مفتوحة ${nf(d.followUpToday.length)}.`
          : `${fx.groupName.en}: ${fx.roster.length} students, ${d.recordsComplete.confirmed} of ${d.recordsComplete.eligible} records confirmed, ${d.followUpToday.length} open follow-ups.`,
      ),
    );
  } else if (/(missing|ناقص|records|سجل)/i.test(text)) {
    out.push({ type: 'tier', tier: 'read' });
    const rows = centreSessions(userId, lang).filter((r) => r.status !== 'confirmed');
    out.push(...words(ar ? 'السجلات غير المؤكَّدة:' : 'Records not confirmed:'));
    out.push({
      type: 'list',
      items: rows.map((r) => ({
        label: `${r.groupName} • ${r.sessionDate}`,
        detail: r.status === 'draft' ? (ar ? 'مسودة' : 'Draft') : ar ? 'لم يبدأ' : 'Not started',
        href: r.recordId ? `sessions/${r.recordId}` : null,
      })),
    });
    out.push(...words(ar ? ' البيانات الناقصة لا تعني الغياب.' : ' Missing data is not absence.'));
  } else {
    out.push(
      ...words(
        ar
          ? 'أقدر أساعد في: مين لم يتم التواصل معه، ملخص مجموعة، السجلات الناقصة، أو صياغة رسالة لوليّ أمر من السجلات المؤكَّدة.'
          : 'I can help with: who has not been contacted, a group summary, missing records, or drafting a parent message from confirmed records.',
      ),
    );
  }
  out.push({ type: 'done' });
  return out;
}
