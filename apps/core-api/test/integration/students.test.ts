// Database v2 (docs/plan/database-v2.md; decisions of 2026-10-16): student accounts, what students
// and parents read, and the teacher and centre sides. pnpm test:api (link_test, a fresh demo world).
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoId } from '../../seeds/demo';
import { KARIM_GROUP, KARIM_PHONE, MARIAM, topicId } from '../../seeds/demo-students';
import { type Api, Client, PHONES, startApi, studentClient } from '../helpers';

let api: Api;
let parent: Client;
let owner: Client;
let karim: Client;
let salma: Client;
let mariam: Client;
const YOUSSEF = demoId('chd-youssef');
const NOUR = demoId('cen-nour');

beforeAll(async () => {
  api = await startApi();
  parent = new Client(api);
  await parent.signIn(PHONES.parent);
  owner = new Client(api);
  await owner.signIn(PHONES.owner);
  karim = new Client(api);
  await karim.signIn(KARIM_PHONE);
  salma = new Client(api);
  await salma.signIn(PHONES.teacher);
  mariam = await studentClient(api);
}, 120_000);
afterAll(() => api.close());

type Account = {
  account: {
    status: string;
    failedPinCount: number;
    devices: { id: string; label: string; lastUsedAt: string | null }[];
  } | null;
};
type Redeem = { deviceId: string; deviceSecret?: string; pinSetupToken: string };
const anon = () => new Client(api);

/** Parent → code → a device redeems it → PIN set. Returns the device's credentials. */
async function bindDevice(
  studentId: string,
  pin = '1357',
  known?: { deviceId: string; deviceSecret: string },
) {
  const code = await parent.call<{ code: string }>(
    'POST',
    `/v1/children/${studentId}/student-account/access-codes`,
  );
  expect(code.status).toBe(201);
  const r = await anon().call<Redeem>('POST', '/v1/auth/student/redeem', {
    code: code.body.code,
    platform: 'web',
    ...(known ?? {}),
  });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  const p = await anon().call<{ accessToken: string }>('POST', '/v1/auth/student/pin', {
    pinSetupToken: r.body.pinSetupToken,
    pin,
  });
  expect(p.status).toBe(200);
  return {
    deviceId: r.body.deviceId,
    deviceSecret: known?.deviceSecret ?? r.body.deviceSecret!,
    token: p.body.accessToken,
  };
}
/** Device + PIN (the per-address limit is cleared first, as Client.signIn does for phone codes). */
const signIn = async (d: { deviceId: string; deviceSecret: string }, pin: string) => {
  await api.resetOtpLimits();
  return anon().call<{ accessToken: string; code?: string; triesLeft?: number }>(
    'POST',
    '/v1/auth/student/sign-in',
    {
      deviceId: d.deviceId,
      deviceSecret: d.deviceSecret,
      pin,
    },
  );
};
const asToken = (token: string) => {
  const c = anon();
  c.token = token;
  return c;
};

