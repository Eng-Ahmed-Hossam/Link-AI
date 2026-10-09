// R2a marketplace against real Postgres: halls, requests, bookings, groups, search, invites and
// the R1-review rules. Test names carry requirement IDs.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { keyMismatches } from '../../src/platform/data-keys';
import { addDays, cairoToday } from '../../src/platform/time';
import { Database } from '../../src/platform/db';
import { demoId } from '../../seeds/demo';
import { type Api, Client, PHONES, startApi } from '../helpers';

let api: Api;
const NOUR = demoId('cen-nour');
const ROOM1 = demoId('hall-nour-1');
const MATH = demoId('sub-math');
const SEC2 = demoId('sy-sec2');
let owner: Client;
let teacher: Client;
let reception: Client;

beforeAll(async () => {
  api = await startApi();
  owner = new Client(api);
  await owner.signIn(PHONES.owner);
  teacher = new Client(api);
  await teacher.signIn(PHONES.teacher);
  reception = new Client(api);
  await reception.signIn(PHONES.reception);
});
afterAll(() => api.close());

type Problemish = { code?: string };
const code = (r: { body: unknown }) => (r.body as Problemish).code;
const request = (
  c: Client,
  slot: { weekday: number; start: string },
  extra: Record<string, unknown> = {},
) =>
  c.call<{ id: string; stage: string; meetsRules: boolean }>('POST', '/v1/room-requests', {
    hallId: ROOM1,
    slots: [{ ...slot, end: `${String(Number(slot.start.slice(0, 2)) + 2).padStart(2, '0')}:00` }],
    groupId: null,
    subjectId: MATH,
    schoolYearId: SEC2,
    expectedStudents: 20,
    // Inside the 9-week window sessions are generated for (as in the mock).
    startsOn: addDays(cairoToday(), 10),
    ...extra,
  });

describe('C05 halls (MKT-CEN-03, CF-44)', () => {
  it('the owner adds a hall with the whole grid open; Reception may not', async () => {
    const r = await owner.call<{
      id: string;
      slots: { state: string }[];
      freeSlotsPerWeek: number;
    }>('POST', `/v1/centres/${NOUR}/rooms`, {
      name: 'Room 9',
      capacity: 18,
      facilities: ['ac'],
      rentRule: { basis: 'fixed_per_session', amountPt: 20000 },
    });
    expect(r.status).toBe(201);
    expect(r.body.freeSlotsPerWeek).toBe(24);
    const denied = await reception.call('POST', `/v1/centres/${NOUR}/rooms`, {
      name: 'X',
      capacity: 10,
      facilities: [],
      rentRule: { basis: 'fixed_per_session', amountPt: 1000 },
    });
    expect(denied.status).toBe(403);
  });

  it('a closed slot is not offered; a rent rule below EGP 1 is refused, never adjusted', async () => {
    const r = await owner.call<{ slots: { weekday: number; start: string; state: string }[] }>(
      'PATCH',
      `/v1/rooms/${demoId('hall-nour-3')}`,
      { closedSlots: [{ weekday: 6, start: '14:00', end: '16:00' }], listed: true },
    );
    expect(r.body.slots.find((s) => s.weekday === 6 && s.start === '14:00')?.state).toBe('closed');
    const bad = await owner.call('PATCH', `/v1/rooms/${demoId('hall-nour-3')}`, {
      rentRule: { basis: 'fixed_per_session', amountPt: 50 },
    });
    expect(code(bad)).toBe('invalid_amount');
  });

  it('seats cannot go below a group in the hall (409 capacity_below_group)', async () => {
    // Room 2 has Ms Salma's 20-seat group.
    const r = await owner.call('PATCH', `/v1/rooms/${demoId('hall-nour-2')}`, { capacity: 10 });
    expect(code(r)).toBe('capacity_below_group');
  });
});

