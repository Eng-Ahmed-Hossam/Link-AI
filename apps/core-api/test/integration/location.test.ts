// Part B: the centre's exact location (MKT-CEN-02, CF-44, OD-46). An owner's moved pin waits as
// the pending location; the public keeps the approved one until Link ops approve the new one in
// the ops console (old and new side by side). Address search through the Geocoder adapter.
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_AGENT_PHONE, demoId } from '../../seeds/demo';
import { GEO_LIMITS } from '../../src/market/geo';
import { type Api, Client, PHONES, startApi } from '../helpers';

const NOUR = demoId('cen-nour');
const MOVE = {
  lat: 29.9612,
  lng: 31.2581,
  address: '14 Road 9, Maadi',
  governorate: 'Cairo',
  area: 'Maadi',
  street: 'Road 9',
  landmark: 'Next to the sample pharmacy',
};

let api: Api;
let owner: Client;
let agent: Client;
let anon: Client;
beforeAll(async () => {
  api = await startApi();
  owner = new Client(api);
  await owner.signIn(PHONES.owner);
  agent = new Client(api, { web: true });
  await agent.signIn(OPS_AGENT_PHONE);
  anon = new Client(api);
}, 120_000);
afterAll(() => api.close());

type Loc = { lat: number; lng: number; address: string; street: string; landmark: string };
type Profile = {
  location: Loc & { underReview: boolean; pending: (Loc & { submittedAt: string }) | null };
};
type Public = Loc & { locationUnderReview: boolean };
type OpsCentre = {
  id: string;
  locationUnderReview: boolean;
  location: Loc | null;
  pendingLocation: (Loc & { submittedAt: string }) | null;
  canApprove: boolean;
};
const publicNour = async () =>
  (await anon.call<Public>('GET', '/v1/centres/by-slug/al-nour-maadi')).body;
const opsNour = async () =>
  (
    await agent.call<{ centres: OpsCentre[] }>('GET', '/v1/ops/centre-applications')
  ).body.centres.find((c) => c.id === NOUR)!;

