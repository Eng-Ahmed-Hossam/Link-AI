// pnpm test:rls (API level) — generated from the OpenAPI document, so every new endpoint with an
// ID in its path is covered by default: someone from another tenant asks for a resource that is
// not theirs and must get 404, never 403 or data (07 §1, 10 §2). A path that is public by rule
// (a listed hall, a published group, a public profile) is listed with that reason instead.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoId } from '../../seeds/demo';
import { type Api, Client, PHONES, startApi } from '../helpers';
import { followupRowsOfB } from './rows-b';

type Spec = {
  paths: Record<string, Record<string, { operationId: string; security?: unknown[] }>>;
};
const spec = JSON.parse(readFileSync(join(__dirname, '..', '..', 'openapi.json'), 'utf8')) as Spec;

type Actor = 'ownerA' | 'teacherA';
/**
 * For each path template, who asks and the IDs of a resource that is not theirs:
 * - centre B's resources, asked by the owner of centre A;
 * - another teacher's request or group, asked by Ms Salma.
 * A new path with an ID that is not listed here fails the suite until someone adds it.
 */
const SWEEP: Record<
  string,
  | { actor: Actor; ids: () => Record<string, string> }
  | { public: string }
  | { opsOnly: string }
> = {
  '/v1/centres/{id}': { actor: 'ownerA', ids: () => ({ id: demoId('cen-nile') }) },
  '/v1/rooms/{id}': { actor: 'ownerA', ids: () => ({ id: demoId('hall-nile-b') }) },
  '/v1/rooms/{id}/rent-estimate': { public: 'a listed hall of a verified centre is public (J01)' },
  '/v1/room-requests/{id}/withdraw': { actor: 'teacherA', ids: () => ({ id: bRequestId }) },
  '/v1/room-requests/{id}': { actor: 'ownerA', ids: () => ({ id: bRequestId }) },
  '/v1/groups/{id}': { actor: 'teacherA', ids: () => ({ id: demoId('grp-karim-nile') }) },
  '/v1/me/invites/{id}': { actor: 'ownerA', ids: () => ({ id: demoId('role:usr-reception') }) },
  // R2b: another family's enrolment at centre B, a review at centre B, a waitlist entry at B.
  '/v1/enrolments/{id}': { actor: 'ownerA', ids: () => ({ id: demoId('enr:enr-youssef-salma') }) },
  '/v1/reviews/{id}': { actor: 'ownerA', ids: () => ({ id: bReviewId }) },
  '/v1/waitlist/{id}': { actor: 'ownerA', ids: () => ({ id: bWaitlistId }) },
  '/v1/webhooks/payments/{provider}': { public: 'provider to Link, verified by its signature' },
  // R3 follow-up: centre B's records, cases, messages, notes and voice notes, asked by the owner
  // of centre A (Ms Salma teaches at both centres, so the teacher of A is not the asker here).
  '/v1/session-records/{id}': { actor: 'ownerA', ids: () => ({ id: b.record }) },
  '/v1/record-entries/{id}': { actor: 'ownerA', ids: () => ({ id: b.entry }) },
  '/v1/correction-requests/{id}': { actor: 'ownerA', ids: () => ({ id: b.request }) },
  '/v1/students/{id}': { actor: 'ownerA', ids: () => ({ id: demoId('stu-youssef') }) },
  '/v1/notes/{id}': { actor: 'ownerA', ids: () => ({ id: b.note }) },
  '/v1/voice-notes/{id}': { actor: 'ownerA', ids: () => ({ id: b.voice }) },
  '/v1/voice-notes/{id}/audio': { public: 'the signed upload URL is the credential (15 minutes)' },
  '/v1/voice-extractions/{id}': { actor: 'ownerA', ids: () => ({ id: b.extraction }) },
  '/v1/internal/voice-results/{id}': { public: 'ai-service → core-api: loopback and shared token' },
  '/v1/cases/{id}': { actor: 'ownerA', ids: () => ({ id: b.case }) },
  '/v1/messages/{id}': { actor: 'ownerA', ids: () => ({ id: b.message }) },
  '/v1/webhooks/messaging/{provider}': { public: 'provider to Link, verified by its signature' },
  '/v1/centres/by-slug/{slug}': { public: 'public centre profile (P04)' },
  '/v1/teachers/by-slug/{slug}': { public: 'public teacher profile (P05)' },
  // S2: ops work across centres by design (MKT-OPS-08); anyone without link_ops gets 403 below.
  '/v1/ops/': { opsOnly: 'Link ops see every centre; the role and permission are checked' },
};
/** Valid bodies, so the answer is about the resource, not the body's shape. */
const BODIES: Record<string, unknown> = {
  moveRoomRequest: { stage: 'phone_call' },
  declineRoomRequest: { reason: 'Not this term.' },
  patchGroup: { seatCap: 10 },
  patchHall: { listed: true },
  patchCentre: { about: 'x' },
  addHall: {
    name: 'X',
    capacity: 10,
    facilities: [],
    rentRule: { basis: 'fixed_per_session', amountPt: 1000 },
  },
  inviteStaff: { phone: '01555000001', role: 'reception' },
  putAutoApprove: { enabled: false, verifiedId: true, minRating: 4.5, fitsCapacity: true },
  checkoutEnrolment: { method: 'card' },
  acceptWaitlistOffer: { paymentPlan: 'single_month', method: 'card' },
  replyReview: { body: 'Thanks.' },
  reportReview: { reason: 'Not ours.' },
  requestRefund: { reason: 'x' },
  openSessionRecord: { groupSessionId: '0190f0f0-0000-7000-8000-000000000001' },
  saveSessionRecordDraft: { entries: [] },
  addCorrection: { field: 'attendance', newValue: 'present', reason: 'x' },
  requestCorrection: { text: 'x' },
  addStudentNote: { groupId: '0190f0f0-0000-7000-8000-000000000001', tag: 'behaviour', body: 'x' },
  addCaseAttempt: { channel: 'phone', result: 'reached' },
  dismissCase: { reason: 'x' },
  editMessage: { text: 'x' },
  approveMessage: { checked: true },
  resolveVoiceIdentity: { itemId: 'i1', studentId: '0190f0f0-0000-7000-8000-000000000001' },
  discardVoiceItem: { itemId: 'i1' },
};
/**
 * GET /v1/groups/{id} is the public group card (P06); its PATCH is the teacher's. Any parent may
 * join the waitlist of a published group, so that POST is public by rule too.
 */
