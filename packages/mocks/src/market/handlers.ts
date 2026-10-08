import { http, HttpResponse, delay } from 'msw';
import type {
  AutoApproveRules,
  CentreApplicationBody,
  GroupPatch,
  HallPatch,
  NewHallBody,
  NewGroupBody,
  RentEstimateBody,
  ReviewTab,
  RoomRequestBody,
  StaffPermission,
  TeacherSelfPatch,
} from '@link/api-client';
import * as fx from '../data';
import { MockProblem } from '../db';
import { authed, problem } from '../http';
import * as mk from './logic';
import { SAMPLE_RECEPTION_PERMISSIONS, parentCentreIds } from '../followup/db';

/** The signed-in user's marketplace roles (sample accounts: followup/data.ts staff). */
const who = (userId: string) => fx.staff.find((u) => u.id === userId);
const STAFF_CENTRE = 'cen-nour';
/**
 * Owner, or staff of this centre holding the permission (10 §1: `bookings.manage` for room
 * requests, `reviews.reply` for reviews). One sample centre has staff accounts.
 */
function staffOf(
  userId: string,
  centreId: string,
  ownerOnly = false,
  permission?: StaffPermission,
) {
  const u = who(userId);
  const staffOk =
    !ownerOnly &&
    u?.role === 'centre_staff' &&
    (!permission || SAMPLE_RECEPTION_PERMISSIONS.includes(permission));
  const ok = centreId === STAFF_CENTRE && (u?.role === 'centre_owner' || staffOk);
  if (!ok)
    throw new MockProblem(
      403,
      'forbidden',
      ownerOnly ? 'Centre owners only.' : 'Centre staff only.',
    );
}
function teacherOf(userId: string): string {
  const id = who(userId)?.teacherId;
  if (!id) throw new MockProblem(403, 'forbidden', 'Teachers only.');
  return id;
}
const hallCentre = (hallId: string) =>
  mk.centreHalls(STAFF_CENTRE, 'en').some((h) => h.id === hallId) ? STAFF_CENTRE : 'other';