describe('MKT-CEN-02 / CF-44: a moved pin waits for Link ops', () => {
  let before: Public;

  it('PATCH writes the pending location; the public keeps the approved pin and address', async () => {
    before = await publicNour();
    const r = await owner.call<Profile>('PATCH', `/v1/centres/${NOUR}`, { location: MOVE });
    expect(r.status).toBe(200);
    expect(r.body.location.underReview).toBe(true);
    expect(r.body.location.pending).toMatchObject({ ...MOVE, submittedAt: expect.any(String) });
    // The owner's live location is still the approved one.
    expect(r.body.location).toMatchObject({
      lat: before.lat,
      lng: before.lng,
      address: before.address,
    });
    const pub = await publicNour();
    expect(pub.locationUnderReview).toBe(true);
    expect(pub).toMatchObject({ lat: before.lat, lng: before.lng, address: before.address });
  });

  it('refuses a pin outside Egypt and a location without governorate or area', async () => {
    const out = await owner.call('PATCH', `/v1/centres/${NOUR}`, {
      location: { ...MOVE, lat: 48.85, lng: 2.35 },
    });
    expect(out.status).toBe(422);
    const noArea = await owner.call('PATCH', `/v1/centres/${NOUR}`, {
      location: { ...MOVE, area: '  ' },
    });
    expect(noArea.status).toBe(422);
  });

  it('the database itself refuses an owner (app_user) writing the live location', async () => {
    await expect(
      api.db.transaction().execute(async (tx) => {
        await sql`SET LOCAL ROLE app_user`.execute(tx);
        await sql`UPDATE org.centres SET address = 'Sample' WHERE id = ${NOUR}`.execute(tx);
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it('a parent never sees the pending pin: not in search pins either', async () => {
    const s = await anon.call<{ data: { id: string; lat: number; lng: number }[] }>(
      'GET',
      '/v1/search/centres?radiusKm=50',
    );
    const pin = s.body.data.find((c) => c.id === NOUR);
    if (pin) expect(pin).toMatchObject({ lat: before.lat, lng: before.lng });
  });

  it('ops see the old and the new pin side by side, then approve: the public map updates', async () => {
    let c = await opsNour();
    expect(c.locationUnderReview).toBe(true);
    expect(c.location).toMatchObject({ lat: before.lat, lng: before.lng });
    expect(c.pendingLocation).toMatchObject({
      lat: MOVE.lat,
      lng: MOVE.lng,
      landmark: MOVE.landmark,
    });
    expect(c.canApprove).toBe(false);
    const check = await agent.call(
      'PUT',
      `/v1/ops/verifications/centre/${NOUR}/checks/address_pin_match`,
      { status: 'done', notes: 'Sample: matched on the map' },
    );
    expect(check.status).toBe(200);
    expect((await opsNour()).canApprove).toBe(true);
    expect((await agent.call('POST', `/v1/ops/centres/${NOUR}/approve`, {})).status).toBe(200);

    c = await opsNour();
    expect(c.locationUnderReview).toBe(false);
    expect(c.pendingLocation).toBeNull();
    const pub = await publicNour();
    expect(pub).toMatchObject({
      lat: MOVE.lat,
      lng: MOVE.lng,
      address: MOVE.address,
      street: MOVE.street,
      landmark: MOVE.landmark,
      locationUnderReview: false,
    });
    const audit = await sql<{ action: string }>`
      SELECT action FROM audit.audit_events WHERE object_ref = ${NOUR} ORDER BY occurred_at`.execute(
      api.db,
    );
    expect(audit.rows.map((a) => a.action)).toEqual(
      expect.arrayContaining(['centre.location_moved', 'centre.verified']),
    );
  });
});

describe('CF-44: every new move needs its own pin check', () => {
  it('a check done for an earlier move does not approve the next one', async () => {
    const again = await owner.call('PATCH', `/v1/centres/${NOUR}`, {
      location: { ...MOVE, lat: MOVE.lat + 0.001, address: '16 Road 9, Maadi' },
    });
    expect(again.status).toBe(200);
    const c = await opsNour();
    expect(c.canApprove).toBe(false);
    expect(
      (c as unknown as { checks: { code: string; status: string }[] }).checks.find(
        (x) => x.code === 'address_pin_match',
      )?.status,
    ).toBe('pending');
    const early = await agent.call<{ code: string }>('POST', `/v1/ops/centres/${NOUR}/approve`, {});
    expect(early.status).toBe(409);
    await agent.call('PUT', `/v1/ops/verifications/centre/${NOUR}/checks/address_pin_match`, {
      status: 'done',
    });
    expect((await opsNour()).canApprove).toBe(true);
  });
});

describe('OD-46: address search through the Geocoder adapter (dev = sample places)', () => {
  it('signed-in only; Arabic and English; reverse lookup of a pin', async () => {
    expect((await anon.call('GET', '/v1/geo/search?q=maadi')).status).toBe(401);
    const en = await owner.call<{ items: { area: string; lat: number }[] }>(
      'GET',
      '/v1/geo/search?q=road%209%20maadi',
    );
    expect(en.status).toBe(200);
    expect(en.body.items[0]).toMatchObject({ area: 'Maadi', lat: 29.9602 });
    const ar = await owner.call<{ items: unknown[] }>(
      'GET',
      `/v1/geo/search?q=${encodeURIComponent('المعادي')}`,
    );
    expect(ar.body.items.length).toBeGreaterThan(0);
    const rev = await owner.call<{ place: { lat: number } | null }>(
      'GET',
      '/v1/geo/reverse?lat=29.9605&lng=31.257',
    );
    expect(rev.body.place).toMatchObject({ lat: 29.9605 });
    expect((await owner.call('GET', '/v1/geo/reverse?lat=48.8&lng=2.3')).status).toBe(422);
  });

  it('rate-limited per user', async () => {
    const was = GEO_LIMITS.perUserHour;
    GEO_LIMITS.perUserHour = 2;
    try {
      const u = new Client(api);
      await u.signIn(PHONES.teacher);
      expect((await u.call('GET', '/v1/geo/search?q=maadi')).status).toBe(200);
      expect((await u.call('GET', '/v1/geo/search?q=maadi')).status).toBe(200);
      const third = await u.call<{ code: string }>('GET', '/v1/geo/search?q=maadi');
      expect(third.status).toBe(429);
      expect(third.body.code).toBe('rate_limited');
    } finally {
      GEO_LIMITS.perUserHour = was;
    }
  });
});