describe('Student accounts (STU-ACC-01)', () => {
  it('STU-ACC-01: only a parent can create a student account', async () => {
    for (const c of [owner, karim, salma, mariam]) {
      const r = await c.call('POST', `/v1/children/${YOUSSEF}/student-account`);
      expect(r.status, 'not a parent of Youssef').toBe(404);
    }
    const r = await parent.call<Account>('POST', `/v1/children/${YOUSSEF}/student-account`);
    expect(r.status).toBe(201);
    expect(r.body.account!.status).toBe('awaiting_device');
    expect((await parent.call('POST', `/v1/children/${YOUSSEF}/student-account`)).status).toBe(409);
    // The DB itself refuses an account made for a guardian who is not the child's.
    const err = await api.db
      .insertInto('identity.student_accounts')
      .values({
        student_id: demoId('chd-mariam-no-such'),
        user_id: demoId('usr-parent'),
        guardian_id: demoId('gdn-parent'),
        created_by_user_id: demoId('usr-parent'),
        consent_event_id: demoId('x'),
      })
      .execute()
      .catch((e: { constraint?: string }) => e.constraint);
    expect(err).toBe('student_account_guardian');
    // The consent is recorded with its version, per child.
    const consent = await api.db
      .selectFrom('org.consent_events')
      .select(['version', 'granted'])
      .where('student_id', '=', YOUSSEF)
      .where('kind', '=', 'student_account')
      .executeTakeFirstOrThrow();
    expect(consent).toEqual({ version: 'draft-2026-10', granted: true });
  });

  it('STU-ACC-01: no Google, email or phone sign-in for students, and no student phone', async () => {
    const u = await api.db
      .selectFrom('identity.student_accounts as a')
      .innerJoin('identity.users as u', 'u.id', 'a.user_id')
      .select(['u.id', 'u.phone_hmac', 'u.account_type'])
      .where('a.student_id', '=', YOUSSEF)
      .executeTakeFirstOrThrow();
    expect(u).toMatchObject({ phone_hmac: null, account_type: 'student' });
    for (const provider of ['email', 'google', 'phone'] as const) {
      const err = await api.db
        .insertInto('identity.user_identities')
        .values({
          id: demoId(`ident-${provider}`),
          user_id: u.id,
          provider,
          subject: Buffer.alloc(32, 7),
          contact_enc: provider === 'google' ? null : Buffer.from('x'),
          hint: 'x',
        })
        .execute()
        .catch((e: { constraint?: string }) => e.constraint);
      // A phone is also refused as not the user's phone (the student user has none).
      expect(['student_no_identity', 'phone_identity_mirror'], provider).toContain(err);
    }
    const phone = await api.db
      .updateTable('identity.users')
      .set({ phone_hmac: Buffer.alloc(32, 1), phone_enc: Buffer.from('x'), phone_last4: '0000' })
      .where('id', '=', u.id)
      .execute()
      .catch((e: { constraint?: string }) => e.constraint);
    expect(phone).toBe('users_student_no_contact');
  });

  it('STU-ACC-01: the access code works once, for 10 minutes; a new code cancels the old one', async () => {
    const first = await parent.call<{ code: string; expiresAt: string }>(
      'POST',
      `/v1/children/${YOUSSEF}/student-account/access-codes`,
    );
    const mins = (Date.parse(first.body.expiresAt) - Date.now()) / 60_000;
    expect(mins).toBeGreaterThan(9);
    expect(mins).toBeLessThanOrEqual(10);
    const second = await parent.call<{ code: string }>(
      'POST',
      `/v1/children/${YOUSSEF}/student-account/access-codes`,
    );
    const old = await anon().call<{ code: string }>('POST', '/v1/auth/student/redeem', {
      code: first.body.code,
      platform: 'web',
    });
    expect([old.status, old.body.code]).toEqual([422, 'code_invalid']);
    const ok = await anon().call<Redeem>('POST', '/v1/auth/student/redeem', {
      code: second.body.code.toLowerCase(),
      platform: 'web',
    });
    expect(ok.status).toBe(200);
    const again = await anon().call<{ code: string }>('POST', '/v1/auth/student/redeem', {
      code: second.body.code,
      platform: 'web',
    });
    expect([again.status, again.body.code]).toEqual([422, 'code_invalid']);
    // The code is never stored, only its HMAC.
    const rows = await api.db.selectFrom('identity.student_access_codes').selectAll().execute();
    expect(JSON.stringify(rows)).not.toContain(second.body.code.replace('-', ''));
    // Unbind that half-set-up device again for the next tests.
    await parent.call(
      'DELETE',
      `/v1/children/${YOUSSEF}/student-account/devices/${ok.body.deviceId}`,
    );
  });

  let phone: { deviceId: string; deviceSecret: string };
  let laptop: { deviceId: string; deviceSecret: string };
  it('STU-ACC-01 device binding: the PIN works only on the device it was set on', async () => {
    phone = await bindDevice(YOUSSEF, '1357');
    laptop = await bindDevice(YOUSSEF, '2468');
    expect((await signIn(phone, '1357')).status).toBe(200);
    expect((await signIn(laptop, '2468')).status).toBe(200);
    // The laptop's PIN on the phone, and the phone's PIN with the laptop's secret: refused.
    expect((await signIn(phone, '2468')).body.code).toBe('wrong_pin');
    const crossed = await signIn(
      { deviceId: phone.deviceId, deviceSecret: laptop.deviceSecret },
      '1357',
    );
    expect([crossed.status, crossed.body.code]).toEqual([401, 'student_device_unknown']);
    // A wrong device secret never counts toward the lock (a stranger can't even try a PIN).
    const a = await parent.call<Account>('GET', `/v1/children/${YOUSSEF}/student-account`);
    expect(a.body.account!.failedPinCount).toBe(1);
    expect((await signIn(phone, '1357')).status).toBe(200); // resets the count
  });

  it('STU-ACC-01: a 3rd device is refused ("ask your parent to remove a device")', async () => {
    const code = await parent.call<{ code: string }>(
      'POST',
      `/v1/children/${YOUSSEF}/student-account/access-codes`,
    );
    const r = await anon().call<{ code: string; detail: string }>(
      'POST',
      '/v1/auth/student/redeem',
      { code: code.body.code, platform: 'ios' },
    );
    expect([r.status, r.body.code]).toEqual([409, 'student_device_limit']);
    expect(r.body.detail).toMatch(/remove a device/);
    // The database refuses a 3rd live device too.
    const err = await api.db
      .insertInto('identity.student_devices')
      .values({
        id: demoId('third-device'),
        student_id: YOUSSEF,
        user_id: (
          await api.db
            .selectFrom('identity.student_accounts')
            .select('user_id')
            .where('student_id', '=', YOUSSEF)
            .executeTakeFirstOrThrow()
        ).user_id,
        secret_hash: Buffer.alloc(32, 3),
        platform: 'ios',
        label: 'x',
      })
      .execute()
      .catch((e: { constraint?: string }) => e.constraint);
    expect(err).toBe('student_device_limit');
    // The parent sees both devices, with when each was last used.
    const a = await parent.call<Account>('GET', `/v1/children/${YOUSSEF}/student-account`);
    expect(a.body.account!.devices).toHaveLength(2);
    expect(a.body.account!.devices.every((d) => d.lastUsedAt)).toBe(true);
  });

  it('STU-ACC-01: a removed device stops working on its next request', async () => {
    const s = await signIn(laptop, '2468');
    const c = asToken(s.body.accessToken);
    expect((await c.call('GET', '/v1/me/student')).status).toBe(200);
    const r = await parent.call<Account>(
      'DELETE',
      `/v1/children/${YOUSSEF}/student-account/devices/${laptop.deviceId}`,
    );
    expect(r.body.account!.devices).toHaveLength(1);
    const after = await c.call<{ code: string }>('GET', '/v1/me/student');
    expect([after.status, after.body.code]).toEqual([401, 'student_device_removed']);
    expect((await signIn(laptop, '2468')).body.code).toBe('student_device_unknown');
  });

  it('STU-ACC-01 student PIN locking: the 5th wrong PIN locks the account until the parent makes a new code', async () => {
    const live = asToken((await signIn(phone, '1357')).body.accessToken);
    for (let i = 1; i <= 4; i++) {
      const r = await signIn(phone, '0000');
      expect([r.status, r.body.code, r.body.triesLeft]).toEqual([401, 'wrong_pin', 5 - i]);
    }
    const fifth = await signIn(phone, '0000');
    expect([fifth.status, fifth.body.code]).toEqual([423, 'student_locked']);
    // Locked: the right PIN fails too, and the session already open stops.
    expect((await signIn(phone, '1357')).body.code).toBe('student_locked');
    expect((await live.call('GET', '/v1/me/student')).status).toBe(401);
    const a = await parent.call<Account>('GET', `/v1/children/${YOUSSEF}/student-account`);
    expect(a.body.account!.status).toBe('locked');
    // The parent makes a new code; on the same device the student sets a new PIN: unlocked.
    await bindDevice(YOUSSEF, '9753', phone);
    expect((await signIn(phone, '9753')).status).toBe(200);
    const b = await parent.call<Account>('GET', `/v1/children/${YOUSSEF}/student-account`);
    expect([b.body.account!.status, b.body.account!.failedPinCount]).toEqual(['active', 0]);
  });

  it('STU-ACC-01 parent pause works on the next request; resume lets the same device in again', async () => {
    const c = asToken((await signIn(phone, '9753')).body.accessToken);
    expect((await c.call('GET', '/v1/me/student')).status).toBe(200);
    expect(
      (await parent.call<Account>('POST', `/v1/children/${YOUSSEF}/student-account/pause`)).body
        .account!.status,
    ).toBe('paused');
    expect((await c.call('GET', '/v1/me/student')).status).toBe(401);
    expect((await signIn(phone, '9753')).body.code).toBe('student_paused');
    expect(
      (await parent.call<Account>('POST', `/v1/children/${YOUSSEF}/student-account/resume`)).body
        .account!.status,
    ).toBe('active');
    expect((await signIn(phone, '9753')).status).toBe(200);
  });

  it('STU-ACC-01: sign out everywhere ends every session and unbinds every device', async () => {
    const c = asToken((await signIn(phone, '9753')).body.accessToken);
    const r = await parent.call<Account>(
      'POST',
      `/v1/children/${YOUSSEF}/student-account/sign-out-everywhere`,
    );
    expect([r.body.account!.status, r.body.account!.devices.length]).toEqual([
      'awaiting_device',
      0,
    ]);
    expect((await c.call('GET', '/v1/me/student')).status).toBe(401);
    expect((await signIn(phone, '9753')).body.code).toBe('student_device_unknown');
  });

  it('BR-DAT-03: withdrawing the student_account consent closes the account at once', async () => {
    const d = await bindDevice(YOUSSEF, '1111');
    const c = asToken((await signIn(d, '1111')).body.accessToken);
    const w = await parent.call('PUT', '/v1/me/consents', {
      kind: 'student_account',
      granted: false,
      version: 'draft-2026-10',
      studentId: YOUSSEF,
    });
    expect(w.status).toBe(200);
    expect((await c.call('GET', '/v1/me/student')).status).toBe(401);
    const a = await parent.call<Account>('GET', `/v1/children/${YOUSSEF}/student-account`);
    expect([a.body.account!.status, a.body.account!.devices.length]).toEqual(['closed', 0]);
  });
});

