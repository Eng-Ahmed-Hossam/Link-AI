// Part B in the pilot: voice notes only with signed consent; audio encrypted on the laptop and sent
// to the local ai-service as consented_real; the proposal comes back through the internal route;
// 3-minute timeout and retry; retention (30 days or the pilot's end) with a fake clock.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, cairoToday } from '@link/mocks/time';
import { AudioVault, deleteAfter, purgeAudio, type AudioEntry } from '../src/audio';
import { openApp, seedPilot, tempDir } from './helpers';

const VOICE_ENV = {
  PILOT_VOICE: '1',
  AI_SERVICE_TOKEN: 'internal-t',
  AI_SERVICE_URL: 'http://127.0.0.1:18090',
};
const G = 'grp-p-G1';
afterEach(() => vi.unstubAllGlobals());

/** Capture what the pilot sends to ai-service instead of calling it. */
function fakeAi() {
  const jobs: { meta: Record<string, unknown>; audio: Blob }[] = [];
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    if (String(url).startsWith('http://127.0.0.1:18090/v1/jobs')) {
      const form = init!.body as FormData;
      jobs.push({ meta: JSON.parse(String(form.get('meta'))), audio: form.get('audio') as Blob });
      return new Response(JSON.stringify({ jobId: 'x', etaSeconds: 42 }), { status: 202 });
    }
    return real(url, init);
  });
  return jobs;
}

async function recordAndUpload(p: ReturnType<typeof openApp>, cookie: string) {
  const rec = await (
    await p.call('POST', `/v1/groups/${G}/session-records`, {
      cookie,
      body: { groupSessionId: `${G}~${cairoToday()}` },
    })
  ).json();
  const vn = await p.call('POST', '/v1/voice-notes', {
    cookie,
    body: { sessionRecordId: rec.id, durationS: 20 },
    headers: { 'idempotency-key': `vn-${Math.random()}` },
  });
  return { rec, vn };
}

async function owner(p: ReturnType<typeof openApp>, pins: Record<string, string>) {
  return p.signIn('usr-p001', pins['usr-p001']!);
}

/** 4.2: the owner records the teacher's signed consent, then switches voice on for them. */
async function enableVoice(p: ReturnType<typeof openApp>, ownerCookie: string, id = 'usr-p002') {
  const c = await p.call('POST', `/v1/pilot/users/${id}/voice-consent`, {
    cookie: ownerCookie,
    body: { granted: true },
  });
  const v = await p.call('POST', `/v1/pilot/users/${id}/voice`, {
    cookie: ownerCookie,
    body: { on: true },
  });
  return [c.status, v.status];
}

async function uploadNote(p: ReturnType<typeof openApp>, teacher: string, bytes: number[]) {
  const note = await (await recordAndUpload(p, teacher)).vn.json();
  await p.app.api(
    new Request(`http://127.0.0.1:18443${note.uploadUrl}`, {
      method: 'PUT',
      headers: { cookie: teacher, 'content-type': 'audio/webm' },
      body: new Uint8Array(bytes),
    }),
  );
  await p.call('POST', `/v1/voice-notes/${note.id}/uploaded`, { cookie: teacher });
  return note as { id: string; uploadUrl: string };
}

