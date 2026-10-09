import type { Config } from '../config';
import type { Logger } from '../platform/logger';
import { Problem } from '../platform/problem';
import type { Cases } from './cases';
import type { Messages } from './messages';
import type { Lang } from './world';

/**
 * Ask Link in live mode (FUP-DSH-05, R3.4). OFF unless a local LLM is configured (OLLAMA_URL):
 * every call answers 503 `assistant_unavailable`, and the scripted demo assistant of the mock is
 * never used here. With a local model it answers in the READ tier only, from the caller's open
 * follow-ups (their confirmed facts): no person's name reaches the model — every student name is
 * replaced by a token (<S1>, <S2>…) and restored afterwards (docs/10 §7) — and anything that would
 * send or change something is answered with "needs approval" (it never acts).
 */
export type AssistantEvent =
  | { type: 'token'; text: string }
  | { type: 'tier'; tier: 'read' | 'draft' | 'act' }
  | { type: 'needs_approval'; text: string }
  | { type: 'done' };

const ACT = /(approve|send it|send the|dismiss|close|ابعتها|ابعت|وافق|اعتمد|اقفل|أغلق)/i;

export class Assistant {
  constructor(
    private readonly cases: Cases,
    private readonly messages: Messages,
    private readonly c: Config,
    private readonly log: Logger,
  ) {}

  get available() {
    return !!this.c.OLLAMA_URL;
  }
  private need() {
    if (!this.available)
      throw new Problem(
        503,
        'assistant_unavailable',
        'Ask Link is off: it needs a local language model on this machine.',
      );
  }

  /** V07's opening briefing: the open follow-ups, read from the data (no model involved). */
  async briefing(userId: string, lang: Lang) {
    this.need();
    const cases = (await this.cases.list(userId, lang)).data.filter(
      (c) => !['resolved', 'dismissed'].includes(c.status),
    );
    const msgs = (await this.messages.list(userId, lang)).data;
    const items = cases.map((c) => {
      const draft = msgs.find((m) => m.caseId === c.id && m.status === 'draft');
      const sent = msgs.filter((m) => m.caseId === c.id && m.status !== 'draft').at(0);
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
    return {
      text:
        lang === 'ar'
          ? `صباح الخير. ${new Intl.NumberFormat('ar-EG').format(n)} من أولياء الأمور قد يحتاجون تحديثًا اليوم.`
          : `Good morning. ${n} ${n === 1 ? 'parent may need' : 'parents may need'} an update today.`,
      items,
    };
  }

  /** One turn: read tier only; never acts; names are tokens for the model. */
  async turn(userId: string, text: string, lang: Lang): Promise<AssistantEvent[]> {
    this.need();
    const q = text?.trim();
    if (!q) throw new Problem(422, 'validation_failed', 'Ask something.');
    const ar = lang === 'ar';
    if (ACT.test(q))
      return [
        { type: 'tier', tier: 'act' },
        {
          type: 'needs_approval',
          text: ar
            ? 'الإرسال والاعتماد يحتاجان موافقة شخص من فريق المركز. افتح المتابعة واعتمد الرسالة بنفسك.'
            : 'Sending and approving need a person from the centre. Open the follow-up and approve it yourself.',
        },
        { type: 'done' },
      ];
    const cases = (await this.cases.list(userId, lang)).data.filter(
      (c) => !['resolved', 'dismissed'].includes(c.status),
    );
    // Tokens for every student named in the facts; a question naming several asks, never guesses.
    const names = [...new Map(cases.map((c) => [c.student.id, c.student.displayName])).values()];
    const token = new Map(names.map((n, i) => [n, `<S${i + 1}>`]));
    const firstNames = names.map((n) => n.split(' ')[0]!);
    const hit = names.filter((_, i) => q.includes(firstNames[i]!));
    if (hit.length > 1)
      return [
        { type: 'tier', tier: 'read' },
        ...words(
          ar
            ? `أكثر من طالب يطابق الاسم: ${hit.join('، ')}. أي طالب تقصد؟`
            : `More than one student matches: ${hit.join(', ')}. Which one do you mean?`,
        ),
        { type: 'done' },
      ];
    const hide = (s: string) => {
      let out = s;
      for (const [n, t] of token) out = out.split(n).join(t);
      for (const [i, f] of firstNames.entries()) out = out.split(f).join(`<S${i + 1}>`);
      return out;
    };
    const facts = cases.map(
      (c) =>
        `- ${token.get(c.student.displayName)}: ${hide(c.signal.explanation)}; due ${c.dueOn}; status ${c.status}${c.overdue ? ' (overdue)' : ''}`,
    );
    const prompt = [
      ar
        ? 'أجب بالعربية المصرية باختصار، من الحقائق التالية فقط. لا تخترع شيئًا. الأسماء رموز مثل <S1>؛ اكتبها كما هي.'
        : 'Answer briefly in English, from the facts below only. Invent nothing. Names are tokens like <S1>; write them as they are.',
      'Facts (confirmed records only):',
      ...(facts.length ? facts : ['- no open follow-ups']),
      `Question: ${hide(q)}`,
    ].join('\n');
    let answer: string;
    try {
      const r = await fetch(`${this.c.OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: process.env.ASK_LINK_MODEL || 'qwen3:8b',
          prompt,
          stream: false,
          options: { temperature: 0 },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!r.ok) throw new Error(`ollama ${r.status}`);
      answer = ((await r.json()) as { response?: string }).response ?? '';
    } catch (err) {
      this.log.warn({ err }, 'Ask Link: the local model did not answer');
      throw new Problem(503, 'assistant_unavailable', 'The local language model is not answering.');
    }
    // Restore the names after the model (it never saw them).
    let shown = answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    for (const [n, t] of token) shown = shown.split(t).join(n);
    return [{ type: 'tier', tier: 'read' }, ...words(shown), { type: 'done' }];
  }

  /** A spoken question → text, through ai-service (local Whisper, sample data class only). */
  async transcribe(audio: Buffer, mime: string) {
    this.need();
    if (!this.c.AI_SERVICE_URL || !this.c.AI_SERVICE_TOKEN)
      throw new Problem(503, 'stt_unavailable', 'Speech-to-text is not running on this machine.');
    const form = new FormData();
    form.append('audio', new Blob([audio as unknown as ArrayBuffer], { type: mime }), 'question');
    form.append('dataClass', 'synthetic');
    const r = await fetch(`${this.c.AI_SERVICE_URL}/v1/transcribe`, {
      method: 'POST',
      headers: { 'x-link-internal-token': this.c.AI_SERVICE_TOKEN },
      body: form,
      signal: AbortSignal.timeout(60_000),
    }).catch(() => null);
    if (!r?.ok) throw new Problem(503, 'stt_unavailable', 'Speech-to-text is not responding.');
    return { text: ((await r.json()) as { text: string }).text, language: 'ar-EG', real: true };
  }
}

const words = (text: string): AssistantEvent[] =>
  text.split(/(?<=\s)/).map((w) => ({ type: 'token' as const, text: w }));