describe('What students read, and only their own (STU-SCH-01, STU-MIS-01, STU-HW-01)', () => {
  it("student can't read another student: every family table and view holds only Mariam's rows", async () => {
    const { student_user } = await api.db
      .selectFrom('identity.student_accounts')
      .select('user_id as student_user')
      .where('student_id', '=', MARIAM)
      .executeTakeFirstOrThrow();
    const rows = await api.s.db.asUser(student_user, async (tx) => ({
      summaries: await tx
        .selectFrom('records.student_session_summaries')
        .select('student_id')
        .execute(),
      homework: await tx.selectFrom('records.student_homework').select('student_id').execute(),
      topics: await tx.selectFrom('records.student_session_topics').select('student_id').execute(),
      makeups: await tx.selectFrom('market.makeup_requests').select('student_id').execute(),
      notes: await tx.selectFrom('records.student_notes').select('student_id').execute(),
      scores: await tx.selectFrom('analytics.student_topic_scores').select('student_id').execute(),
      snaps: await tx.selectFrom('analytics.topic_score_snapshots').select('student_id').execute(),
      plans: await tx.selectFrom('analytics.focus_plans').select('student_id').execute(),
      accounts: await tx.selectFrom('identity.student_accounts').select('student_id').execute(),
      students: await tx.selectFrom('org.students').select('id as student_id').execute(),
      // Base tables a student never reads at all.
      entries: await tx.selectFrom('records.record_entries').select('student_id').execute(),
      enrolments: await tx.selectFrom('market.enrolments').select('student_id').execute(),
      payments: await tx.selectFrom('ledger.payments').select('id as student_id').execute(),
    }));
    for (const [k, list] of Object.entries(rows)) {
      if (['entries', 'enrolments', 'payments'].includes(k)) expect(list, k).toEqual([]);
      else {
        expect(list.length, k).toBeGreaterThan(0);
        expect([...new Set(list.map((r) => r.student_id))], k).toEqual([MARIAM]);
      }
    }
    // Through the API: another child's pages and the teacher's student page are not hers.
    for (const path of [
      `/v1/children/${YOUSSEF}/missed`,
      `/v1/children/${MARIAM}/missed`,
      `/v1/students/${YOUSSEF}`,
    ]) {
      const r = await mariam.call('GET', path);
      expect(r.status, path).toBe(404);
    }
    // Parent routes are not the student's, and student routes are not the parent's.
    expect((await parent.call<{ code: string }>('GET', '/v1/me/missed')).body.code).toBe(
      'students_only',
    );
  });

  it('STU-MIS-01: what you missed — the confirmed record of the absent session, its topic and homework', async () => {
    const r = await mariam.call<{
      items: {
        topicCovered: string;
        homeworkSet: string;
        topics: { id: string }[];
        homework: { status: string }[];
        makeupRequestId: string | null;
      }[];
    }>('GET', '/v1/me/missed');
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(1);
    const m = r.body.items[0]!;
    expect(m.topicCovered).toMatch(/قانون الجيب/);
    expect(m.homeworkSet).toBeTruthy();
    expect(m.topics.map((t) => t.id)).toEqual([topicId('triangles')]);
    expect(m.homework.map((h) => h.status)).toEqual(['set']);
    expect(m.makeupRequestId).toBeTruthy();
    // The parent sees exactly the same.
    const p = await parent.call('GET', `/v1/children/${MARIAM}/missed`);
    expect(p.body).toEqual(r.body);
  });

  it('STU-HW-01: homework set, handed in, late — and unmarked homework is never shown as missing', async () => {
    const r = await mariam.call<{ items: { status: string; dueAt: string | null }[] }>(
      'GET',
      '/v1/me/homework',
    );
    expect(r.body.items.map((h) => h.status).sort()).toEqual(['handed_in', 'late', 'set', 'set']);
    expect(JSON.stringify(r.body)).not.toMatch(/missing/);
  });

  it('STU-MIS-01: draft records never reach the student or the parent', async () => {
    // Karim opens a record for the open session and writes what was covered (a draft).
    const groupSessions = await karim.call<{ id: string; status: string }[]>(
      'GET',
      `/v1/groups/${KARIM_GROUP}/session-records`,
    );
    expect(groupSessions.status).toBe(200);
    const past = await sql<{ id: string }>`
      SELECT s.id FROM market.group_sessions s
      WHERE s.group_id = ${KARIM_GROUP} AND s.starts_at < now() AND s.status <> 'cancelled'
        AND NOT EXISTS (SELECT 1 FROM records.session_records r WHERE r.group_session_id = s.id)
      ORDER BY s.starts_at DESC LIMIT 1`.execute(api.db);
    const open = await karim.call<{ id: string }>(
      'POST',
      `/v1/groups/${KARIM_GROUP}/session-records`,
      { groupSessionId: past.rows[0]!.id },
    );
    expect(open.status).toBe(201);
    const put = await karim.call<{ topicCovered: string }>(
      'PUT',
      `/v1/session-records/${open.body.id}/learning`,
      {
        topicCovered: 'Draft: graphs',
        topicIds: [topicId('graphs')],
        homework: [{ title: 'Draft homework' }],
      },
    );
    expect(put.status).toBe(200);
    for (const c of [mariam, parent]) {
      const path = c === mariam ? '/v1/me/homework' : `/v1/children/${MARIAM}/homework`;
      expect(JSON.stringify((await c.call('GET', path)).body), path).not.toContain(
        'Draft homework',
      );
    }
    const topics = await mariam.call<{
      subjects: { topics: { topicId: string; band: string }[] }[];
    }>('GET', '/v1/me/topics');
    expect(topics.body.subjects[0]!.topics.find((t) => t.topicId === topicId('graphs'))!.band).toBe(
      'not_taught_yet',
    );
    // Only Ms Salma's… no: only the group's teacher writes it.
    expect(
      (
        await salma.call('PUT', `/v1/session-records/${open.body.id}/learning`, {
          topicCovered: 'x',
        })
      ).status,
    ).toBe(404);
  });

  it('STU-SCH-01: a moved session and a hall change are logged once and reach the student and the parent', async () => {
    const changes = await mariam.call<{ items: { kind: string; reason: string | null }[] }>(
      'GET',
      '/v1/me/schedule-changes',
    );
    expect(changes.body.items.map((c) => c.kind).sort()).toEqual(['moved', 'room_changed']);
    const sessions = await sql<{ id: string }>`
      SELECT id FROM market.group_sessions WHERE group_id = ${KARIM_GROUP} AND status = 'scheduled' AND starts_at > now() + interval '20 days'
      ORDER BY starts_at LIMIT 1`.execute(api.db);
    const target = sessions.rows[0]!.id;
    // The teacher moves a session; the hall is the centre's to change.
    const startsAt = new Date(Date.now() + 40 * 86_400_000);
    startsAt.setUTCHours(6, 0, 0, 0);
    const moved = await karim.call<{ changes: string[] }>('PATCH', `/v1/sessions/${target}`, {
      startsAt: startsAt.toISOString(),
      reason: 'Exam week',
    });
    expect([moved.status, moved.body.changes]).toEqual([200, ['moved']]);
    expect(
      (
        await karim.call('PATCH', `/v1/sessions/${target}`, {
          roomId: demoId('hall-nour-2'),
          reason: 'x',
        })
      ).status,
    ).toBe(403);
    const after = await mariam.call<{ items: { kind: string; reason: string | null }[] }>(
      'GET',
      '/v1/me/schedule-changes',
    );
    expect(after.body.items).toHaveLength(3);
    expect(after.body.items[0]).toMatchObject({ kind: 'moved', reason: 'Exam week' });
    const n = await api.db
      .selectFrom('messaging.in_app_notifications')
      .select(['user_id'])
      .where('object_type', '=', 'session_change')
      .where('kind', '=', 'session_moved')
      .execute();
    // The seeded move and this one: Mariam and her parent once each, per change.
    expect(n.filter((x) => x.user_id === demoId('usr-parent'))).toHaveLength(2);
    // The parent reads the same change log for the child.
    const p = await parent.call<{ items: unknown[] }>(
      'GET',
      `/v1/children/${MARIAM}/schedule-changes`,
    );
    expect(p.body.items).toHaveLength(3);
    // A hall that is taken then: refused.
    const clash = await sql<{ id: string; starts_at: Date; ends_at: Date }>`
      SELECT id, starts_at, ends_at FROM market.group_sessions WHERE group_id = ${demoId('grp-salma-ws')} AND status = 'scheduled'
        AND starts_at > now() + interval '2 days' ORDER BY starts_at LIMIT 1`.execute(api.db);
    const c = clash.rows[0]!;
    const taken = await owner.call<{ code: string }>('PATCH', `/v1/sessions/${target}`, {
      startsAt: c.starts_at.toISOString(),
      endsAt: c.ends_at.toISOString(),
      roomId: demoId('hall-nour-2'),
      reason: 'x',
    });
    expect([taken.status, taken.body.code]).toEqual([409, 'hall_taken']);
  });
});

