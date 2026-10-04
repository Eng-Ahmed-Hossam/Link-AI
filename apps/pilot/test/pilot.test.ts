// Pilot mode (docs/13 "Concierge pilot"): sign-in, the follow-up loop with hand-sent WhatsApp, and
// the start-up check. Test names carry the pilot item (A1–A8) and rule IDs.
import { describe, expect, it } from 'vitest';
import { addDays, cairoToday } from '@link/mocks/time';
import { handlers } from '@link/mocks';
import { pilotHandlers, pilotStartupProblems } from '@link/mocks/pilot';
import { demoWorld } from '@link/mocks/world';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundleProblems } from '../src/check';
import { openApp, seedPilot, tempDir, testWorld } from './helpers';

const G = 'grp-p-G1';
const sess = (daysAgo: number) => `${G}~${addDays(cairoToday(), -daysAgo)}`;

async function confirmWithAbsent(p: ReturnType<typeof openApp>, cookie: string, daysAgo: number) {
  const rec = await (
    await p.call('POST', `/v1/groups/${G}/session-records`, {
      cookie,
      body: { groupSessionId: sess(daysAgo) },
    })
  ).json();
  const save = await p.call('PATCH', `/v1/session-records/${rec.id}`, {
    cookie,
    body: {
      entries: rec.entries.map((e: { student: { id: string } }) => ({
        studentId: e.student.id,
        attendance: e.student.id === 'stu-p-S1' ? 'absent' : 'present',
      })),
    },
  });
  expect(save.status).toBe(200);
  const r = await p.call('POST', `/v1/session-records/${rec.id}/confirm`, {
    cookie,
    headers: { 'idempotency-key': `k-${daysAgo}` },
  });
  expect(r.status).toBe(200);
  return r.json();
}

describe('A1 start-up check', () => {
  it('passes for the pilot handlers and a pilot world', () => {
    expect(
      pilotStartupProblems({ mode: 'pilot', handlers: pilotHandlers, world: testWorld(), env: {} }),
    ).toEqual([]);
  });
  it('refuses demo routes, the demo world, demo users and demo settings', () => {
    const p = pilotStartupProblems({
      mode: 'pilot',
      handlers,
      world: demoWorld(),
      env: { DEMO_DEFAULT_FLAGS: 'phase2-only' },
    });
    expect(p.some((x) => x.includes('/__demo'))).toBe(true);
    expect(p.some((x) => x.includes('/v1/assistant'))).toBe(true);
    expect(p).toContain('The stored world is the demo scenario.');
    expect(p).toContain('Demo fixture or demo user present: usr-salma');
    expect(p).toContain('Demo setting present: DEMO_DEFAULT_FLAGS');
    expect(p.some((x) => x.includes('guardian phone'))).toBe(true);
  });
  it('refuses to start outside LINK_MODE=pilot', () => {
    expect(
      pilotStartupProblems({ mode: 'demo', handlers: pilotHandlers, world: testWorld(), env: {} }),
    ).toEqual(['LINK_MODE is "demo", not "pilot".']);
  });
  it('finds demo code in an app bundle', () => {
    const d = tempDir();
    mkdirSync(join(d, 'js'));
    writeFileSync(join(d, 'js', 'ok.js'), 'console.log(1)');
    writeFileSync(join(d, 'js', 'bad.js'), 'fetch("/__demo/state")');
    const p = bundleProblems([d]);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('bad.js');
  });
});

