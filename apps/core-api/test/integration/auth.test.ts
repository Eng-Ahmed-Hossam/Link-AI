// Accounts and sign-in against real Postgres and Redis. Test names carry requirement IDs.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { type Api, Client, PHONES, startApi } from '../helpers';

let api: Api;
beforeAll(async () => {
  api = await startApi();
});
afterAll(() => api.close());

const problem = (r: { status: number; body: unknown }) =>
  r.body as { code: string; status: number; requestId?: string; remainingAttempts?: number };

describe('MKT-ACC-01 phone OTP', () => {
  it('sends a 6-digit code by SMS (5 minutes, resend after 60 s); the code is not stored in clear', async () => {
    await api.resetOtpLimits();
    const c = new Client(api);
    const r = await c.call('POST', '/v1/auth/otp/request', { phone: '01000000003' });
    expect(r.body).toEqual({ resendAfterSeconds: 60, expiresInSeconds: 300 });
    const code = api.sms.lastCode(PHONES.owner);
    expect(code).toMatch(/^\d{6}$/);
    const keys = await api.redis.keys('local:otp:*');
    const values = await Promise.all(
      keys.filter((k) => !k.includes(':cool:')).map((k) => api.redis.hgetall(k)),
    );
    expect(JSON.stringify(values)).not.toContain(code);
    expect(keys.join()).not.toContain('1000000003');
  });

  it('AC2: a second request inside 60 s is refused with Retry-After', async () => {
    const c = new Client(api);
    const r = await c.call('POST', '/v1/auth/otp/request', { phone: PHONES.owner });
    expect(r.status).toBe(429);
    expect(problem(r).code).toBe('resend_too_soon');
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('07 §1: at most 3 codes per phone in 10 minutes', async () => {
    await api.resetOtpLimits();
    const c = new Client(api);
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      await api.redis.del(...(await api.redis.keys('local:otp:cool:*')), 'x');
      statuses.push(
        (await c.call('POST', '/v1/auth/otp/request', { phone: '+201000000005' })).status,
      );
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it('AC4 + AC2: a wrong code says how many tries are left; after 5 the code is locked', async () => {
    await api.resetOtpLimits();
    const c = new Client(api);
    await c.call('POST', '/v1/auth/otp/request', { phone: '+201000000006' });
    const right = api.sms.lastCode('+201000000006');
    const wrong = right === '000000' ? '111111' : '000000';
    for (let remaining = 4; remaining >= 0; remaining--) {
      const r = await c.call('POST', '/v1/auth/otp/verify', {
        phone: '+201000000006',
        code: wrong,
      });
      expect(r.status).toBe(422);
      expect(problem(r)).toMatchObject({ code: 'otp_invalid', remainingAttempts: remaining });
    }
    const locked = await c.call('POST', '/v1/auth/otp/verify', {
      phone: '+201000000006',
      code: right,
    });
    expect(locked.status).toBe(429);
    expect(problem(locked).code).toBe('otp_locked');
  });

  it('accepts the code in Arabic-Indic digits and the phone in any local form (RTL-04)', async () => {
    await api.resetOtpLimits();
    const c = new Client(api);
    await c.call('POST', '/v1/auth/otp/request', { phone: '٠١٠٠٠٠٠٠٠٠٣' });
    const code = api.sms.lastCode(PHONES.owner);
    const arabic = code.replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));
    const r = await c.call('POST', '/v1/auth/otp/verify', {
      phone: '+20 100 000 0003',
      code: arabic,
    });
    expect(r.status).toBe(200);
  });

  it('a code works once', async () => {
    const c = new Client(api);
    await c.signIn(PHONES.owner);
    const again = await c.call('POST', '/v1/auth/otp/verify', {
      phone: PHONES.owner,
      code: api.sms.lastCode(PHONES.owner),
    });
    expect(problem(again).code).toBe('otp_expired');
  });

  it('rejects a non-Egyptian mobile number with 422 invalid_phone (RFC 9457 body)', async () => {
    const r = await new Client(api).call('POST', '/v1/auth/otp/request', {
      phone: '+441234567890',
    });
    expect(r.status).toBe(422);
    expect(r.headers.get('content-type')).toContain('application/problem+json');
    expect(problem(r)).toMatchObject({ code: 'invalid_phone', status: 422 });
    expect(problem(r).requestId).toMatch(/^req_/);
  });
});

describe('MKT-ACC-02 / -03 accounts and roles', () => {
  it('the sample owner signs in: role, centre and name come from the database', async () => {
    const c = new Client(api);
    const r = await c.signIn(PHONES.owner);
    expect(r.isNewUser).toBe(false);
    expect(r.user.roles).toEqual(['centre_owner']);
    expect(r.user.centreIds).toHaveLength(1);
    const me = await c.call<{ name: string }>('GET', '/v1/me');
    expect(me.body.name).toBe('تامر فؤاد');
  });

  it('a new number gets an account with no role; the parent role and a child follow (MKT-ACC-05)', async () => {
    const c = new Client(api);
    const r = await c.signIn('+201555000111');
    expect(r.isNewUser).toBe(true);
    expect(r.user.roles).toEqual([]);
    const me = await c.call<{ roles: string[] }>('POST', '/v1/me/roles', { role: 'parent' });
    expect(me.body.roles).toEqual(['parent']);
    const curricula = await c.call<{ id: string; schoolYears: { id: string }[] }[]>(
      'GET',
      '/v1/curricula',
    );
    const nat = curricula.body[0]!;
    const child = await c.call<{ displayName: string; schoolYear: { shortName: string } }>(
      'POST',
      '/v1/me/children',
      { displayName: 'Laila', curriculumId: nat.id, schoolYearId: nat.schoolYears[0]!.id },
    );
    expect(child.status).toBe(201);
    expect(child.body.schoolYear.shortName).toBeTruthy();
    const list = await c.call<{ data: unknown[] }>('GET', '/v1/me/children');
    expect(list.body.data).toHaveLength(1);
    // BR-DAT-03: adding a child records the child_data_processing consent.
    const consents = await c.call<{ data: { kind: string; granted: boolean }[] }>(
      'GET',
      '/v1/me/consents',
    );
    expect(consents.body.data).toEqual([
      expect.objectContaining({ kind: 'child_data_processing', granted: true }),
    ]);
  });

  it('a school year of another curriculum is refused', async () => {
    const c = new Client(api);
    await c.signIn(PHONES.parent);
    const cur = (
      await c.call<{ id: string; schoolYears: { id: string }[] }[]>('GET', '/v1/curricula')
    ).body;
    const otherYear = cur.find((x) => x.schoolYears.length && x.id !== cur[0]!.id)!.schoolYears[0]!
      .id;
    const r = await c.call('POST', '/v1/me/children', {
      displayName: 'X',
      curriculumId: cur[0]!.id,
      schoolYearId: otherYear,
    });
    expect(r.status).toBe(422);
  });

  it('the sample parent sees Mariam and Youssef', async () => {
    const c = new Client(api, { lang: 'ar' });
    await c.signIn(PHONES.parent);
    const list = await c.call<{ data: { displayName: string }[] }>('GET', '/v1/me/children');
    expect(list.body.data.map((x) => x.displayName)).toEqual(['مريم حسن', 'يوسف حسن']);
  });

  it('a teacher signs up: the teacher role brings a teacher profile', async () => {
    const c = new Client(api);
    await c.signIn('+201555000222');
    const me = await c.call<{ roles: string[]; teacherId: string | null }>('POST', '/v1/me/roles', {
      role: 'teacher',
    });
    expect(me.body.roles).toEqual(['teacher']);
    expect(me.body.teacherId).toBeTruthy();
  });

  it('centre_owner is not a self-service role: it comes from a join request (C01)', async () => {
    const c = new Client(api);
    await c.signIn('+201555000333');
    const r = await c.call('POST', '/v1/me/roles', { role: 'centre_owner' });
    expect(problem(r).code).toBe('centre_application_required');
  });

  it('PATCH /v1/me changes the name; an empty name is refused (07 §2a P-1)', async () => {
    const c = new Client(api);
    await c.signIn(PHONES.reception);
    expect((await c.call<{ name: string }>('PATCH', '/v1/me', { name: 'Dina A.' })).body.name).toBe(
      'Dina A.',
    );
    expect((await c.call('PATCH', '/v1/me', { name: '' })).status).toBe(422);
  });

  it("BR-DAT-03: consents are events; the latest per kind wins; another family's child is 403", async () => {
    const c = new Client(api);
    await c.signIn(PHONES.parent);
    await c.call('PUT', '/v1/me/consents', { kind: 'sms_updates', granted: true, version: 'v1' });
    const r = await c.call<{ data: { kind: string; granted: boolean }[] }>(
      'PUT',
      '/v1/me/consents',
      {
        kind: 'sms_updates',
        granted: false,
        version: 'v1',
      },
    );
    expect(r.body.data.find((x) => x.kind === 'sms_updates')?.granted).toBe(false);
    const stranger = await api.db
      .selectFrom('org.students')
      .select('id')
      .where('display_name', '=', 'Laila')
      .executeTakeFirstOrThrow();
    const forbidden = await c.call('PUT', '/v1/me/consents', {
      kind: 'whatsapp_updates',
      granted: true,
      version: 'v1',
      studentId: stranger.id,
    });
    expect(forbidden.status).toBe(403);
  });
});

describe('MKT-ACC-04 tokens', () => {
  it('teacher app: refresh rotates; a rotated token reused later revokes the whole chain', async () => {
    const c = new Client(api);
    await c.signIn(PHONES.teacher);
    const first = c.refresh!;
    const r = await c.call<{ accessToken: string; refreshToken: string }>(
      'POST',
      '/v1/auth/refresh',
      {
        refreshToken: first,
      },
    );
    expect(r.status).toBe(200);
    expect(r.body.refreshToken).not.toBe(first);
    // Within the grace window: two tabs refreshing at once, not theft.
    const race = await c.call('POST', '/v1/auth/refresh', { refreshToken: first });
    expect(problem(race).code).toBe('refresh_raced');
    // Later: reuse → the chain is revoked, the newest token dies too.
    await sql`UPDATE identity.auth_sessions SET revoked_at = now() - interval '1 minute' WHERE replaced_by IS NOT NULL`.execute(
      api.db,
    );
    const reuse = await c.call('POST', '/v1/auth/refresh', { refreshToken: first });
    expect(problem(reuse).code).toBe('refresh_invalid');
    const newest = await c.call('POST', '/v1/auth/refresh', { refreshToken: r.body.refreshToken });
    expect(problem(newest).code).toBe('refresh_invalid');
  });

  it('web: tokens only as httpOnly cookies; the CSRF header is required; logout clears them', async () => {
    const web = new Client(api, { web: true });
    const r = await web.signIn(PHONES.owner);
    expect(r.accessToken).toBeUndefined();
    expect(r.refreshToken).toBeUndefined();
    expect([...web.cookies().keys()].sort()).toEqual(['link_at', 'link_rt']);
    expect((await web.call('GET', '/v1/me')).status).toBe(200);
    // The same cookie without X-Link-Auth (a cross-site form) is refused.
    const at = web.cookies().get('link_at')!;
    const csrf = await fetch(`${api.base}/v1/me`, { headers: { cookie: `link_at=${at}` } });
    expect(csrf.status).toBe(403);
    const rt = web.cookies().get('link_rt');
    const refreshed = await web.call('POST', '/v1/auth/refresh', {});
    expect(refreshed.status).toBe(200);
    expect(refreshed.body).toEqual({});
    expect(web.cookies().get('link_rt')).not.toBe(rt);
    expect((await web.call('POST', '/v1/auth/logout', {})).status).toBe(204);
    expect((await web.call('GET', '/v1/me')).status).toBe(401);
  });

  it('a garbage or missing token is 401 unauthenticated', async () => {
    const c = new Client(api);
    expect(problem(await c.call('GET', '/v1/me')).code).toBe('unauthenticated');
    c.token = 'not-a-jwt';
    expect((await c.call('GET', '/v1/me')).status).toBe(401);
  });
});

describe('07 §1 idempotency', () => {
  it('same key + same body replays the first response; a different body is 422', async () => {
    const c = new Client(api);
    await c.signIn(PHONES.reception);
    const key = { 'idempotency-key': 'idem-test-0001' };
    const a = await c.call('PATCH', '/v1/me', { name: 'Dina' }, key);
    const b = await c.call('PATCH', '/v1/me', { name: 'Dina' }, key);
    expect(b.status).toBe(a.status);
    expect(b.body).toEqual(a.body);
    expect(b.headers.get('idempotent-replayed')).toBe('true');
    const reused = await c.call('PATCH', '/v1/me', { name: 'Someone else' }, key);
    expect(problem(reused).code).toBe('idempotency_key_reused');
  });

  it('a state-changing call without a key is refused', async () => {
    const c = new Client(api);
    await c.signIn(PHONES.reception);
    const res = await fetch(`${api.base}/v1/me`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Dina' }),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe('idempotency_key_required');
  });
});

describe('MKT-CEN-01 join request (C01) → pending centre', () => {
  it('stores a lead; when that number signs in, a pending centre and the owner role appear', async () => {
    const anon = new Client(api);
    const apply = await anon.call<{ id: string }>('POST', '/v1/centre-applications', {
      centreName: 'Sample Centre',
      governorate: 'Giza',
      area: 'Dokki',
      address: '1 Sample St',
      subjects: ['MATH'],
      hallRange: '1-3',
      ownerName: 'Sample Owner',
      phone: '01555000444',
      consent: true,
    });
    expect(apply.status).toBe(201);
    const c = new Client(api);
    const r = await c.signIn('+201555000444');
    expect(r.user.roles).toEqual(['centre_owner']);
    const centre = await api.db
      .selectFrom('org.centres')
      .select(['verification', 'name'])
      .where('id', '=', r.user.centreIds[0]!)
      .executeTakeFirstOrThrow();
    expect(centre).toEqual({ verification: 'pending', name: 'Sample Centre' });
    // 06 §3 retention: the converted lead keeps no name or number.
    const lead = await api.db
      .selectFrom('org.leads')
      .select(['status', 'name', 'whatsapp_hmac'])
      .where('id', '=', apply.body.id)
      .executeTakeFirstOrThrow();
    expect(lead).toEqual({ status: 'converted', name: null, whatsapp_hmac: null });
  });

  it('refuses a request without the contact consent', async () => {
    const r = await new Client(api).call('POST', '/v1/centre-applications', {
      centreName: 'X',
      governorate: 'Giza',
      area: 'Dokki',
      address: '1',
      subjects: [],
      hallRange: '1-3',
      ownerName: 'X',
      phone: '01555000555',
      consent: false,
    });
    expect(problem(r).code).toBe('consent_required');
  });
});

describe('MKT-ACC-06 staff invites', () => {
  it('owner invites Reception by phone: pending until that number signs in; audited; event queued', async () => {
    const owner = new Client(api);
    const o = await owner.signIn(PHONES.owner);
    const centreId = o.user.centreIds[0]!;
    const r = await owner.call<{ role: string; status: string; permissions: string[] }[]>(
      'POST',
      `/v1/centres/${centreId}/staff`,
      { phone: '01555000666', role: 'reception', permissions: ['reviews.reply'] },
    );
    expect(r.status).toBe(201);
    const pending = r.body.filter((s) => s.status === 'invite_pending');
    expect(pending).toEqual([
      expect.objectContaining({ role: 'reception', permissions: ['reviews.reply'] }),
    ]);
    const event = await api.db
      .selectFrom('platform.outbox_events')
      .select(['type', 'payload'])
      .where('type', '=', 'staff.invited')
      .executeTakeFirstOrThrow();
    expect(JSON.stringify(event.payload)).not.toContain('1555000666'); // no phone in events
    const audit = await api.db
      .selectFrom('audit.audit_events')
      .select('action')
      .where('action', '=', 'access.invited')
      .executeTakeFirst();
    expect(audit).toBeTruthy();
    const invitee = new Client(api);
    const s = await invitee.signIn('+201555000666');
    expect(s.user.roles).toEqual(['centre_staff']);
    expect(s.user.centreIds).toEqual([centreId]);
  });

  it('Reception cannot invite (403); an owner of another centre gets 404', async () => {
    const reception = new Client(api);
    const rc = await reception.signIn(PHONES.reception);
    const centreId = rc.user.centreIds[0]!;
    const r = await reception.call('POST', `/v1/centres/${centreId}/staff`, {
      phone: '01555000777',
      role: 'reception',
    });
    expect(r.status).toBe(403);
    const ownerB = new Client(api);
    await ownerB.signIn(PHONES.ownerB);
    expect((await ownerB.call('GET', `/v1/centres/${centreId}/staff`)).status).toBe(404);
  });
});

describe('E0-09 feature flags (OD-58)', () => {
  it('signed-in only; global flags plus the Follow-up extra of the caller’s own centre', async () => {
    expect((await new Client(api).call('GET', '/v1/feature-flags')).status).toBe(401);
    const owner = new Client(api);
    const o = await owner.signIn(PHONES.owner);
    const centreId = o.user.centreIds[0]!;
    const flags = await owner.call<{ flags: Record<string, boolean> }>('GET', '/v1/feature-flags');
    expect(flags.body.flags['marketplace.enabled']).toBe(true);
    await sql`UPDATE platform.feature_flags SET enabled = false WHERE key = 'followup.extra' AND scope_id = ${centreId}`.execute(
      api.db,
    );
    expect((await owner.call('GET', `/v1/centres/${centreId}/features`)).body).toEqual({
      followupExtra: false,
    });
    await sql`UPDATE platform.feature_flags SET enabled = true WHERE key = 'followup.extra' AND scope_id = ${centreId}`.execute(
      api.db,
    );
    expect((await owner.call('GET', `/v1/centres/${centreId}/features`)).body).toEqual({
      followupExtra: true,
    });
  });
});

describe('S3 home area (MKT-DSC-01)', () => {
  it('lists the areas with a verified centre; a parent picks one, clears it; others are refused', async () => {
    const areas = (await new Client(api).call<{ name: string }[]>('GET', '/v1/areas')).body;
    expect(areas.length).toBeGreaterThan(0);
    const parent = new Client(api);
    await parent.signIn(PHONES.parent);
    const area = areas[areas.length - 1]!.name;
    const r = await parent.call<{ homeArea: string | null }>('PATCH', '/v1/me', { homeArea: area });
    expect(r.status).toBe(200);
    expect(r.body.homeArea).toBe(area);
    const bad = await parent.call('PATCH', '/v1/me', { homeArea: 'Atlantis' });
    expect([bad.status, (bad.body as { code?: string }).code]).toEqual([422, 'unknown_area']);
    const cleared = await parent.call<{ homeArea: string | null }>('PATCH', '/v1/me', {
      homeArea: null,
    });
    expect(cleared.body.homeArea).toBeNull();
    const teacher = new Client(api);
    await teacher.signIn(PHONES.teacher);
    expect((await teacher.call('PATCH', '/v1/me', { homeArea: area })).status).toBe(403);
  });
});