const PUBLIC_OPERATIONS = new Set(['getGroup', 'joinWaitlist']);

const templateOf = (path: string) =>
  Object.keys(SWEEP)
    .filter((t) => path.startsWith(t))
    .sort((a, b) => b.length - a.length)[0];

const withIds = Object.entries(spec.paths).flatMap(([path, ops]) =>
  Object.entries(ops)
    .filter(() => path.includes('{'))
    .map(([method, op]) => ({ path, method: method.toUpperCase(), op: op.operationId })),
);

let api: Api;
let bRequestId = '';
let bReviewId = '';
let bWaitlistId = '';
/** Follow-up rows of centre B (Nile Academy), written as the table owner for the sweep. */
let b: Awaited<ReturnType<typeof followupRowsOfB>>;
const clients = {} as Record<Actor, Client>;
beforeAll(async () => {
  api = await startApi();
  clients.ownerA = new Client(api);
  await clients.ownerA.signIn(PHONES.owner);
  clients.teacherA = new Client(api);
  await clients.teacherA.signIn(PHONES.teacher);
  // A room request at centre B (Mr Karim at Nile Academy), so the sweep has one to ask for.
  const karim = new Client(api);
  await karim.signIn('+201000000101');
  const r = await karim.call<{ id: string }>('POST', '/v1/room-requests', {
    hallId: demoId('hall-nile-b'),
    slots: [{ weekday: 1, start: '14:00', end: '16:00' }],
    groupId: null,
    subjectId: demoId('sub-math'),
    schoolYearId: demoId('sy-sec2'),
    expectedStudents: 10,
    startsOn: '2027-01-02',
  });
  expect(r.status).toBe(201);
  bRequestId = r.body.id;
  // A review and a waitlist entry of a family at centre B (sample rows, written as the owner).
  const enr = demoId('enr:enr-youssef-salma');
  const e = await api.db
    .selectFrom('market.enrolments')
    .select(['guardian_id', 'student_id', 'group_id', 'centre_id'])
    .where('id', '=', enr)
    .executeTakeFirstOrThrow();
  bReviewId = demoId('rls-review-b');
  await api.db
    .insertInto('market.reviews')
    .values({
      id: bReviewId,
      enrolment_id: enr,
      guardian_id: e.guardian_id,
      target_type: 'centre',
      target_id: e.centre_id,
      centre_id: e.centre_id,
      school_year_id: demoId('sy-sec2'),
      stars: 4,
      body: 'Sample review at centre B.',
      visibility: 'public',
      status: 'published',
    })
    .execute();
  bWaitlistId = demoId('rls-waitlist-b');
  await api.db
    .insertInto('market.waitlist_entries')
    .values({
      id: bWaitlistId,
      group_id: e.group_id,
      centre_id: e.centre_id,
      student_id: e.student_id,
      guardian_id: e.guardian_id,
    })
    .execute();
  b = await followupRowsOfB(api);
});
afterAll(() => api.close());