describe('Teacher notes for the student (STU-NOTE-01)', () => {
  it('STU-NOTE-01: note invisible until approved, and locked once approved', async () => {
    const draft = await karim.call<{ id: string; status: string }>(
      'POST',
      `/v1/groups/${KARIM_GROUP}/student-notes`,
      { studentId: MARIAM, body: 'Well done on exponents.' },
    );
    expect([draft.status, draft.body.status]).toEqual([201, 'draft']);
    const seen = async () =>
      JSON.stringify((await mariam.call('GET', '/v1/me/student-notes')).body) +
      JSON.stringify((await parent.call('GET', `/v1/children/${MARIAM}/student-notes`)).body);
    expect(await seen()).not.toContain('Well done on exponents.');
    expect((await karim.call('POST', `/v1/student-notes/${draft.body.id}/submit`)).status).toBe(
      200,
    );
    expect(await seen()).not.toContain('Well done on exponents.');
    const ok = await owner.call<{ status: string }>(
      'POST',
      `/v1/student-notes/${draft.body.id}/approve`,
    );
    expect(ok.body.status).toBe('approved');
    expect(await seen()).toContain('Well done on exponents.');
    // The seeded draft stays hidden; the seeded approved note shows.
    const mine = await mariam.call<{ items: { status: string }[] }>('GET', '/v1/me/student-notes');
    expect(mine.body.items.every((n) => n.status === 'approved')).toBe(true);
    expect(mine.body.items).toHaveLength(2);
    // Locked: no change after approval, even at the database.
    const err = await api.db
      .updateTable('records.student_notes')
      .set({ body: 'changed' })
      .where('id', '=', draft.body.id)
      .execute()
      .catch((e: { constraint?: string }) => e.constraint);
    expect(err).toBe('note_locked');
    expect(
      (await owner.call<{ code: string }>('POST', `/v1/student-notes/${draft.body.id}/approve`))
        .body.code,
    ).toBe('note_locked');
  });

  it('STU-NOTE-01: only the owner or staff with messages.approve approve (checked by the database too)', async () => {
    const n = await karim.call<{ id: string }>('POST', `/v1/groups/${KARIM_GROUP}/student-notes`, {
      studentId: MARIAM,
      body: 'Another note.',
    });
    await karim.call('POST', `/v1/student-notes/${n.body.id}/submit`);
    expect((await karim.call('POST', `/v1/student-notes/${n.body.id}/approve`)).status).toBe(404);
    const err = await api.db
      .updateTable('records.student_notes')
      .set({ status: 'approved', approved_by: demoId('usr-tch-karim'), approved_at: new Date() })
      .where('id', '=', n.body.id)
      .execute()
      .catch((e: { constraint?: string }) => e.constraint);
    expect(err).toBe('note_approver');
  });
});

