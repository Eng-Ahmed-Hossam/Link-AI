import { http, HttpResponse, delay } from 'msw';
import type { AssistantEvent, RuleChangeBody } from '@link/api-client';
import { MockProblem } from '../db';
import { authed, langOf, problem, userIdOf } from '../http';
import * as fu from './db';
import { features } from '../market/logic';
import { ASSISTANT_VOICE_FIXTURE, assistantTurn, briefing } from './assistant';
import { bridge } from './voice-bridge';

/** One centre per world (the demo's Al Nour, or the pilot centre). Any other id is 404 (10 §2). */
const centre = (id: string | undefined) => {
  if (id !== fu.world().centre.id) throw new MockProblem(404, 'not_found', 'Centre not found.');
};

/** Server-sent events: one `data:` line per event, paced so the answer visibly streams. */
function sse(events: AssistantEvent[]) {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const e of events) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        await new Promise((r) => setTimeout(r, e.type === 'token' ? 35 : 120));
      }
      controller.close();
    },
  });
  return new HttpResponse(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
  });
}

/** Owner web endpoints (Batch 6). Shapes: api-client/followup.ts; docs/07 §2c. */
export const ownerHandlers = [
  http.get(
    '*/v1/centres/:id/today',
    authed(async ({ params, userId, lang }) => {
      centre(params.id);
      await delay(150);
      return HttpResponse.json(fu.ownerToday(userId, lang));
    }),
  ),
  http.get(
    '*/v1/centres/:id/students',
    authed(({ params, userId, lang }) => {
      centre(params.id);
      return HttpResponse.json({ data: fu.centreStudents(userId, lang), nextCursor: null });
    }),
  ),
  http.get(
    '*/v1/centres/:id/sessions',
    authed(({ params, userId, lang }) => {
      centre(params.id);
      return HttpResponse.json({ data: fu.centreSessions(userId, lang), nextCursor: null });
    }),
  ),
  http.get(
    '*/v1/centres/:id/rules',
    authed(({ params, userId, lang }) => {
      centre(params.id);
      return HttpResponse.json(fu.listRules(userId, lang));
    }),
  ),
  http.put(
    '*/v1/centres/:id/rules/:code',
    authed(async ({ request, params, userId, lang }) => {
      centre(params.id);
      return HttpResponse.json(
        fu.changeRule(userId, params.code!, (await request.json()) as RuleChangeBody, lang),
      );
    }),
  ),
  http.post(
    '*/v1/centres/:id/rules/:code/approve',
    authed(({ params, userId, lang }) => {
      centre(params.id);
      return HttpResponse.json(fu.approveRule(userId, params.code!, lang));
    }),
  ),
  http.post(
    '*/v1/centres/:id/rules/:code/reject',
    authed(({ params, userId, lang }) => {
      centre(params.id);
      return HttpResponse.json(fu.rejectRule(userId, params.code!, lang));
    }),
  ),
  http.get(
    '*/v1/centres/:id/staff',
    authed(({ params, userId, lang }) => {
      centre(params.id);
      return HttpResponse.json(fu.staffList(userId, lang));
    }),
  ),
  http.post(
    '*/v1/centres/:id/staff',
    authed(async ({ request, params, userId, lang }) => {
      centre(params.id);
      const b = (await request.json()) as Parameters<typeof fu.inviteStaff>[1];
      return HttpResponse.json(fu.inviteStaff(userId, b, lang), { status: 201 });
    }),
  ),
  http.get(
    '*/v1/centres/:id/activity',
    authed(({ params, userId, lang }) => {
      centre(params.id);
      return HttpResponse.json(fu.activity(userId, lang));
    }),
  ),
  http.get(
    '*/v1/me/updates',
    // Without the Follow-up extra (OD-58) a centre sends no updates, so the feed is empty.
    authed(({ userId, lang }) =>
      HttpResponse.json({
        data: fu.parentCentreIds(userId).some((c) => features(c).followupExtra)
          ? fu.parentUpdates(userId, lang)
          : [],
        nextCursor: null,
      }),
    ),
  ),
  http.get(
    '*/v1/me/centre-groups',
    authed(({ userId, lang }) => HttpResponse.json(fu.parentCentreGroups(userId, lang))),
  ),
  http.post(
    '*/v1/messages/:id/revise',
    authed(({ params, userId, lang }) =>
      HttpResponse.json(fu.reviseMessage(userId, params.id!, lang), { status: 201 }),
    ),
  ),
  http.post(
    '*/v1/cases/:id/seat-check',
    authed(({ params, userId, lang }) => HttpResponse.json(fu.checkSeat(userId, params.id!, lang))),
  ),

  // ── Ask Link (FUP-DSH-05) ──────────────────────────────────────────────────────
  http.get(
    '*/v1/assistant/briefing',
    authed(({ userId, lang }) => HttpResponse.json(briefing(userId, lang))),
  ),
  http.post('*/v1/assistant/turns', async ({ request }) => {
    const userId = userIdOf(request);
    if (!userId) return problem(401, 'unauthenticated', 'Sign in to continue.');
    try {
      const { text } = (await request.json()) as { text: string };
      return sse(assistantTurn(userId, text, langOf(request)));
    } catch (e) {
      if (e instanceof MockProblem) return problem(e.status, e.code, e.detail, e.extra);
      throw e;
    }
  }),
  http.post(
    '*/v1/assistant/transcribe',
    authed(async ({ request }) => {
      const audio = new Uint8Array(await request.arrayBuffer());
      // Demo with real speech-to-text on: the question is transcribed by local Whisper (synthetic
      // data class); the answer stays scripted and is labelled as a demo answer.
      const stt = bridge.assistantStt;
      if (stt) {
        try {
          const text = await stt(audio, request.headers.get('content-type') ?? 'audio/webm');
          return HttpResponse.json({ text, language: 'ar-EG', real: true });
        } catch {
          return problem(503, 'stt_unavailable', 'Speech-to-text is not responding.');
        }
      }
      // Otherwise the recording is read and discarded; the fixture question is returned.
      await delay(600);
      return HttpResponse.json({ text: ASSISTANT_VOICE_FIXTURE, language: 'ar-EG', real: false });
    }),
  ),
];
