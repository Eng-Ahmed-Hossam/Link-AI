import { http, HttpResponse, delay } from 'msw';
import { normalizeEgyptPhone } from '@link/i18n';
import * as db from './db';
import * as fx from './data';
import { authed, langOf, problem, withScenario } from './http';
import { followupHandlers, demoHandlers } from './followup/handlers';
import { ownerHandlers } from './followup/owner-handlers';
import { marketHandlers } from './market/handlers';
import { storyHandlers } from './story/handlers';
import { demoState } from './followup/db';
import { convertApplications, ownedApplicationCentres } from './market/logic';
import { PHASE2_FLAGS } from '@link/api-client';

/** Me.centreIds / teacherId (07 §2): the sample owner and Reception work at Al Nour. */
const mockMeExtras = (userId: string) => {
  const st = fx.staff.find((x) => x.id === userId);
  return {
    centreIds: [
      ...(st && st.role !== 'teacher' ? ['cen-nour'] : []),
      ...ownedApplicationCentres(userId),
    ],
    teacherId: st?.teacherId ?? null,
  };
};

/** Mock mode accepts this code for every phone number. */
export const MOCK_OTP = '123456';
const OTP_MAX_TRIES = 5; // MKT-ACC-01 AC2

const pageOf = <T>(data: T[]) => ({ data, nextCursor: null });