describe('J01 → J02 → C06 → C03: request, approval books the slot (MKT-HAL-01…04, CF-46)', () => {
  let requestId = '';
  it('J01 lists listed halls of verified centres, fitting first', async () => {
    const r = await teacher.call<{ hall: { id: string }; centre: { id: string }; fits: boolean }[]>(
      'GET',
      '/v1/rooms/search?minCapacity=25&weekday=6',
    );
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body.some((x) => x.hall.id === demoId('hall-nour-3'))).toBe(true); // listed now (above)
    const firstUnfit = r.body.findIndex((x) => !x.fits);
    expect(r.body.slice(firstUnfit).every((x) => !x.fits)).toBe(true);
  });

  it('J02 estimate: rent, Link commission (rate from commission_rules) and what the teacher keeps', async () => {
    const r = await teacher.call<{
      rent: { amountPt: number };
      commission: { amountPt: number };
      commissionPercent: number;
      keep: { amountPt: number };
      fees: { amountPt: number };
    }>('POST', `/v1/rooms/${ROOM1}/rent-estimate`, {
      hallId: ROOM1,
      slots: [{ weekday: 6, start: '16:00', end: '18:00' }],
      students: 20,
      monthlyFeePt: 55000,
    });
    expect(r.body.fees.amountPt).toBe(1_100_000);
    expect(r.body.rent.amountPt).toBe(25000 * 4);
    expect(r.body.commissionPercent).toBe(5);
    expect(r.body.commission.amountPt).toBe(55000);
    expect(r.body.keep.amountPt).toBe(1_100_000 - 100_000 - 55_000);
  });

  it('J02 request → C06 forward only → approval books the slot; C03 shows it booked', async () => {
    const r = await request(teacher, { weekday: 6, start: '16:00' });
    expect(r.status).toBe(201);
    expect(r.body.stage).toBe('requested');
    requestId = r.body.id;
    expect(
      code(await owner.call('POST', `/v1/room-requests/${requestId}/stage`, { stage: 'meeting' })),
    ).toBeUndefined();
    expect(
      code(
        await owner.call('POST', `/v1/room-requests/${requestId}/stage`, { stage: 'phone_call' }),
      ),
    ).toBe('stage_backwards');
    const a = await owner.call<{ stage: string }>(
      'POST',
      `/v1/room-requests/${requestId}/approve`,
      {},
    );
    expect(a.body.stage).toBe('approved');
    const sched = await owner.call<{
      cells: { hallId: string; weekday: number; kind: string; teacher: string }[];
    }>('GET', `/v1/centres/${NOUR}/schedule`);
    expect(
      sched.body.cells.find((c) => c.hallId === ROOM1 && c.weekday === 6 && c.kind === 'booked')
        ?.teacher,
    ).toContain('سلمى');
  });

  it('the same slot cannot be requested again; two approvals for one slot: the second is 409', async () => {
    expect(code(await request(teacher, { weekday: 6, start: '16:00' }))).toBe('slot_taken');
    // Two pending requests for one free slot (Monday 18:00); approving both books only one.
    const karim = new Client(api);
    await karim.signIn('+201000000101');
    const x = await request(teacher, { weekday: 1, start: '18:00' });
    const y = await request(karim, { weekday: 1, start: '18:00' });
    expect((await owner.call('POST', `/v1/room-requests/${x.body.id}/approve`, {})).status).toBe(
      200,
    );
    expect(code(await owner.call('POST', `/v1/room-requests/${y.body.id}/approve`, {}))).toBe(
      'slot_taken',
    );
  });

  it('a decline needs a reason; Reception without bookings.manage cannot decide', async () => {
    const r = await request(teacher, { weekday: 2, start: '20:00' });
    expect(
      code(await owner.call('POST', `/v1/room-requests/${r.body.id}/decline`, { reason: ' ' })),
    ).toBe('reason_required');
    // Remove Reception's bookings permission, then try.
    await sql`UPDATE identity.role_assignments SET permissions = '{reviews.reply}' WHERE id = ${demoId('role:usr-reception')}`.execute(
      api.db,
    );
    expect((await reception.call('GET', `/v1/room-requests?centreId=${NOUR}`)).status).toBe(403);
    await sql`UPDATE identity.role_assignments SET permissions = '{bookings.manage,reviews.reply}' WHERE id = ${demoId('role:usr-reception')}`.execute(
      api.db,
    );
    expect((await reception.call('GET', `/v1/room-requests?centreId=${NOUR}`)).status).toBe(200);
  });

  it('MKT-HAL-05: with auto-approve on, a request meeting every rule is booked at once', async () => {
    await owner.call('PUT', `/v1/centres/${NOUR}/settings/auto-approve`, {
      enabled: true,
      verifiedId: true,
      minRating: 4.5,
      fitsCapacity: true,
    });
    const r = await request(teacher, { weekday: 3, start: '20:00' });
    expect(r.body.stage).toBe('approved');
    await owner.call('PUT', `/v1/centres/${NOUR}/settings/auto-approve`, {
      enabled: false,
      verifiedId: true,
      minRating: 4.5,
      fitsCapacity: true,
    });
  });

  it('the DB refuses a double booking even if the API were bypassed (exclusion constraint)', async () => {
    const b = await api.db
      .selectFrom('market.room_booking_slots')
      .selectAll()
      .where('room_id', '=', ROOM1)
      .where('weekday', '=', 6)
      .executeTakeFirstOrThrow();
    const other = '00000000-0000-4000-8000-00000000b001';
    await sql`INSERT INTO market.room_bookings (id, room_id, centre_id, teacher_id, weekly_slots, rent_rule, starts_on)
              VALUES (${other}, ${ROOM1}, ${NOUR}, ${demoId('tch-karim')}, '[]', '{}', '2027-03-01')`.execute(
      api.db,
    );
    await expect(
      sql`INSERT INTO market.room_booking_slots (booking_id, room_id, centre_id, weekday, minutes, active_dates)
          VALUES (${other}, ${ROOM1}, ${NOUR}, 6, int4range(990, 1050), daterange('2027-03-01', NULL))`.execute(
        api.db,
      ),
    ).rejects.toThrow(/exclu|conflicting key/);
    void b;
  });
});

