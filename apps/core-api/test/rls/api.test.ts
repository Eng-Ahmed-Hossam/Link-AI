// pnpm test:rls (API level) — generated from the OpenAPI document, so every new endpoint with an
// ID in its path is covered by default: someone from another tenant asks for a resource that is
// not theirs and must get 404, never 403 or data (07 §1, 10 §2). A path that is public by rule
// (a listed hall, a published group, a public profile) is listed with that reason instead.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoId } from '../../seeds/demo';
import { type Api, Client, PHONES, startApi } from '../helpers';

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
  { actor: Actor; ids: () => Record<string, string> } | { public: string }
> = {
  '/v1/centres/{id}': { actor: 'ownerA', ids: () => ({ id: demoId('cen-nile') }) },
  '/v1/rooms/{id}': { actor: 'ownerA', ids: () => ({ id: demoId('hall-nile-b') }) },
  '/v1/rooms/{id}/rent-estimate': { public: 'a listed hall of a verified centre is public (J01)' },
  '/v1/room-requests/{id}/withdraw': { actor: 'teacherA', ids: () => ({ id: bRequestId }) },
  '/v1/room-requests/{id}': { actor: 'ownerA', ids: () => ({ id: bRequestId }) },
  '/v1/groups/{id}': { actor: 'teacherA', ids: () => ({ id: demoId('grp-karim-nile') }) },
  '/v1/me/invites/{id}': { actor: 'ownerA', ids: () => ({ id: demoId('role:usr-reception') }) },
  '/v1/centres/by-slug/{slug}': { public: 'public centre profile (P04)' },
  '/v1/teachers/by-slug/{slug}': { public: 'public teacher profile (P05)' },
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
};
/** GET /v1/groups/{id} is the public group card (P06); its PATCH is the teacher's. */
const PUBLIC_OPERATIONS = new Set(['getGroup']);

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
    if (!rule || 'public' in rule || PUBLIC_OPERATIONS.has(x.op)) continue;
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

  it('and the owner of A still reaches A (the sweep is not refusing everything)', async () => {
    const r = await clients.ownerA.call('GET', `/v1/centres/${demoId('cen-nour')}/staff`);
    expect(r.status).toBe(200);
    expect(
      (await clients.ownerA.call('GET', `/v1/centres/${demoId('cen-nour')}/schedule`)).status,
    ).toBe(200);
  });
});
