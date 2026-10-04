import { http, HttpResponse, delay } from 'msw';
import type { SaveRecordBody } from '@link/api-client';
import * as mdb from '../db';
import * as mfx from '../data';
import { authed, langOf, problem } from '../http';
import * as fu from './db';

/** Phase 2 endpoints (docs/07 §3 outline; shapes are draft, see api-client/followup.ts). */
export const followupHandlers = [
  // ── Teacher (FUP-REC) ─────────────────────────────────────────────────────────
  http.get(
    '*/v1/teachers/me/today',
    authed(async ({ userId, lang }) => {
      await delay(200);
      return HttpResponse.json(fu.teacherToday(userId, lang));
    }),
  ),
  http.get(
    '*/v1/teachers/me/groups',
    authed(async ({ userId, lang }) => {
      const me = mfx.staff.find((u) => u.id === userId);
      if (!me?.teacherId) return problem(403, 'forbidden', 'Teachers only.');
      await delay(200);
      const now = Date.now();
      return HttpResponse.json(
        mfx.groups
          .filter((g) => g.teacherId === me.teacherId)
          .map((g) => {
            const d = mdb.groupDto(g.id, lang);
            const next = d.upcomingSessions.find((s) => new Date(s.startsAt).getTime() > now);
            return {
              id: g.id,
              name: `${d.schoolYear.name} · ${d.subject.name}`,
              centre: { id: d.centre.id, displayName: d.centre.name },
              room: d.room.name,
              weekdays: d.weekdays,
              startTime: d.startTime,
              endTime: d.endTime,
              sessionFee: d.sessionFee,
              monthlyFee: d.monthlyFee,
              offersMonthlyRecurring: d.offersMonthlyRecurring,
              seatCap: d.seatCap,
              seatsFilled: next ? d.seatCap - next.seatsLeft : 0,
              nextSession: next ? { id: next.id, startsAt: next.startsAt } : null,
              followup: fu.followupSummary(g.id),
            };
          }),
      );
    }),
  ),
  http.get(
    '*/v1/groups/:id/roster',
    authed(({ params, userId, lang }) => HttpResponse.json(fu.roster(userId, params.id!, lang))),
  ),
  http.get(
    '*/v1/groups/:id/session-records',
    authed(({ params, userId, lang }) =>
      HttpResponse.json(fu.listRecords(userId, params.id!, lang)),
    ),
  ),
  http.post(
    '*/v1/groups/:id/session-records',
    authed(async ({ request, params, userId, lang }) => {
      const { groupSessionId } = (await request.json()) as { groupSessionId: string };
      const r = fu.openRecord(userId, params.id!, groupSessionId, lang);
      return HttpResponse.json(r.record, { status: r.created ? 201 : 200 });
    }),
  ),
  http.get(
    '*/v1/session-records/:id',
    authed(({ params, userId, lang }) => HttpResponse.json(fu.getRecord(userId, params.id!, lang))),
  ),
  http.patch(
    '*/v1/session-records/:id',
    authed(async ({ request, params, userId, lang }) =>
      HttpResponse.json(
        fu.saveDraft(userId, params.id!, (await request.json()) as SaveRecordBody, lang),
      ),
    ),
  ),
  http.post(
    '*/v1/session-records/:id/confirm',
    authed(async ({ request, params, userId, lang }) => {
      await delay(300);
      try {
        return HttpResponse.json(
          fu.confirmRecord(userId, params.id!, request.headers.get('idempotency-key'), lang),
        );
      } catch (e) {
        // T08 "after_commit": the commit happened but the client never hears back.
        if (e instanceof fu.DropResponse) return HttpResponse.error();
        throw e;
      }
    }),
  ),
  http.post(
    '*/v1/record-entries/:id/corrections',
    authed(async ({ request, params, userId, lang }) =>
      HttpResponse.json(
        fu.addCorrection(
          userId,
          params.id!,
          (await request.json()) as Parameters<typeof fu.addCorrection>[2],
          lang,
        ),
        { status: 201 },
      ),
    ),
  ),

  // ── Voice (FUP-VOI) ───────────────────────────────────────────────────────────
  http.post(
    '*/v1/voice-notes',
    authed(async ({ request, userId }) =>
      HttpResponse.json(
        fu.createVoiceNote(
          userId,
          (await request.json()) as { sessionRecordId: string; durationS: number },
          request.headers.get('idempotency-key'),
        ),
        { status: 201 },
      ),
    ),
  ),
  http.put('*/__mock/uploads/:id', async ({ request }) => {
    // The signed-URL upload: the mock accepts and discards the audio. Nothing is stored.
    await request.arrayBuffer();
    return new HttpResponse(null, { status: 200 });
  }),
  http.post(
    '*/v1/voice-notes/:id/uploaded',
    authed(({ params, userId }) => HttpResponse.json(fu.voiceUploaded(userId, params.id!))),
  ),
  http.get(
    '*/v1/voice-notes/:id/extraction',
    authed(({ params, userId, lang }) => {
      const x = fu.voiceExtraction(userId, params.id!, lang);
      return x
        ? HttpResponse.json(x)
        : HttpResponse.json({ status: 'transcribing' }, { status: 202 });
    }),
  ),
  http.post(
    '*/v1/voice-extractions/:id/resolve-identity',
    authed(async ({ request, params, userId, lang }) =>
      HttpResponse.json(
        fu.resolveIdentity(
          userId,
          params.id!,
          (await request.json()) as { itemId: string; studentId: string },
          lang,
        ),
      ),
    ),
  ),

  http.post(
    '*/v1/voice-extractions/:id/discard-item',
    authed(async ({ request, params, userId, lang }) => {
      const { itemId } = (await request.json()) as { itemId: string };
      return HttpResponse.json(fu.discardItem(userId, params.id!, itemId, lang));
    }),
  ),

  // ── Students and notes ────────────────────────────────────────────────────────
  http.get(
    '*/v1/students/:id',
    authed(({ params, userId, lang }) =>
      HttpResponse.json(fu.studentDetail(userId, params.id!, lang)),
    ),
  ),
  http.post(
    '*/v1/students/:id/notes',
    authed(async ({ request, params, userId, lang }) =>
      HttpResponse.json(
        fu.addNote(
          userId,
          params.id!,
          (await request.json()) as Parameters<typeof fu.addNote>[2],
          lang,
        ),
        { status: 201 },
      ),
    ),
  ),
  http.post(
    '*/v1/notes/:id/suggest-for-parent',
    authed(({ params, userId, lang }) =>
      HttpResponse.json(fu.suggestNote(userId, params.id!, lang)),
    ),
  ),

  // ── Cases (FUP-CAS) ───────────────────────────────────────────────────────────
  http.get(
    '*/v1/cases',
    authed(({ userId, lang }) =>
      HttpResponse.json({ data: fu.listCases(userId, lang), nextCursor: null }),
    ),
  ),
  http.get(
    '*/v1/cases/:id',
    authed(({ params, userId, lang }) => HttpResponse.json(fu.getCase(userId, params.id!, lang))),
  ),
  http.post(
    '*/v1/cases/:id/attempts',
    authed(async ({ request, params, userId, lang }) =>
      HttpResponse.json(
        fu.addAttempt(
          userId,
          params.id!,
          (await request.json()) as Parameters<typeof fu.addAttempt>[2],
          lang,
        ),
        { status: 201 },
      ),
    ),
  ),
  http.post(
    '*/v1/cases/:id/dismiss',
    authed(async ({ request, params, userId, lang }) => {
      const { reason } = (await request.json()) as { reason: string };
      return HttpResponse.json(fu.dismissCase(userId, params.id!, reason, lang));
    }),
  ),
  http.post(
    '*/v1/cases/:id/reopen',
    authed(({ params, userId, lang }) =>
      HttpResponse.json(fu.reopenCase(userId, params.id!, lang)),
    ),
  ),

  // ── Messages (FUP-MSG) ────────────────────────────────────────────────────────
  http.get(
    '*/v1/messages',
    authed(({ userId, lang }) =>
      HttpResponse.json({ data: fu.listMessages(userId, lang), nextCursor: null }),
    ),
  ),
  http.post(
    '*/v1/messages/drafts',
    authed(async ({ request, userId, lang }) =>
      HttpResponse.json(
        fu.createDraft(
          userId,
          (await request.json()) as Parameters<typeof fu.createDraft>[1],
          lang,
        ),
        { status: 201 },
      ),
    ),
  ),
  http.get(
    '*/v1/messages/:id',
    authed(({ params, userId, lang }) =>
      HttpResponse.json(fu.getMessage(userId, params.id!, lang)),
    ),
  ),
  http.patch(
    '*/v1/messages/:id',
    authed(async ({ request, params, userId, lang }) =>
      HttpResponse.json(
        fu.editMessage(
          userId,
          params.id!,
          (await request.json()) as Parameters<typeof fu.editMessage>[2],
          lang,
        ),
      ),
    ),
  ),
  http.post(
    '*/v1/messages/:id/approve',
    authed(async ({ request, params, userId, lang }) =>
      HttpResponse.json(
        fu.approveMessage(
          userId,
          params.id!,
          (await request.json()) as Parameters<typeof fu.approveMessage>[2],
          lang,
        ),
      ),
    ),
  ),
];