describe('A3 access', () => {
  it('signs in with a PIN into an httpOnly, SameSite=Strict cookie; mock tokens are refused', async () => {
    const dir = tempDir();
    const pins = seedPilot(dir);
    const p = openApp(dir);
    const r = await p.call('POST', '/v1/pilot/sessions', {
      body: { userId: 'usr-p003', pin: pins['usr-p003'] },
    });
    expect(r.status).toBe(200);
    const cookie = r.headers.get('set-cookie')!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(await r.text()).not.toContain(pins['usr-p003']);
    expect((await p.call('GET', '/v1/me', { cookie: cookie.split(';')[0] })).status).toBe(200);
    // `mock.<userId>` bearer tokens never work in the pilot.
    const mock = await p.call('GET', '/v1/cases', {
      headers: { authorization: 'Bearer mock.usr-p003' },
    });
    expect(mock.status).toBe(401);
    // The PIN is stored as a hash only.
    expect(JSON.stringify(p.store.snap!.auth)).not.toContain(pins['usr-p003']);
  });

  it('5 wrong PINs lock the person for 15 minutes; the right PIN does not work during the lock', async () => {
    const dir = tempDir();
    const pins = seedPilot(dir);
    const p = openApp(dir);
    const wrong = pins['usr-p002'] === '246810' ? '135790' : '246810';
    for (let i = 1; i <= 4; i++) {
      const r = await p.call('POST', '/v1/pilot/sessions', {
        body: { userId: 'usr-p002', pin: wrong },
      });
      expect(r.status).toBe(401);
      expect((await r.json()).attemptsLeft).toBe(5 - i);
    }
    const locked = await p.call('POST', '/v1/pilot/sessions', {
      body: { userId: 'usr-p002', pin: wrong },
    });
    expect(locked.status).toBe(423);
    const until = new Date((await locked.json()).lockedUntil).getTime();
    expect(until - Date.now()).toBeGreaterThan(14 * 60_000);
    const right = await p.call('POST', '/v1/pilot/sessions', {
      body: { userId: 'usr-p002', pin: pins['usr-p002'] },
    });
    expect(right.status).toBe(423);
    // After the lock, the right PIN works again.
    const later = p.app.auth.signIn('usr-p002', pins['usr-p002'], 'x', new Date(until + 1000));
    expect(later.ok).toBe(true);
  });

  it('rejects requests from an address that is not on the allow-list', async () => {
    const dir = tempDir();
    seedPilot(dir);
    const p = openApp(dir);
    const r = await p.call('GET', '/v1/pilot/people', {
      headers: { origin: 'https://evil.example' },
    });
    expect(r.status).toBe(403);
  });

  it('only the owner adds people and sets PINs; removing someone ends their sessions', async () => {
    const dir = tempDir();
    const pins = seedPilot(dir);
    const p = openApp(dir);
    const rec = await p.signIn('usr-p003', pins['usr-p003']);
    expect(
      (
        await p.call('POST', '/v1/pilot/users', {
          cookie: rec,
          body: { name: 'رنا', role: 'reception' },
        })
      ).status,
    ).toBe(403);
    const owner = await p.signIn('usr-p001', pins['usr-p001']);
    const add = await p.call('POST', '/v1/pilot/users', {
      cookie: owner,
      body: { name: 'رنا', role: 'reception' },
    });
    expect(add.status).toBe(201);
    const { user, pin } = await add.json();
    expect(pin).toMatch(/^\d{6}$/);
    const rana = await p.signIn(user.id, pin);
    expect((await p.call('GET', '/v1/me', { cookie: rana })).status).toBe(200);
    expect((await p.call('DELETE', `/v1/pilot/users/${user.id}`, { cookie: owner })).status).toBe(
      204,
    );
    expect((await p.call('GET', '/v1/me', { cookie: rana })).status).toBe(401);
  });
});