describe('B3 voice notes in the pilot', () => {
  it('no signed consent → no voice note ("Type the note instead"); /v1/me says so', async () => {
    const dir = tempDir();
    const pins = seedPilot(dir);
    const p = openApp(dir, VOICE_ENV);
    const teacher = await p.signIn('usr-p002', pins['usr-p002']);
    expect((await (await p.call('GET', '/v1/me', { cookie: teacher })).json()).voiceNotes).toBe(
      false,
    );
    const { vn } = await recordAndUpload(p, teacher);
    expect(vn.status).toBe(503);
    expect((await vn.json()).code).toBe('stt_unavailable');
  });

  it('with consent: audio is encrypted on disk, sent as consented_real, the proposal comes back', async () => {
    const jobs = fakeAi();
    const dir = tempDir();
    const pins = seedPilot(dir);
    const p = openApp(dir, VOICE_ENV);
    const o = await owner(p, pins);
    expect(await enableVoice(p, o)).toEqual([200, 200]);
    const teacher = await p.signIn('usr-p002', pins['usr-p002']);
    expect((await (await p.call('GET', '/v1/me', { cookie: teacher })).json()).voiceNotes).toBe(
      true,
    );
    const { vn } = await recordAndUpload(p, teacher);
    const note = await vn.json();
    expect(note.uploadUrl).toBe(`/v1/voice-notes/${note.id}/audio`);
    const audio = new TextEncoder().encode('RIFF-fake-audio-مريم');
    const put = await p.app.api(
      new Request(`http://127.0.0.1:18443${note.uploadUrl}`, {
        method: 'PUT',
        headers: { cookie: teacher, 'content-type': 'audio/webm' },
        body: audio,
      }),
    );
    expect(put.status).toBe(200);
    // Encrypted at rest: the file is not the audio.
    const file = join(dir, 'audio', `${note.id}.bin`);
    expect(readFileSync(file).includes(Buffer.from(audio))).toBe(false);
    expect(
      (await p.call('POST', `/v1/voice-notes/${note.id}/uploaded`, { cookie: teacher })).status,
    ).toBe(200);
    await vi.waitFor(() => expect(jobs).toHaveLength(1));
    expect(jobs[0]!.meta.dataClass).toBe('consented_real');
    expect(jobs[0]!.meta.callbackUrl).toBe(
      `http://127.0.0.1:18443/v1/internal/voice-results/${note.id}`,
    );
    expect(new Uint8Array(await jobs[0]!.audio.arrayBuffer())).toEqual(audio);
    // While processing: 202 with the estimate from ai-service.
    const waiting = await p.call('GET', `/v1/voice-notes/${note.id}/extraction`, {
      cookie: teacher,
    });
    expect(waiting.status).toBe(202);
    expect((await waiting.json()).etaSeconds).toBeGreaterThan(30);
    // The callback needs the internal token; an item on a student of another group is dropped.
    const result = {
      status: 'ready',
      result: {
        transcript: 'مريم غابت النهارده',
        modelVersion: 'faster-whisper:large-v3-turbo|link_nlp@stub|ollama:qwen3:8b+extract-v1',
        items: [
          {
            id: 'vi-1',
            identity: 'matched',
            studentId: 'stu-p-S1',
            candidates: [],
            mention: 'مريم',
            field: 'attendance',
            value: 'absent',
            confidence: 0.92,
            span: { start: 0, end: 9 },
            sourceText: 'مريم غابت',
            outOfRange: false,
          },
          {
            id: 'vi-2',
            identity: 'matched',
            studentId: 'stu-other-group',
            candidates: [],
            mention: 'x',
            field: 'attendance',
            value: 'absent',
            confidence: 0.92,
            span: { start: 0, end: 1 },
            sourceText: 'x',
            outOfRange: false,
          },
        ],
      },
    };
    const cb = (token: string) =>
      p.app.api(
        new Request(`http://127.0.0.1:18443/v1/internal/voice-results/${note.id}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-link-internal-token': token },
          body: JSON.stringify(result),
        }),
      );
    expect((await cb('wrong')).status).toBe(404);
    expect((await cb('internal-t')).status).toBe(204);
    const x = await (
      await p.call('GET', `/v1/voice-notes/${note.id}/extraction`, { cookie: teacher })
    ).json();
    expect(x.transcript).toBe('مريم غابت النهارده');
    expect(x.items).toHaveLength(1);
    expect(x.items[0].student.displayName).toBe('مريم');
    expect(x.status).toBe('proposed');
  });

  it('a note with no answer after 3 minutes says so; "Try again" sends the kept audio again', async () => {
    const jobs = fakeAi();
    const dir = tempDir();
    const pins = seedPilot(dir);
    const p = openApp(dir, VOICE_ENV);
    await enableVoice(p, await owner(p, pins));
    const teacher = await p.signIn('usr-p002', pins['usr-p002']);
    const note = await (await recordAndUpload(p, teacher)).vn.json();
    await p.app.api(
      new Request(`http://127.0.0.1:18443${note.uploadUrl}`, {
        method: 'PUT',
        headers: { cookie: teacher, 'content-type': 'audio/webm' },
        body: new Uint8Array([1, 2, 3]),
      }),
    );
    await p.call('POST', `/v1/voice-notes/${note.id}/uploaded`, { cookie: teacher });
    await vi.waitFor(() => expect(jobs).toHaveLength(1));
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 181_000);
    const late = await p.call('GET', `/v1/voice-notes/${note.id}/extraction`, { cookie: teacher });
    expect(late.status).toBe(503);
    expect((await late.json()).code).toBe('stt_timeout');
    vi.restoreAllMocks();
    expect(
      (await p.call('POST', `/v1/voice-notes/${note.id}/retry`, { cookie: teacher })).status,
    ).toBe(200);
    await vi.waitFor(() => expect(jobs).toHaveLength(2));
    expect(new Uint8Array(await jobs[1]!.audio.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("withdrawing consent deletes the teacher's recordings and their transcripts", async () => {
    fakeAi();
    const dir = tempDir();
    const pins = seedPilot(dir);
    const p = openApp(dir, VOICE_ENV);
    const o = await owner(p, pins);
    await enableVoice(p, o);
    const teacher = await p.signIn('usr-p002', pins['usr-p002']);
    const note = await (await recordAndUpload(p, teacher)).vn.json();
    await p.app.api(
      new Request(`http://127.0.0.1:18443${note.uploadUrl}`, {
        method: 'PUT',
        headers: { cookie: teacher, 'content-type': 'audio/webm' },
        body: new Uint8Array([9]),
      }),
    );
    const file = join(dir, 'audio', `${note.id}.bin`);
    expect(existsSync(file)).toBe(true);
    await p.call('POST', '/v1/pilot/users/usr-p002/voice-consent', {
      cookie: o,
      body: { granted: false },
    });
    expect(existsSync(file)).toBe(false);
    expect(p.store.snap!.voice!.audio[note.id]!.deletedAt).not.toBeNull();
    // Withdrawal also switches voice off for that teacher (re-consent does not switch it back on).
    expect(p.store.snap!.voice!.enabled!['usr-p002']!.on).toBe(false);
    // Reception cannot record consent; only the owner.
    const r = await p.signIn('usr-p003', pins['usr-p003']);
    expect(
      (
        await p.call('POST', '/v1/pilot/users/usr-p002/voice-consent', {
          cookie: r,
          body: { granted: true },
        })
      ).status,
    ).toBe(403);
  });
});

describe('4.2 voice per teacher, never by default, and the kill switch', () => {
  it('consent alone does not switch voice on; on needs consent; the list shows the consent date', async () => {
    const dir = tempDir();
    const pins = seedPilot(dir);
    const p = openApp(dir, VOICE_ENV);
    const o = await owner(p, pins);
    const teacher = await p.signIn('usr-p002', pins['usr-p002']);
    const me = async () =>
      (await (await p.call('GET', '/v1/me', { cookie: teacher })).json()).voiceNotes;
    const row = async () =>
      (await (await p.call('GET', '/v1/pilot/users', { cookie: o })).json()).find(
        (u: { id: string }) => u.id === 'usr-p002',
      );
    // Switching on before consent is refused.
    const early = await p.call('POST', '/v1/pilot/users/usr-p002/voice', {
      cookie: o,
      body: { on: true },
    });
    expect(early.status).toBe(409);
    expect((await early.json()).code).toBe('consent_required');
    await p.call('POST', '/v1/pilot/users/usr-p002/voice-consent', {
      cookie: o,
      body: { granted: true },
    });
    expect(await me()).toBe(false); // off by default, even with consent
    expect((await row()).voiceConsent).toBe(true);
    expect(typeof (await row()).voiceConsentAt).toBe('string');
    expect((await row()).voiceOn).toBe(false);
    await p.call('POST', '/v1/pilot/users/usr-p002/voice', { cookie: o, body: { on: true } });
    expect(await me()).toBe(true);
    expect((await row()).voiceOn).toBe(true);
    // Reception sees the status but cannot switch anything; a teacher sees neither.
    const r = await p.signIn('usr-p003', pins['usr-p003']);
    expect((await p.call('GET', '/v1/pilot/voice', { cookie: r })).status).toBe(200);
    const sw = await p.call('POST', '/v1/pilot/users/usr-p002/voice', {
      cookie: r,
      body: { on: false },
    });
    expect(sw.status).toBe(403);
    const ks = await p.call('POST', '/v1/pilot/voice', { cookie: r, body: { paused: true } });
    expect(ks.status).toBe(403);
    expect((await p.call('GET', '/v1/pilot/voice', { cookie: teacher })).status).toBe(403);
  });

  it('kill switch: off for everyone, waiting notes deleted and never processed; back on for new notes only', async () => {
    const jobs = fakeAi();
    const dir = tempDir();
    const pins = seedPilot(dir);
    const p = openApp(dir, VOICE_ENV);
    const o = await owner(p, pins);
    await enableVoice(p, o);
    const teacher = await p.signIn('usr-p002', pins['usr-p002']);
    const note = await uploadNote(p, teacher, [4, 5, 6]);
    await vi.waitFor(() => expect(jobs).toHaveLength(1)); // handed to ai-service, no answer yet
    const file = join(dir, 'audio', `${note.id}.bin`);
    expect(existsSync(file)).toBe(true);

    const off = await p.call('POST', '/v1/pilot/voice', { cookie: o, body: { paused: true } });
    expect(await off.json()).toEqual({ paused: true, stopped: 1 });
    expect(existsSync(file)).toBe(false); // deleted now (earlier than the 30 days), never processed
    const me = async () =>
      (await (await p.call('GET', '/v1/me', { cookie: teacher })).json()).voiceNotes;
    expect(await me()).toBe(false);
    const waiting = await p.call('GET', `/v1/voice-notes/${note.id}/extraction`, {
      cookie: teacher,
    });
    expect(waiting.status).toBe(503);
    const problem = await waiting.json();
    expect(problem.code).toBe('stt_unavailable'); // the app says "Type the note instead"
    expect(problem.reason).toBe('voice_paused');
    // A late answer from ai-service for that note is refused: it is never processed.
    const late = await p.app.api(
      new Request(`http://127.0.0.1:18443/v1/internal/voice-results/${note.id}`, {
        method: 'POST',
        headers: { 'x-link-internal-token': 'internal-t', 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'ready',
          result: { transcript: 'مريم غابت', modelVersion: 't', items: [] },
        }),
      }),
      '127.0.0.1',
    );
    expect(late.status).toBe(409);
    // No new note and no retry while voice is off.
    expect((await recordAndUpload(p, teacher)).vn.status).toBe(503);
    const retry = await p.call('POST', `/v1/voice-notes/${note.id}/retry`, { cookie: teacher });
    expect(retry.status).toBe(503);
    const status = await (await p.call('GET', '/v1/pilot/voice', { cookie: o })).json();
    expect(status.paused).toBe(true);
    expect(typeof status.pausedAt).toBe('string');

    // Back on: new notes work again; the deleted note stays deleted and unprocessed.
    await p.call('POST', '/v1/pilot/voice', { cookie: o, body: { paused: false } });
    expect(await me()).toBe(true);
    expect(existsSync(file)).toBe(false);
    const again = await p.call('GET', `/v1/voice-notes/${note.id}/extraction`, {
      cookie: teacher,
    });
    expect(again.status).toBe(503);
  });
});

describe('B3 retention (fake clock)', () => {
  const entry = (uploadedAt: string, file: string): AudioEntry => ({
    file,
    mime: 'audio/webm',
    bytes: 3,
    uploadedAt,
    teacherId: 't',
    deletedAt: null,
  });

  it('deletes audio 30 days after upload, or at the end of the pilot day if sooner', () => {
    const dir = tempDir();
    const vault = new AudioVault(dir);
    const a = vault.put('vn-a', new Uint8Array([1]));
    const b = vault.put('vn-b', new Uint8Array([2]));
    const entries = {
      'vn-a': entry('2026-10-01T10:00:00Z', a),
      'vn-b': entry('2026-10-20T10:00:00Z', b),
    };
    // 29 days later: nothing goes. 30 days later: vn-a goes.
    expect(purgeAudio(entries, vault, null, new Date('2026-10-30T09:59:00Z'))).toEqual([]);
    expect(purgeAudio(entries, vault, null, new Date('2026-10-31T10:00:00Z'))).toEqual(['vn-a']);
    expect(existsSync(join(dir, 'audio', a))).toBe(false);
    expect(existsSync(join(dir, 'audio', b))).toBe(true);
    // The pilot ends on 25 October: vn-b goes at the end of that (Cairo) day.
    expect(deleteAfter('2026-10-20T10:00:00Z', '2026-10-25').toISOString()).toBe(
      '2026-10-25T21:59:59.000Z',
    );
    expect(purgeAudio(entries, vault, '2026-10-25', new Date('2026-10-25T21:00:00Z'))).toEqual([]);
    expect(purgeAudio(entries, vault, '2026-10-25', new Date('2026-10-25T22:00:00Z'))).toEqual([
      'vn-b',
    ]);
  });

  it('the vault encrypts with a key on the laptop and refuses a tampered file', () => {
    const dir = tempDir();
    const vault = new AudioVault(dir);
    const f = vault.put('vn-1', new Uint8Array([1, 2, 3, 4]));
    expect(vault.get('vn-1', f)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(() => vault.get('vn-2', f)).toThrow(); // bound to its voice id
    const raw = readFileSync(join(dir, 'audio', f));
    raw[raw.length - 1]! ^= 0xff;
    writeFileSync(join(dir, 'audio', f), raw);
    expect(() => vault.get('vn-1', f)).toThrow();
    expect(addDays('2026-10-01', 30)).toBe('2026-10-31');
  });
});