type Progress = {
  subjects: {
    groupId: string;
    level: number;
    stars: number;
    topics: {
      topicId: string;
      score: number | null;
      band: string;
      stars: number;
      quizCount: number;
      lastMonth: unknown;
    }[];
  }[];
};

describe('Topic scores (STU-TOP-01, CF-58, ANL-STU-01)', () => {
  it('STU-TOP-01: topic score hidden under 2 quizzes; one topic in each band', async () => {
    const r = await mariam.call<Progress>('GET', '/v1/me/topics');
    const t = Object.fromEntries(r.body.subjects[0]!.topics.map((x) => [x.topicId, x]));
    expect(t[topicId('functions')]).toMatchObject({
      score: 86,
      band: 'mastered',
      stars: 3,
      quizCount: 2,
    });
    expect(t[topicId('exponents')]).toMatchObject({ score: 64, band: 'improving', stars: 2 });
    expect(t[topicId('logarithms')]).toMatchObject({ score: 42, band: 'needs_practice', stars: 1 });
    expect(t[topicId('identities')]).toMatchObject({
      score: null,
      band: 'not_enough_data',
      stars: 0,
      quizCount: 1,
    });
    expect(t[topicId('triangles')]).toMatchObject({
      score: null,
      band: 'not_enough_data',
      stars: 0,
    });
    expect(t[topicId('limits')]).toMatchObject({ score: null, band: 'not_taught_yet', stars: 0 });
    // 3 + 2 + 1 = 6 stars → level 1; last month's snapshot is there for the comparison.
    expect([r.body.subjects[0]!.stars, r.body.subjects[0]!.level]).toEqual([6, 1]);
    expect(t[topicId('functions')]!.lastMonth).toEqual({ score: 71, band: 'improving' });
    // The view itself hides the score under 2 quizzes (no endpoint can show it).
    const raw = await sql<{ score: string | null }>`
      SELECT score FROM analytics.student_topic_scores WHERE student_id = ${MARIAM} AND topic_node_id = ${topicId('identities')}`.execute(
      api.db,
    );
    expect(raw.rows.every((x) => x.score === null)).toBe(true);
  });

  it('STU-TOP-01 band edges: 80 mastered, 79 improving, 60 improving, 59 needs practice (whole number, half up)', async () => {
    // Five classmates of Mariam's, marked on the logarithms question (out of 6) in both quizzes.
    const quizzes = await sql<{ item: string; record: string }>`
      SELECT ai.id AS item, a.session_record_id AS record FROM records.assessment_items ai
      JOIN records.assessments a ON a.id = ai.assessment_id
      JOIN analytics.item_topics it ON it.assessment_item_id = ai.id
      WHERE a.group_id = ${KARIM_GROUP} AND it.topic_node_id = ${topicId('logarithms')} AND a.tagging_mode = 'per_question' ORDER BY a.taken_on`.execute(
      api.db,
    );
    const both = await sql<{ student_id: string }>`
      SELECT e.student_id FROM records.record_entries e
      WHERE e.session_record_id = ANY (${quizzes.rows.map((q) => q.record)}::uuid[]) AND e.student_id <> ${MARIAM}
      GROUP BY e.student_id HAVING count(*) = 2 ORDER BY e.student_id LIMIT 5`.execute(api.db);
    const cases: [number, string][] = [
      [4.8, 'mastered'], //        80.00
      [4.77, 'mastered'], //       79.50 → 80
      [4.74, 'improving'], //      79.00
      [3.6, 'improving'], //       60.00
      [3.54, 'needs_practice'], // 59.00
    ];
    for (const [k, [marks]] of cases.entries())
      for (const q of quizzes.rows)
        await api.db
          .insertInto('records.item_scores')
          .values({
            id: demoId(`edge:${k}:${q.item}`),
            assessment_item_id: q.item,
            student_id: both.rows[k]!.student_id,
            centre_id: NOUR,
            marks: String(marks),
          })
          .execute();
    const scores = await karim.call<{
      students: {
        studentId: string;
        topics: { topicId: string; band: string; score: number | null }[];
      }[];
    }>('GET', `/v1/groups/${KARIM_GROUP}/topic-scores`);
    for (const [k, [, band]] of cases.entries()) {
      const s = scores.body.students.find((x) => x.studentId === both.rows[k]!.student_id)!;
      expect(s.topics.find((t) => t.topicId === topicId('logarithms'))!.band, `case ${k}`).toBe(
        band,
      );
    }
    // One quiz only → hidden and 0 stars.
    const one = scores.body.students.find((x) => x.studentId === MARIAM)!;
    expect(one.topics.find((t) => t.topicId === topicId('identities'))).toMatchObject({
      score: null,
      band: 'not_enough_data',
    });
  });

  it('CF-58: same score for student, parent and teacher', async () => {
    const student = (await mariam.call<Progress>('GET', '/v1/me/topics')).body.subjects[0]!.topics;
    const child = (await parent.call<Progress>('GET', `/v1/children/${MARIAM}/topics`)).body
      .subjects[0]!.topics;
    const teacher = (
      await karim.call<{
        students: { studentId: string; topics: Progress['subjects'][number]['topics'] }[];
      }>('GET', `/v1/groups/${KARIM_GROUP}/topic-scores`)
    ).body.students.find((s) => s.studentId === MARIAM)!.topics;
    const pick = (ts: typeof student) => ts.map((t) => [t.topicId, t.score, t.band]).sort();
    expect(pick(child)).toEqual(pick(student));
    expect(pick(teacher)).toEqual(pick(student));
    // The centre reads the same view too.
    const centre = (
      await owner.call<{ students: { studentId: string; topics: typeof student }[] }>(
        'GET',
        `/v1/groups/${KARIM_GROUP}/topic-scores`,
      )
    ).body.students.find((s) => s.studentId === MARIAM)!.topics;
    expect(pick(centre)).toEqual(pick(student));
  });

  it("no endpoint returns classmates' scores (student and parent routes)", async () => {
    const classmates = (
      await sql<{
        student_id: string;
      }>`SELECT DISTINCT student_id FROM market.enrolments WHERE group_id = ${KARIM_GROUP} AND student_id <> ${MARIAM}`.execute(
        api.db,
      )
    ).rows.map((r) => r.student_id);
    expect(classmates.length).toBeGreaterThan(10);
    const routes: [Client, string][] = [
      ...[
        '/v1/me/student',
        '/v1/me/schedule',
        '/v1/me/schedule-changes',
        '/v1/me/notifications',
        '/v1/me/missed',
        '/v1/me/homework',
        '/v1/me/student-notes',
        '/v1/me/topics',
        '/v1/me/focus-plans',
        '/v1/me/makeup-requests',
      ].map((p) => [mariam, p] as [Client, string]),
      ...[
        'missed',
        'homework',
        'student-notes',
        'topics',
        'focus-plans',
        'makeup-requests',
        'schedule-changes',
        'student-account',
      ].map((p) => [parent, `/v1/children/${MARIAM}/${p}`] as [Client, string]),
    ];
    for (const [c, path] of routes) {
      const r = await c.call('GET', path);
      expect(r.status, path).toBe(200);
      const text = JSON.stringify(r.body);
      for (const id of classmates) expect(text, `${path} names a classmate`).not.toContain(id);
      expect(text, path).not.toMatch(/"[^"]*(class|rank|average|percentile|peer)[^"]*":/i);
    }
  });
});