describe('A6 messages sent by hand (BR-APR-11)', () => {
  it('approved → "sent manually by <name>": a contact attempt, never Delivered or Read; the case stays open', async () => {
    const dir = tempDir();
    const pins = seedPilot(dir);
    const p = openApp(dir);
    const teacher = await p.signIn('usr-p002', pins['usr-p002']);
    await confirmWithAbsent(p, teacher, 1);
    const second = await confirmWithAbsent(p, teacher, 0);
    expect(second.signals).toHaveLength(1); // consecutive_absences for S1 (A7: defaults)
    const staff = await p.signIn('usr-p003', pins['usr-p003']);
    const cases = (await (await p.call('GET', '/v1/cases', { cookie: staff })).json()).data;
    expect(cases).toHaveLength(1);
    expect(cases[0].assignee.id).toBe('usr-p003'); // Reception by default, due the same day
    expect(cases[0].dueOn).toBe(cairoToday());

    const draft = await (
      await p.call('POST', '/v1/messages/drafts', { cookie: staff, body: { caseId: cases[0].id } })
    ).json();
    expect(draft.draft).toContain('مريم');
    expect(draft.draft).toContain('مركز تجريبي');
    expect(draft.groundedFacts).toHaveLength(2);
    expect(draft.blockedReason).toBeNull();
    // A teacher cannot approve (messages.approve), and the tick is still required.
    expect(
      (
        await p.call('POST', `/v1/messages/${draft.id}/approve`, {
          cookie: teacher,
          body: { checked: true },
        })
      ).status,
    ).toBe(403);
    expect(
      (await p.call('POST', `/v1/messages/${draft.id}/approve`, { cookie: staff, body: {} }))
        .status,
    ).toBe(422);
    const approved = await (
      await p.call('POST', `/v1/messages/${draft.id}/approve`, {
        cookie: staff,
        body: { checked: true },
      })
    ).json();
    expect(approved.status).toBe('approved');
    expect(approved.channel).toBeNull();

    const sent = await (
      await p.call('POST', `/v1/messages/${draft.id}/sent-manually`, { cookie: staff })
    ).json();
    expect(sent.status).toBe('approved');
    expect(sent.sentManually.by.displayName).toBe('منى');
    expect(sent.history.map((h: { status: string }) => h.status)).toEqual(['draft', 'approved']);
    expect(JSON.stringify(sent.history)).not.toMatch(/delivered|read|sent"/);
    expect(
      (await p.call('POST', `/v1/messages/${draft.id}/sent-manually`, { cookie: staff })).status,
    ).toBe(409);

    const c = await (await p.call('GET', `/v1/cases/${cases[0].id}`, { cookie: staff })).json();
    expect(c.status).toBe('in_progress');
    expect(c.attempts).toMatchObject([{ channel: 'whatsapp_manual', result: 'message_sent' }]);
    // "Log the guardian's reply" is an outcome note; the case waits for confirmation, not closed.
    const out = await (
      await p.call('POST', `/v1/cases/${cases[0].id}/attempts`, {
        cookie: staff,
        body: { channel: 'whatsapp_manual', result: 'replied', learned: 'عندها درس تاني الأربع' },
      })
    ).json();
    expect(out.status).toBe('awaiting_confirmation');
  });

  it('A1: no demo route answers in the pilot (no provider events, no new day, no Ask Link)', async () => {
    const dir = tempDir();
    const pins = seedPilot(dir);
    const p = openApp(dir);
    const staff = await p.signIn('usr-p003', pins['usr-p003']);
    for (const [m, path] of [
      ['GET', '/__demo/state'],
      ['POST', '/__demo/provider'],
      ['POST', '/__demo/new-day'],
      ['GET', '/v1/assistant/briefing'],
      ['POST', '/v1/auth/otp/request'],
    ] as const)
      expect(
        (await p.call(m, path, { cookie: staff, body: m === 'POST' ? {} : undefined })).status,
      ).toBe(404);
  });
});

describe('CF-34 corrections stay with the teacher', () => {
  it('the owner asks; the teacher sees it on Today; a correction closes it', async () => {
    const dir = tempDir();
    const pins = seedPilot(dir);
    const p = openApp(dir);
    const teacher = await p.signIn('usr-p002', pins['usr-p002']);
    const rec = await confirmWithAbsent(p, teacher, 0);
    const owner = await p.signIn('usr-p001', pins['usr-p001']);
    const staff = await p.signIn('usr-p003', pins['usr-p003']);
    const body = { studentId: 'stu-p-S1', text: 'مريم كانت حاضرة، اتأخرت بس' };
    expect(
      (
        await p.call('POST', `/v1/session-records/${rec.id}/correction-requests`, {
          cookie: staff,
          body,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await p.call('POST', `/v1/session-records/${rec.id}/correction-requests`, {
          cookie: owner,
          body,
        })
      ).status,
    ).toBe(201);
    const today = await (await p.call('GET', '/v1/teachers/me/today', { cookie: teacher })).json();
    expect(today.correctionRequests).toHaveLength(1);
    const entry = rec.entries.find((e: { student: { id: string } }) => e.student.id === 'stu-p-S1');
    const fix = await p.call('POST', `/v1/record-entries/${entry.id}/corrections`, {
      cookie: teacher,
      body: { field: 'attendance', newValue: 'late', reason: 'Late, not absent' },
    });
    expect(fix.status).toBe(201);
    const after = await (await p.call('GET', '/v1/teachers/me/today', { cookie: teacher })).json();
    expect(after.correctionRequests).toHaveLength(0);
  });
});