describe('J05 groups (MKT-GRP-01/02, CF-05)', () => {
  let bookingId = '';
  let groupId = '';
  it('seats above the hall are refused (422); at the hall size the group opens with its sessions', async () => {
    const bookings = await teacher.call<
      { id: string; groupId: string | null; hall: { id: string; capacity: number } }[]
    >('GET', '/v1/room-bookings?scope=mine');
    const b = bookings.body.find((x) => x.hall.id === ROOM1 && !x.groupId)!;
    bookingId = b.id;
    const body = {
      bookingId,
      subjectId: MATH,
      schoolYearId: SEC2,
      monthlyFeePt: 55000,
      sessionFeePt: 15000,
      offersMonthlyRecurring: true,
    };
    expect(code(await teacher.call('POST', '/v1/groups', { ...body, seatCap: 30 }))).toBe(
      'seat_cap_above_hall',
    );
    const ok = await teacher.call<{ id: string }>('POST', '/v1/groups', { ...body, seatCap: 24 });
    expect(ok.status).toBe(201);
    groupId = ok.body.id;
    const sessions = await api.db
      .selectFrom('market.group_sessions')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('group_id', '=', groupId)
      .executeTakeFirstOrThrow();
    expect(sessions.n).toBeGreaterThan(0);
    expect(code(await teacher.call('POST', '/v1/groups', { ...body, seatCap: 10 }))).toBe(
      'booking_has_group',
    );
  });

  it('the group is public at once: P06 card with 24 seats per session', async () => {
    const g = await new Client(api).call<{
      seatCap: number;
      upcomingSessions: { seatsLeft: number }[];
    }>('GET', `/v1/groups/${groupId}`);
    expect(g.body.seatCap).toBe(24);
    expect(g.body.upcomingSessions[0]?.seatsLeft).toBe(24);
  });

  it('PATCH: above the hall is refused; the DB trigger refuses it too', async () => {
    expect(code(await teacher.call('PATCH', `/v1/groups/${groupId}`, { seatCap: 25 }))).toBe(
      'seat_cap_above_hall',
    );
    await expect(
      sql`UPDATE market.groups SET seat_cap = 99 WHERE id = ${groupId}`.execute(api.db),
    ).rejects.toThrow(/above the hall capacity/);
  });
});