describe('Make-up requests (STU-MIS-01, INV-05)', () => {
  it("make-up seat cap: one seat in one session; a full session can't be accepted; no money tables touched", async () => {
    const before = await sql<{ e: number; p: number; l: number; t: number }>`
      SELECT (SELECT count(*) FROM market.enrolments)::int AS e, (SELECT count(*) FROM ledger.payments)::int AS p,
             (SELECT count(*) FROM ledger.ledger_entries)::int AS l, (SELECT count(*) FROM ledger.ledger_transactions)::int AS t`.execute(
      api.db,
    );
    const req = await mariam.call<{ items: { id: string; status: string }[] }>(
      'GET',
      '/v1/me/makeup-requests',
    );
    const id = req.body.items.find((x) => x.status === 'requested')!.id;
    // Ms Salma's Sun & Tue Sec 2 Maths group at the same centre: make its fullest coming session full.
    const g = demoId('grp-salma-st');
    const sess = await sql<{ id: string; committed: number }>`
      SELECT c.session_id AS id, c.committed FROM market.seats_committed(ARRAY(
        SELECT id FROM market.group_sessions WHERE group_id = ${g} AND starts_at > now() AND status = 'scheduled')) c
      ORDER BY c.committed DESC, c.session_id`.execute(api.db);
    const most = sess.rows[0]!;
    await api.db
      .updateTable('market.groups')
      .set({ seat_cap: most.committed })
      .where('id', '=', g)
      .execute();
    const full = await owner.call<{ code: string; detail: string }>(
      'POST',
      `/v1/makeup-requests/${id}/accept`,
      { makeupSessionId: most.id },
    );
    expect([full.status, full.body.code]).toEqual([409, 'session_full']);
    expect(full.body.detail).toMatch(/full/);
    // A session with a free seat: accepted; it now has one more committed seat (the make-up).
    const room = sess.rows.find((s) => s.committed < most.committed)!;
    const ok = await owner.call<{ status: string; makeupSessionId: string }>(
      'POST',
      `/v1/makeup-requests/${id}/accept`,
      { makeupSessionId: room.id, note: 'Sunday at 3' },
    );
    expect([ok.status, ok.body.status, ok.body.makeupSessionId]).toEqual([
      200,
      'accepted',
      room.id,
    ]);
    const after = await sql<{
      committed: number;
    }>`SELECT committed FROM market.seats_committed(ARRAY[${room.id}]::uuid[])`.execute(api.db);
    expect(after.rows[0]!.committed).toBe(room.committed + 1);
    // The database refuses a make-up into the full session too (INV-05), whatever the API does.
    const other = demoId('rls-makeup-direct');
    const missed = await api.db
      .selectFrom('market.makeup_requests')
      .select(['missed_session_id', 'group_id', 'guardian_id'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    const err = await api.db
      .insertInto('market.makeup_requests')
      .values({
        id: other,
        student_id: YOUSSEF,
        guardian_id: missed.guardian_id,
        group_id: missed.group_id,
        centre_id: NOUR,
        missed_session_id: missed.missed_session_id,
        requested_by_user_id: demoId('usr-parent'),
        requested_by: 'parent',
        status: 'accepted',
        decided_by: demoId('usr-owner'),
        decided_at: new Date(),
        makeup_session_id: most.id,
      })
      .execute()
      .catch((e: { constraint?: string }) => e.constraint);
    expect(err).toBe('seat_cap_exceeded');
    // No enrolment, no payment, no ledger entry.
    const now = await sql<{ e: number; p: number; l: number; t: number }>`
      SELECT (SELECT count(*) FROM market.enrolments)::int AS e, (SELECT count(*) FROM ledger.payments)::int AS p,
             (SELECT count(*) FROM ledger.ledger_entries)::int AS l, (SELECT count(*) FROM ledger.ledger_transactions)::int AS t`.execute(
      api.db,
    );
    expect(now.rows[0]).toEqual(before.rows[0]);
    // The student now sees the make-up session in the schedule; the family was told; it's audited.
    const sched = await mariam.call<{ items: { sessionId: string; makeup: boolean }[] }>(
      'GET',
      '/v1/me/schedule?to=' + new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10),
    );
    expect(sched.body.items.find((s) => s.sessionId === room.id)?.makeup).toBe(true);
    const audit = await api.db
      .selectFrom('audit.audit_events')
      .select('action')
      .where('object_ref', '=', id)
      .execute();
    expect(audit.map((a) => a.action)).toContain('makeup.accepted');
    expect(
      (await owner.call<{ code: string }>('POST', `/v1/makeup-requests/${id}/decline`, {})).body
        .code,
    ).toBe('makeup_decided');
  });

  it('STU-MIS-01: a student asks, the parent sees it, a teacher cannot decide', async () => {
    const missed = (
      await mariam.call<{ items: { sessionId: string; makeupRequestId: string | null }[] }>(
        'GET',
        '/v1/me/missed',
      )
    ).body.items[0]!;
    // Already asked for that session (the seeded request, now accepted): no second one.
    const dup = await mariam.call<{ code: string }>('POST', '/v1/makeup-requests', {
      missedSessionId: missed.sessionId,
    });
    expect([dup.status, dup.body.code]).toEqual([409, 'makeup_already_requested']);
    // A session she attended: she may ask (the centre decides); the parent is notified.
    const attended = await sql<{ id: string }>`
      SELECT sr.group_session_id AS id FROM records.session_records sr JOIN records.record_entries e ON e.session_record_id = sr.id
      WHERE sr.group_id = ${KARIM_GROUP} AND e.student_id = ${MARIAM} AND e.attendance = 'present' ORDER BY sr.session_date LIMIT 1`.execute(
      api.db,
    );
    const r = await mariam.call<{ id: string; requestedBy: string; parentSeenAt: string | null }>(
      'POST',
      '/v1/makeup-requests',
      { missedSessionId: attended.rows[0]!.id, note: 'please' },
    );
    expect([r.status, r.body.requestedBy, r.body.parentSeenAt]).toEqual([201, 'student', null]);
    const seen = await parent.call<{ parentSeenAt: string | null }>(
      'POST',
      `/v1/makeup-requests/${r.body.id}/seen`,
    );
    expect(seen.body.parentSeenAt).toBeTruthy();
    expect((await karim.call('POST', `/v1/makeup-requests/${r.body.id}/decline`, {})).status).toBe(
      404,
    );
    const withdrawn = await mariam.call<{ status: string }>(
      'POST',
      `/v1/makeup-requests/${r.body.id}/withdraw`,
    );
    expect(withdrawn.body.status).toBe('withdrawn');
  });
});

describe('Weekly focus checklist (STU-FOC-01, BR-DAT-03)', () => {
  it("STU-FOC-01: approved plans only, with the parent's focus_plans consent; ticks reach the teacher", async () => {
    const mine = await mariam.call<{
      items: { id: string; status: string; items: { id: string; tickedAt: string | null }[] }[];
    }>('GET', '/v1/me/focus-plans');
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0]!.status).toBe('approved');
    const item = mine.body.items[0]!.items[0]!;
    expect(
      (await mariam.call('PUT', `/v1/focus-plan-items/${item.id}/tick`, { ticked: true })).status,
    ).toBe(200);
    const teacher = await karim.call<{
      items: { items: { id: string; tickedAt: string | null }[] }[];
    }>('GET', `/v1/groups/${KARIM_GROUP}/focus-plans`);
    expect(
      teacher.body.items.flatMap((p) => p.items).find((i) => i.id === item.id)!.tickedAt,
    ).toBeTruthy();
    // The parent withdraws the focus_plans consent: the checklist is gone at once (never cached).
    await parent.call('PUT', '/v1/me/consents', {
      kind: 'focus_plans',
      granted: false,
      version: 'draft-2026-10',
      studentId: MARIAM,
    });
    expect(
      (await mariam.call<{ items: unknown[] }>('GET', '/v1/me/focus-plans')).body.items,
    ).toEqual([]);
    await parent.call('PUT', '/v1/me/consents', {
      kind: 'focus_plans',
      granted: true,
      version: 'draft-2026-10',
      studentId: MARIAM,
    });
    expect(
      (await mariam.call<{ items: unknown[] }>('GET', '/v1/me/focus-plans')).body.items,
    ).toHaveLength(1);
  });
});