/** Marketplace operations: centre web (Batch 2) and teacher app (Batch 3). docs/07 names. */
export const marketHandlers = [
  // C01 — public: no account yet.
  http.post('*/v1/centre-applications', async ({ request }) => {
    try {
      const body = (await request.json()) as CentreApplicationBody;
      await delay(300);
      return HttpResponse.json(mk.applyToJoin(body), { status: 201 });
    } catch (e) {
      if (e instanceof MockProblem) return problem(e.status, e.code, e.detail);
      throw e;
    }
  }),
  http.get(
    '*/v1/centres/:id/profile',
    authed(({ params, userId, lang }) => {
      staffOf(userId, params.id!);
      return HttpResponse.json(mk.centreProfile(params.id!, lang));
    }),
  ),
  http.patch(
    '*/v1/centres/:id',
    authed(async ({ request, params, userId, lang }) => {
      staffOf(userId, params.id!, true);
      const body = (await request.json()) as {
        about?: string;
        photos?: number;
        location?: { lat: number; lng: number; address: string };
      };
      const { location, ...rest } = body;
      if (location) mk.moveCentrePin(params.id!, location, lang);
      return HttpResponse.json(mk.patchCentreProfile(params.id!, rest, lang));
    }),
  ),
  http.post(
    '*/v1/centres/:id/rooms',
    authed(async ({ request, params, userId, lang }) => {
      staffOf(userId, params.id!, true);
      const body = (await request.json()) as NewHallBody;
      return HttpResponse.json(mk.addHall(params.id!, body, lang), { status: 201 });
    }),
  ),
  http.get(
    '*/v1/centres/:id/rooms',
    authed(({ params, userId, lang }) => {
      staffOf(userId, params.id!);
      return HttpResponse.json(mk.centreHalls(params.id!, lang));
    }),
  ),
  http.get(
    '*/v1/centres/:id/schedule',
    authed(async ({ params, userId, lang }) => {
      staffOf(userId, params.id!);
      await delay(150);
      return HttpResponse.json(mk.centreSchedule(params.id!, lang));
    }),
  ),
  http.get(
    '*/v1/centres/:id/settings/auto-approve',
    authed(({ params, userId }) => {
      staffOf(userId, params.id!);
      return HttpResponse.json(mk.autoApprove(params.id!));
    }),
  ),
  http.put(
    '*/v1/centres/:id/settings/auto-approve',
    authed(async ({ request, params, userId }) => {
      staffOf(userId, params.id!, true);
      return HttpResponse.json(
        mk.putAutoApprove(params.id!, (await request.json()) as AutoApproveRules),
      );
    }),
  ),
  http.get(
    '*/v1/centres/:id/rent-income',
    authed(({ params, userId, lang }) => {
      staffOf(userId, params.id!, true);
      return HttpResponse.json(mk.rentIncome(params.id!, lang));
    }),
  ),
  http.get(
    '*/v1/centres/:id/features',
    authed(({ params }) => HttpResponse.json(mk.features(params.id!))),
  ),
  http.get(
    '*/v1/me/reviews-received',
    authed(({ request, userId, lang }) => {
      const q = new URL(request.url).searchParams;
      const centreId = q.get('centreId') ?? STAFF_CENTRE;
      staffOf(userId, centreId);
      const tab: ReviewTab =
        q.get('status') === 'reported'
          ? 'reported'
          : q.get('visibility') === 'private'
            ? 'private'
            : 'public';
      return HttpResponse.json(mk.reviewsReceived(centreId, tab, lang));
    }),
  ),
  http.post(
    '*/v1/reviews/:id/reply',
    authed(async ({ request, params, userId }) => {
      staffOf(userId, STAFF_CENTRE, false, 'reviews.reply');
      const { body } = (await request.json()) as { body: string };
      return HttpResponse.json(mk.replyReview(params.id!, body));
    }),
  ),
  http.post(
    '*/v1/reviews/:id/report',
    authed(async ({ request, params, userId }) => {
      staffOf(userId, STAFF_CENTRE, false, 'reviews.reply');
      const { reason } = (await request.json()) as { reason: string };
      return HttpResponse.json(mk.reportReview(params.id!, reason));
    }),
  ),
  // Halls (C05) and search (J01): the search route first, so it is not read as a hall id.
  http.get(
    '*/v1/rooms/search',
    authed(async ({ request, userId, lang }) => {
      teacherOf(userId);
      const q = new URL(request.url).searchParams;
      await delay(200);
      return HttpResponse.json(
        mk.searchRooms(
          {
            students: q.get('minCapacity') ? Number(q.get('minCapacity')) : undefined,
            weekdays: q.get('weekday') ? q.get('weekday')!.split(',').map(Number) : undefined,
            maxKm: q.get('radiusKm') ? Number(q.get('radiusKm')) : undefined,
          },
          lang,
        ),
      );
    }),
  ),
  http.post(
    '*/v1/rooms/:id/rent-estimate',
    authed(async ({ request, userId }) => {
      const t = teacherOf(userId);
      return HttpResponse.json(mk.rentEstimate(t, (await request.json()) as RentEstimateBody));
    }),
  ),
  http.patch(
    '*/v1/rooms/:id',
    authed(async ({ request, params, userId, lang }) => {
      staffOf(userId, hallCentre(params.id!), true);
      return HttpResponse.json(mk.patchHall(params.id!, (await request.json()) as HallPatch, lang));
    }),
  ),
  // Room requests (C06, J02, J03)
  http.get(
    '*/v1/room-requests',
    authed(({ request, userId, lang }) => {
      const q = new URL(request.url).searchParams;
      if (q.get('scope') === 'mine')
        return HttpResponse.json(mk.myRequests(teacherOf(userId), lang));
      const centreId = q.get('centreId') ?? STAFF_CENTRE;
      staffOf(userId, centreId, false, 'bookings.manage');
      return HttpResponse.json(mk.centreRequests(centreId, lang));
    }),
  ),
  http.post(
    '*/v1/room-requests',
    authed(async ({ request, userId, lang }) => {
      const t = teacherOf(userId);
      return HttpResponse.json(
        mk.createRequest(t, (await request.json()) as RoomRequestBody, lang),
        {
          status: 201,
        },
      );
    }),
  ),
  http.post(
    '*/v1/room-requests/:id/stage',
    authed(async ({ request, params, userId, lang }) => {
      staffOf(userId, STAFF_CENTRE, false, 'bookings.manage');
      const { stage, at } = (await request.json()) as {
        stage: 'phone_call' | 'meeting';
        at?: string;
      };
      return HttpResponse.json(mk.moveRequest(params.id!, stage, at, lang));
    }),
  ),
  http.post(
    '*/v1/room-requests/:id/approve',
    authed(({ params, userId, lang }) => {
      staffOf(userId, STAFF_CENTRE, false, 'bookings.manage');
      return HttpResponse.json(mk.approveRequest(params.id!, lang));
    }),
  ),
  http.post(
    '*/v1/room-requests/:id/decline',
    authed(async ({ request, params, userId, lang }) => {
      staffOf(userId, STAFF_CENTRE, false, 'bookings.manage');
      const { reason } = (await request.json()) as { reason: string };
      return HttpResponse.json(mk.declineRequest(params.id!, reason, lang));
    }),
  ),
  http.post(
    '*/v1/room-requests/:id/withdraw',
    authed(({ params, userId, lang }) =>
      HttpResponse.json(mk.withdrawRequest(params.id!, teacherOf(userId), lang)),
    ),
  ),
  // Teacher self (J04), bookings, groups (J05), enrolments (J06), earnings (J07)
  http.get(
    '*/v1/teachers/me',
    authed(({ userId, lang }) => HttpResponse.json(mk.teacherSelf(teacherOf(userId), lang))),
  ),
  http.patch(
    '*/v1/teachers/me',
    authed(async ({ request, userId, lang }) =>
      HttpResponse.json(
        mk.patchTeacherSelf(teacherOf(userId), (await request.json()) as TeacherSelfPatch, lang),
      ),
    ),
  ),
  http.get(
    '*/v1/room-bookings',
    authed(({ userId, lang }) => HttpResponse.json(mk.teacherBookings(teacherOf(userId), lang))),
  ),
  http.get(
    '*/v1/me/features',
    authed(({ userId }) =>
      HttpResponse.json({
        followupExtra: parentCentreIds(userId).some((c) => mk.features(c).followupExtra),
      }),
    ),
  ),
  http.get(
    '*/v1/teachers/me/features',
    authed(({ userId }) => HttpResponse.json(mk.teacherFeatures(teacherOf(userId)))),
  ),
  http.patch(
    '*/v1/groups/:id',
    authed(async ({ request, params, userId }) =>
      HttpResponse.json(
        mk.updateGroup(teacherOf(userId), params.id!, (await request.json()) as GroupPatch),
      ),
    ),
  ),
  http.post(
    '*/v1/groups',
    authed(async ({ request, userId }) =>
      HttpResponse.json(mk.createGroup(teacherOf(userId), (await request.json()) as NewGroupBody), {
        status: 201,
      }),
    ),
  ),
  http.get(
    '*/v1/teachers/me/enrolments',
    authed(({ userId, lang }) => HttpResponse.json(mk.teacherEnrolments(teacherOf(userId), lang))),
  ),
  http.post(
    '*/v1/enrolments/:id/accept',
    authed(({ params, userId, lang }) =>
      HttpResponse.json(mk.decideEnrolment(teacherOf(userId), params.id!, true, lang)),
    ),
  ),
  http.post(
    '*/v1/enrolments/:id/decline',
    authed(({ params, userId, lang }) =>
      HttpResponse.json(mk.decideEnrolment(teacherOf(userId), params.id!, false, lang)),
    ),
  ),
  http.get(
    '*/v1/teachers/me/earnings',
    authed(async ({ userId, lang }) => {
      await delay(150);
      return HttpResponse.json(mk.earnings(teacherOf(userId), lang));
    }),
  ),
  // Demo controls (dev only): switch a centre's paid extra.
  // CF-44: Link ops verify a moved pin (the ops console is later).
  http.post('*/__demo/verify-location', async ({ request }) => {
    const { centreId } = (await request.json()) as { centreId: string };
    return HttpResponse.json(mk.verifyCentreLocation(centreId));
  }),
  http.post('*/__demo/features', async ({ request }) => {
    const { centreId, followupExtra } = (await request.json()) as {
      centreId: string;
      followupExtra: boolean;
    };
    return HttpResponse.json(mk.setFeatures(centreId, { followupExtra }));
  }),
];