describe('P02–P05 search (MKT-DSC-01…05): verified centres and active teachers only', () => {
  it('P02: Maths for Secondary 2 within 5 km, nearest first, with totals', async () => {
    const r = await new Client(api).call<{
      data: { name: string; distanceKm: number }[];
      totals: { centres: number };
    }>('GET', `/v1/search/centres?subjectId=${MATH}&schoolYearId=${SEC2}`);
    expect(r.body.data[0]?.name).toBe('مركز النور');
    expect(r.body.data.every((c) => c.distanceKm <= 5)).toBe(true);
    expect(r.body.totals.centres).toBe(r.body.data.length);
  });

  it('P04 and P05 read the public views', async () => {
    const anon = new Client(api);
    const c = await anon.call<{ groupsForChild: unknown[]; teachers: unknown[] }>(
      'GET',
      `/v1/centres/by-slug/al-nour-maadi?schoolYearId=${SEC2}&subjectId=${MATH}`,
    );
    expect(c.body.groupsForChild.length).toBeGreaterThan(0);
    const t = await anon.call<{ groups: unknown[] }>(
      'GET',
      '/v1/teachers/by-slug/salma-fathy-maths',
    );
    expect(t.body.groups.length).toBeGreaterThan(0);
  });

  it('CF-44: a moved pin shows "under review" on P04 until ops verify it', async () => {
    await owner.call('PATCH', `/v1/centres/${NOUR}`, {
      location: { lat: 29.961, lng: 31.257, address: '14 Road 9, Maadi' },
    });
    const anon = new Client(api);
    const before = await anon.call<{ locationUnderReview: boolean }>(
      'GET',
      '/v1/centres/by-slug/al-nour-maadi',
    );
    expect(before.body.locationUnderReview).toBe(true);
    await fetch(`${api.base}/__demo/verify-centre`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ centreId: NOUR }),
    });
    const after = await anon.call<{ locationUnderReview: boolean }>(
      'GET',
      '/v1/centres/by-slug/al-nour-maadi',
    );
    expect(after.body.locationUnderReview).toBe(false);
  });
});

describe('R1 review: pending centres (C01) stay out until ops verify them', () => {
  it('not in search, no room requests; after verification (audited) they are', async () => {
    const anon = new Client(api);
    await anon.call('POST', '/v1/centre-applications', {
      centreName: 'Pending Centre',
      governorate: 'Giza',
      area: 'Dokki',
      address: '1 Pending St',
      subjects: [],
      hallRange: '1-3',
      ownerName: 'P. Owner',
      phone: '01555000710',
      consent: true,
    });
    const newOwner = new Client(api);
    const s = await newOwner.signIn('+201555000710');
    const centreId = s.user.centreIds[0]!;
    const hall = await newOwner.call<{ id: string }>('POST', `/v1/centres/${centreId}/rooms`, {
      name: 'Hall 1',
      capacity: 20,
      facilities: [],
      rentRule: { basis: 'fixed_per_session', amountPt: 20000 },
    });
    expect(hall.status).toBe(201);
    const rooms = await teacher.call<{ hall: { id: string } }[]>('GET', '/v1/rooms/search');
    expect(rooms.body.some((x) => x.hall.id === hall.body.id)).toBe(false);
    const r = await teacher.call('POST', '/v1/room-requests', {
      hallId: hall.body.id,
      slots: [{ weekday: 6, start: '14:00', end: '16:00' }],
      groupId: null,
      subjectId: MATH,
      schoolYearId: SEC2,
      expectedStudents: 10,
      startsOn: '2027-01-02',
    });
    expect(code(r)).toBe('centre_not_verified');
    await fetch(`${api.base}/__demo/verify-centre`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ centreId }),
    });
    const audit = await api.db
      .selectFrom('audit.audit_events')
      .select(['action', 'reason'])
      .where('object_ref', '=', centreId)
      .where('action', '=', 'centre.verified')
      .executeTakeFirst();
    expect(audit?.reason).toMatch(/stands in for the ops console/);
    const after = await teacher.call<{ hall: { id: string } }[]>('GET', '/v1/rooms/search');
    expect(after.body.some((x) => x.hall.id === hall.body.id)).toBe(true);
  });

  it('C01 is rate-limited per phone (3 a day)', async () => {
    await api.resetOtpLimits();
    const anon = new Client(api);
    const body = {
      centreName: 'Many',
      governorate: 'Giza',
      area: 'Dokki',
      address: '1',
      subjects: [],
      hallRange: '1-3',
      ownerName: 'M',
      phone: '01555000720',
      consent: true,
    };
    const statuses = [];
    for (let i = 0; i < 4; i++)
      statuses.push((await anon.call('POST', '/v1/centre-applications', body)).status);
    expect(statuses).toEqual([201, 201, 201, 429]);
  });
});