describe('Retention and monthly snapshots (docs/10 §4, STU-TOP-01)', () => {
  it('codes go after 24 h, removed devices and notifications after 90 days; a month is snapshotted once', async () => {
    const { StudentJobs } = await import('../../src/students/jobs');
    const jobs = new StudentJobs(api.s.db);
    const day = 86_400_000;
    const acct = await api.db
      .selectFrom('identity.student_accounts')
      .select('user_id')
      .where('student_id', '=', YOUSSEF)
      .executeTakeFirstOrThrow();
    const made = new Date(Date.now() - 2 * day);
    await api.db
      .insertInto('identity.student_access_codes')
      .values({
        id: demoId('old-code'),
        student_id: YOUSSEF,
        created_by_user_id: demoId('usr-parent'),
        code_hmac: Buffer.alloc(32, 9),
        created_at: made,
        expires_at: new Date(made.getTime() + 300_000),
      })
      .execute();
    await api.db
      .insertInto('identity.student_devices')
      .values({
        id: demoId('old-device'),
        student_id: YOUSSEF,
        user_id: acct.user_id,
        secret_hash: Buffer.alloc(32, 8),
        platform: 'web',
        label: 'old',
        revoked_at: new Date(Date.now() - 91 * day),
        revoked_reason: 'removed_by_parent',
      })
      .execute();
    await api.db
      .insertInto('messaging.in_app_notifications')
      .values({
        id: demoId('old-note'),
        user_id: demoId('usr-parent'),
        kind: 'note_approved',
        object_type: 'student_note',
        object_id: demoId('x'),
        event_id: demoId('old-note'),
        created_at: new Date(Date.now() - 91 * day),
      })
      .execute();
    const r = await jobs.retention();
    expect(r.codes).toBeGreaterThanOrEqual(1);
    expect(r.devices).toBe(1);
    expect(r.notifications).toBe(1);
    for (const [t, id] of [
      ['identity.student_access_codes', 'old-code'],
      ['identity.student_devices', 'old-device'],
      ['messaging.in_app_notifications', 'old-note'],
    ] as const)
      expect(
        await api.db.selectFrom(t).select('id').where('id', '=', demoId(id)).executeTakeFirst(),
        t,
      ).toBeUndefined();
    // Live codes and devices stay.
    expect(
      (
        await signIn(
          {
            deviceId: demoId('dev-mariam-phone'),
            deviceSecret: 'sample-device-secret-mariam-phone-0001',
          },
          '2468',
        )
      ).status,
    ).toBe(200);
    const first = await jobs.snapshot();
    expect(first.rows).toBeGreaterThan(0);
    expect((await jobs.snapshot()).rows).toBe(0);
  });
});

describe('Consent versions (BR-DAT-03, OD-60)', () => {
  it('BR-DAT-03: the register lists every consent label in use, drafts marked not approved', async () => {
    const reg = await api.db
      .selectFrom('org.consent_versions')
      .select(['kind', 'version', 'approved'])
      .execute();
    const used = await api.db
      .selectFrom('org.consent_events')
      .select(['kind', 'version'])
      .distinct()
      .execute();
    for (const u of used.filter((x) => x.version.startsWith('draft')))
      expect(
        reg.some((r) => r.kind === u.kind && r.version === u.version),
        `${u.kind} ${u.version}`,
      ).toBe(true);
    expect(reg.find((r) => r.kind === 'student_account')).toMatchObject({
      version: 'draft-2026-10',
      approved: false,
    });
  });
});