describe('10 §2 cross-tenant API sweep (generated from openapi.json)', () => {
  it('covers every operation with an ID in its path', () => {
    const uncovered = withIds
      .filter((x) => !templateOf(x.path))
      .map((x) => `${x.method} ${x.path}`);
    expect(uncovered).toEqual([]);
    expect(withIds.length).toBeGreaterThan(10);
  });

  for (const x of withIds) {
    const rule = SWEEP[templateOf(x.path) ?? ''];
    if (!rule || 'public' in rule || 'opsOnly' in rule || PUBLIC_OPERATIONS.has(x.op)) continue;
    it(`${x.method} ${x.path} (${x.op}): another tenant gets 404`, async () => {
      const ids = rule.ids();
      const url = x.path.replace(/\{(\w+)\}/g, (_, k: string) => ids[k] ?? 'missing');
      // A body that would be valid must not matter: the tenancy check comes first.
      const body = x.method === 'GET' ? undefined : (BODIES[x.op] ?? {});
      const r = await clients[rule.actor].call(x.method, url, body);
      expect({ status: r.status, code: (r.body as { code?: string })?.code }).toEqual({
        status: 404,
        code: 'not_found',
      });
    });
  }

  // MKT-OPS-08: every ops operation with an ID refuses a centre owner (403, before the body).
  for (const x of withIds.filter((y) => y.path.startsWith('/v1/ops/')))
    it(`${x.method} ${x.path} (${x.op}): not ops → 403 ops_permission_required`, async () => {
      const url = x.path.replace(/\{(\w+)\}/g, () => demoId('cen-nile'));
      const r = await clients.ownerA.call(x.method, url, x.method === 'GET' ? undefined : {});
      expect({ status: r.status, code: (r.body as { code?: string })?.code }).toEqual({
        status: 403,
        code: 'ops_permission_required',
      });
    });

  it('and the owner of A still reaches A (the sweep is not refusing everything)', async () => {
    const r = await clients.ownerA.call('GET', `/v1/centres/${demoId('cen-nour')}/staff`);
    expect(r.status).toBe(200);
    expect(
      (await clients.ownerA.call('GET', `/v1/centres/${demoId('cen-nour')}/schedule`)).status,
    ).toBe(200);
  });
});