describe('R1 review: an invited teacher is hidden until they accept and complete the profile', () => {
  it('invited → (sign in, accept) incomplete → (name + subject) active and public', async () => {
    const invite = await owner.call('POST', `/v1/centres/${NOUR}/staff`, {
      phone: '01555000730',
      role: 'teacher',
    });
    expect(invite.status).toBe(201);
    const t = await api.db
      .selectFrom('org.teachers as t')
      .innerJoin('identity.role_assignments as ra', 'ra.teacher_id', 't.id')
      .select(['t.id', 't.slug', 't.profile_status', 'ra.id as invite_id'])
      .where('ra.centre_id', '=', NOUR)
      .where('ra.role', '=', 'teacher')
      .orderBy('ra.created_at', 'desc')
      .executeTakeFirstOrThrow();
    expect(t.profile_status).toBe('invited');
    const anon = new Client(api);
    expect((await anon.call('GET', `/v1/teachers/by-slug/${t.slug}`)).status).toBe(404);

    const invited = new Client(api);
    const s = await invited.signIn('+201555000730');
    expect(s.user.roles).toEqual([]); // the invite waits for an accept
    const list = await invited.call<{ id: string; role: string }[]>('GET', '/v1/me/invites');
    expect(list.body).toEqual([expect.objectContaining({ id: t.invite_id, role: 'teacher' })]);
    await invited.call('POST', `/v1/me/invites/${t.invite_id}/accept`, {});
    const self = await invited.call<{ profileStatus: string }>('GET', '/v1/teachers/me');
    expect(self.body.profileStatus).toBe('incomplete');
    expect((await anon.call('GET', `/v1/teachers/by-slug/${t.slug}`)).status).toBe(404);

    const done = await invited.call<{ profileStatus: string }>('PATCH', '/v1/teachers/me', {
      displayName: 'أ. منى سامي',
      subjectIds: [MATH],
    });
    expect(done.body.profileStatus).toBe('active');
    expect((await anon.call('GET', `/v1/teachers/by-slug/${t.slug}`)).status).toBe(200);
  });
});

describe('R1 review: feature flags and keys', () => {
  it('GET /v1/feature-flags needs sign-in and shows only the caller’s scopes', async () => {
    expect((await new Client(api).call('GET', '/v1/feature-flags')).status).toBe(401);
    const a = await owner.call<{ flags: Record<string, boolean> }>('GET', '/v1/feature-flags');
    expect(a.body.flags['followup.extra']).toBe(true); // Al Nour's own row
    const b = new Client(api);
    await b.signIn(PHONES.ownerB);
    const flags = await b.call<{ flags: Record<string, boolean> }>('GET', '/v1/feature-flags');
    expect(flags.body.flags['followup.extra']).toBeUndefined(); // not Al Nour's row
  });

  it('docs/10 §5: data written with other keys is reported at start-up', async () => {
    const db = new Database(process.env.DATABASE_URL!, process.env.DATABASE_URL_WORKER!);
    try {
      expect(
        await keyMismatches(db, { field: 'aaaaaaaaaaaa', lookup: 'bbbbbbbbbbbb' }),
      ).toHaveLength(2);
    } finally {
      await db.close();
    }
  });
});