export const handlers = [
  // Demo controls first: the offline switch must short-circuit every API call.
  ...demoHandlers,
  ...storyHandlers,
  // ── Auth (MKT-ACC-01) ─────────────────────────────────────────────────────────
  http.post('*/v1/auth/otp/request', async ({ request }) => {
    const { phone } = (await request.json()) as { phone: string };
    const national = normalizeEgyptPhone(phone ?? '');
    if (!national) return problem(422, 'invalid_phone', 'Enter an Egyptian mobile number.');
    db.otpReset(`+20${national}`);
    await delay(400);
    return HttpResponse.json({ resendAfterSeconds: 60, expiresInSeconds: 300 });
  }),
  http.post('*/v1/auth/otp/verify', async ({ request }) => {
    const { phone, code } = (await request.json()) as { phone: string; code: string };
    const national = normalizeEgyptPhone(phone ?? '');
    if (!national) return problem(422, 'invalid_phone', 'Enter an Egyptian mobile number.');
    const e164 = `+20${national}`;
    const st = db.otpState(e164);
    await delay(400);
    if (Date.now() - st.sentAt > 300_000)
      return problem(422, 'otp_expired', 'This code has expired. Ask for a new one.');
    if (st.attempts >= OTP_MAX_TRIES)
      return problem(429, 'otp_locked', 'Too many tries. Ask for a new code.', {
        remainingAttempts: 0,
      });
    if (code !== MOCK_OTP) {
      st.attempts += 1;
      db.persist();
      return problem(422, 'otp_invalid', 'That code is not right.', {
        remainingAttempts: OTP_MAX_TRIES - st.attempts,
      });
    }
    const existing = db.userByPhone(e164);
    const user = existing ?? db.registerUser(e164);
    db.otpReset(e164);
    // MKT-CEN-01: a join request from this number becomes a pending centre it owns.
    if (convertApplications(e164, user.id)) db.addRole(user.id, 'centre_owner');
    return HttpResponse.json({
      accessToken: `mock.${user.id}`,
      refreshToken: `mock-refresh.${user.id}`,
      isNewUser: !existing,
      user: {
        id: user.id,
        name: user.id === fx.parent.id ? db.parentName(langOf(request)) : user.name,
        language: langOf(request),
        roles: user.roles,
        ...mockMeExtras(user.id),
      },
    });
  }),
  // MKT-ACC-04: mock tokens never expire, so refresh hands back the same pair and logout is a no-op.
  http.post('*/v1/auth/refresh', async ({ request }) => {
    const { refreshToken } = ((await request.json().catch(() => ({}))) ?? {}) as {
      refreshToken?: string;
    };
    const userId = refreshToken?.startsWith('mock-refresh.')
      ? refreshToken.slice('mock-refresh.'.length)
      : null;
    if (!userId || !db.userById(userId))
      return problem(401, 'refresh_invalid', 'Sign in again to continue.');
    return HttpResponse.json({
      accessToken: `mock.${userId}`,
      refreshToken: `mock-refresh.${userId}`,
    });
  }),
  http.post('*/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
  http.patch(
    '*/v1/me',
    authed(async ({ request, userId, lang }) => {
      const body = (await request.json()) as { name?: string; language?: string };
      if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 80))
        return problem(422, 'validation_failed', 'Enter a name of up to 80 characters.');
      if (body.language !== undefined && body.language !== 'ar' && body.language !== 'en')
        return problem(422, 'validation_failed', 'Language is ar or en.');
      const u = db.updateUser(userId, body);
      if (!u) return problem(401, 'unauthenticated', 'Sign in to continue.');
      return HttpResponse.json({
        id: u.id,
        name: u.name,
        language: body.language ?? lang,
        roles: u.roles,
      });
    }),
  ),
  // Teacher invitations (decided 2026-10-09): one waits in the sample world (+20 10 0000 0008).
  http.get(
    '*/v1/me/invites',
    authed(({ userId, lang }) => HttpResponse.json(db.invitesFor(userId, lang))),
  ),
  http.post(
    '*/v1/me/invites/:id/accept',
    authed(({ params, userId, lang }) => {
      const left = db.acceptInvite(userId, params.id!, lang);
      return left
        ? HttpResponse.json(left)
        : problem(404, 'not_found', 'This invitation does not exist or you cannot see it.');
    }),
  ),
  http.get(
    '*/v1/me/consents',
    authed(({ userId }) => HttpResponse.json({ data: db.consentsOf(userId) })),
  ),
  http.put(
    '*/v1/me/consents',
    authed(async ({ request, userId }) => {
      const body = (await request.json()) as Parameters<typeof db.putConsent>[1];
      if (!body?.kind || typeof body.granted !== 'boolean' || !body.version)
        return problem(422, 'validation_failed', 'kind, granted and version are required.');
      return HttpResponse.json({ data: db.putConsent(userId, body) });
    }),
  ),
  // PDPL data requests (MKT-OPS-09): the person asks; Link ops complete them (live only).
  http.get(
    '*/v1/me/data-requests',
    authed(({ userId }) => HttpResponse.json(db.dataRequestsOf(userId))),
  ),
  http.post(
    '*/v1/me/data-requests',
    authed(async ({ request, userId }) => {
      const body = (await request.json().catch(() => ({}))) as { kind?: string; details?: string };
      if (!['access', 'correction', 'deletion'].includes(body.kind ?? ''))
        return problem(422, 'validation_failed', 'kind is access, correction or deletion.');
      const r = db.createDataRequest(
        userId,
        body.kind as 'access' | 'correction' | 'deletion',
        (body.details ?? '').trim().slice(0, 2000),
      );
      return r
        ? HttpResponse.json(r, { status: 201 })
        : problem(409, 'already_open', 'You already have an open request of this kind.');
    }),
  ),
  // E0-09: the global flags the demo settings stand for (core-api reads platform.feature_flags).
  http.get('*/v1/feature-flags', () => {
    const d = demoState();
    return HttpResponse.json({
      flags: {
        'marketplace.enabled': d.marketplace !== false,
        ...Object.fromEntries(PHASE2_FLAGS.map((k) => [k, d.phase2])),
      },
    });
  }),
  http.get(
    '*/v1/me',
    authed(({ userId, lang }) => {
      const u = db.userById(userId);
      if (!u) return problem(401, 'unauthenticated', 'Sign in to continue.');
      return HttpResponse.json({
        id: u.id,
        name:
          u.id === fx.parent.id
            ? db.parentName(lang)
            : (fx.staff.find((x) => x.id === u.id)?.name[lang] ?? u.name),
        language: lang,
        roles: u.roles,
        ...mockMeExtras(u.id),
      });
    }),
  ),
  http.post(
    '*/v1/me/roles',
    authed(async ({ request, userId, lang }) => {
      const { role } = (await request.json()) as { role: string };
      if (!['parent', 'teacher', 'centre_owner'].includes(role))
        return problem(422, 'invalid_role', 'Unknown role.');
      const u = db.addRole(userId, role)!;
      return HttpResponse.json({ id: u.id, name: u.name, language: lang, roles: u.roles });
    }),
  ),
  http.get(
    '*/v1/me/children',
    authed(async ({ userId, lang }) => {
      const sc = db.mockSettings().scenario;
      if (sc === 'empty') return HttpResponse.json(pageOf([]));
      return HttpResponse.json(pageOf(db.childrenOf(userId, lang)));
    }),
  ),
  http.post(
    '*/v1/me/children',
    authed(async ({ request, userId, lang }) => {
      const body = (await request.json()) as {
        displayName: string;
        curriculumId: string;
        schoolYearId: string;
      };
      if (!body.displayName?.trim() || !body.curriculumId || !body.schoolYearId)
        return problem(422, 'validation_failed', 'Name, curriculum and school year are required.');
      return HttpResponse.json(db.addChild(userId, body, lang), { status: 201 });
    }),
  ),

  // ── Reference data ────────────────────────────────────────────────────────────
  http.get('*/v1/curricula', ({ request }) => {
    const lang = langOf(request);
    return HttpResponse.json(
      fx.curricula.map((c) => ({
        ...db.curriculumRef(c.id, lang),
        schoolYears: fx.schoolYears
          .filter((y) => y.curriculumId === c.id)
          .map((y) => db.schoolYearRef(y.id, lang)),
      })),
    );
  }),
  http.get('*/v1/subjects', ({ request }) =>
    HttpResponse.json(fx.subjects.map((s) => db.subjectRef(s.id, langOf(request)))),
  ),

  // ── Discovery (MKT-DSC) ───────────────────────────────────────────────────────
  http.get(
    '*/v1/search/centres',
    withScenario(
      ({ request }) => {
        const u = new URL(request.url).searchParams;
        const num = (k: string) => (u.get(k) ? Number(u.get(k)) : undefined);
        return HttpResponse.json(
          db.searchCentres(
            {
              subjectId: u.get('subjectId') ?? undefined,
              curriculumId: u.get('curriculumId') ?? undefined,
              schoolYearId: u.get('schoolYearId') ?? undefined,
              radiusKm: num('radiusKm'),
              minRating: num('minRating'),
              maxFeePt: num('maxFeePt'),
              seatsOpen: u.get('seatsOpen') === 'true',
              verifiedOnly: u.get('verifiedOnly') === 'true',
              sort: u.get('sort') ?? undefined,
              q: u.get('q') ?? undefined,
            },
            langOf(request),
          ),
        );
      },
      () => ({ data: [], nextCursor: null, totals: { centres: 0, teachers: 0 } }),
    ),
  ),
  http.get(
    '*/v1/search/teachers',
    withScenario(
      ({ request }) => {
        const u = new URL(request.url).searchParams;
        return HttpResponse.json(
          db.searchTeachers(
            {
              subjectId: u.get('subjectId') ?? undefined,
              curriculumId: u.get('curriculumId') ?? undefined,
              schoolYearId: u.get('schoolYearId') ?? undefined,
              radiusKm: u.get('radiusKm') ? Number(u.get('radiusKm')) : undefined,
            },
            langOf(request),
          ),
        );
      },
      () => pageOf([]),
    ),
  ),
  http.get(
    '*/v1/centres/by-slug/:slug',
    withScenario(
      ({ request, params }) => {
        const u = new URL(request.url).searchParams;
        const p = db.centreProfile(String(params.slug), langOf(request), {
          schoolYearId: u.get('schoolYearId') ?? undefined,
          subjectId: u.get('subjectId') ?? undefined,
        });
        return p ? HttpResponse.json(p) : problem(404, 'not_found', 'Centre not found.');
      },
      () => ({}),
    ),
  ),
  http.get(
    '*/v1/teachers/by-slug/:slug',
    withScenario(
      ({ request, params }) => {
        const p = db.teacherProfile(String(params.slug), langOf(request));
        return p ? HttpResponse.json(p) : problem(404, 'not_found', 'Teacher not found.');
      },
      () => ({}),
    ),
  ),
  http.get('*/v1/groups/:id', async ({ request, params }) => {
    if (db.mockSettings().scenario === 'offline') return HttpResponse.error();
    await delay(200);
    try {
      return HttpResponse.json(db.groupDto(String(params.id), langOf(request)));
    } catch {
      return problem(404, 'not_found', 'Group not found.');
    }
  }),

  // ── Enrolment and payment (MKT-ENR) ───────────────────────────────────────────
  http.post(
    '*/v1/enrolments',
    authed(async ({ request, userId, lang }) => {
      const key = request.headers.get('idempotency-key');
      if (!key)
        return problem(400, 'idempotency_key_required', 'Idempotency-Key header is required.');
      await delay(400);
      const r = db.createEnrolment(
        userId,
        (await request.json()) as Parameters<typeof db.createEnrolment>[1],
        key,
        lang,
      );
      return HttpResponse.json(r.dto, {
        status: r.replayed ? 200 : 201,
        headers: r.replayed ? { 'idempotent-replayed': 'true' } : {},
      });
    }),
  ),
  http.post(
    '*/v1/enrolments/:id/checkout',
    authed(async ({ request, params, userId }) => {
      const { method } = (await request.json()) as { method: 'card' | 'fawry' | 'wallet' };
      await delay(400);
      return HttpResponse.json(db.checkout(params.id!, userId, method));
    }),
  ),
  http.get(
    '*/v1/enrolments/:id',
    authed(({ params, userId, lang }) => {
      if (db.mockSettings().scenario === 'offline') return HttpResponse.error();
      return HttpResponse.json(db.getEnrolment(params.id!, userId, lang));
    }),
  ),
  http.get(
    '*/v1/me/enrolments',
    authed(async ({ userId, lang }) => {
      const sc = db.mockSettings().scenario;
      if (sc === 'offline') return HttpResponse.error();
      if (sc === 'error')
        return problem(503, 'service_unavailable', 'The service is not responding.');
      await delay(sc === 'slow' ? 4000 : 250);
      return HttpResponse.json(pageOf(sc === 'empty' ? [] : db.myEnrolments(userId, lang)));
    }),
  ),
  http.post(
    '*/v1/enrolments/:id/cancel',
    authed(({ params, userId, lang }) =>
      HttpResponse.json(db.cancelEnrolment(params.id!, userId, lang)),
    ),
  ),
  http.post(
    '*/v1/enrolments/:id/refund-requests',
    authed(({ params, userId, lang }) =>
      HttpResponse.json(db.refundRequest(params.id!, userId, lang)),
    ),
  ),
  http.post(
    '*/v1/enrolments/:id/plan/cancel',
    authed(({ params, userId, lang }) =>
      HttpResponse.json(db.cancelPlan(params.id!, userId, lang)),
    ),
  ),
  http.post(
    '*/v1/groups/:id/waitlist',
    authed(async ({ request, params, userId }) => {
      const { studentId } = (await request.json()) as { studentId: string };
      return HttpResponse.json(db.joinWaitlist(params.id!, userId, studentId), { status: 201 });
    }),
  ),

  // ── Reviews (MKT-REV-01) ──────────────────────────────────────────────────────
  http.post(
    '*/v1/reviews',
    authed(async ({ request, userId }) => {
      const key = request.headers.get('idempotency-key') ?? '';
      await delay(400);
      const r = db.createReview(
        userId,
        (await request.json()) as Parameters<typeof db.createReview>[1],
        key,
      );
      return HttpResponse.json(r.dto, { status: r.replayed ? 200 : 201 });
    }),
  ),

  // ── Mock provider (stands in for fake-pay's hosted page in mock mode) ─────────
  http.get('*/__mock/payments/:id', ({ params }) => {
    const p = db.mockPayment(String(params.id));
    return p ? HttpResponse.json(p) : problem(404, 'not_found', 'Payment not found.');
  }),
  http.post('*/__mock/payments/:id/complete', async ({ request, params }) => {
    const { result } = (await request.json()) as { result: 'succeeded' | 'failed' };
    try {
      return HttpResponse.json(db.completeMockPayment(String(params.id), result));
    } catch (e) {
      if (e instanceof db.MockProblem) return problem(e.status, e.code, e.detail);
      throw e;
    }
  }),
  // The parent pays at a Fawry outlet: the same Demo path as core-api's (local only there).
  http.post('*/__demo/fawry/:enrolmentId/pay', ({ params }) => {
    db.payFawryAtOutlet(String(params.enrolmentId));
    return HttpResponse.json({ ok: true });
  }),
  ...followupHandlers,
  ...ownerHandlers,
  ...marketHandlers,
];