const demoCall =
  (fn: (body: Record<string, unknown>) => unknown) =>
  async ({ request }: { request: Request }) => {
    const body = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
    try {
      return HttpResponse.json(fn(body as Record<string, unknown>) as Record<string, unknown>);
    } catch (e) {
      if (e instanceof mdb.MockProblem) return problem(e.status, e.code, e.detail);
      throw e;
    }
  };

/**
 * Dev-only demo controls (`/__demo/*`). They exist only in the mocks package, which production
 * builds never include; the mock server also refuses to start unless APP_ENV=local.
 */
export const demoHandlers = [
  // Offline switch: every API call fails like a dropped connection.
  http.all('*/v1/*', () => (fu.demoState().offline ? HttpResponse.error() : undefined)),
  http.get(
    '*/__demo/state',
    demoCall(() => fu.demoSnapshot()),
  ),
  http.get('*/__demo/state/:lang', ({ params }) =>
    HttpResponse.json(fu.demoSnapshot(params.lang === 'ar' ? 'ar' : 'en')),
  ),
  http.post(
    '*/__demo/reset',
    demoCall(() => {
      mdb.resetMockDb();
      fu.resetFollowupDb();
      return { ok: true, scenario: 'demo-followup' };
    }),
  ),
  http.post(
    '*/__demo/settings',
    demoCall((b) => {
      const patch: Partial<fu.DemoState> = {};
      if (typeof b.offline === 'boolean') patch.offline = b.offline;
      if (typeof b.phase2 === 'boolean') patch.phase2 = b.phase2;
      if (typeof b.sttDown === 'boolean') patch.sttDown = b.sttDown;
      if (
        b.confirmFault === null ||
        b.confirmFault === 'before_commit' ||
        b.confirmFault === 'after_commit'
      )
        patch.confirmFault = b.confirmFault;
      if (typeof b.marketplace === 'boolean') patch.marketplace = b.marketplace;
      return fu.setDemo(patch);
    }),
  ),
  http.post(
    '*/__demo/new-day',
    demoCall(() => fu.simulateNewDay()),
  ),
  http.post(
    '*/__demo/provider',
    demoCall((b) =>
      fu.providerEvent(
        b.outcome === 'fail' ? 'fail' : 'advance',
        b.messageId as string | undefined,
      ),
    ),
  ),
  http.post(
    '*/__demo/reply',
    demoCall((b) =>
      fu.inboundReply(b.body as string | undefined, b.messageId as string | undefined),
    ),
  ),
];

export { langOf };
