// pnpm voice:try [file.wav] — one SAMPLE voice note end to end in live mode, timed.
// Needs `pnpm dev` running with ai-service (installed by `pnpm ai:models`). It signs in as Ms Salma
// (the code comes from sms-sink), opens the record Today asks for, uploads the sample audio through
// the signed URL (S3 on aws-local), and waits for the draft extraction. It prints the time from
// upload to draft and the models ai-service ran. The default audio is a synthetic bench clip
// (apps/ai-service/bench/audio/b01.wav): sample data only, never a real recording.
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail, loadEnv } from './lib/env.mjs';

loadEnv();
if (process.env.APP_ENV !== 'local') fail('pnpm voice:try runs with APP_ENV=local only.');
const API = `http://localhost:${process.env.CORE_API_PORT || 4000}`;
const SMS = `http://localhost:${process.env.SMS_SINK_HOST_PORT || 8093}`;
const AI = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8090';
const PHONE = '+201000000002'; // Ms Salma (sample)
const file = process.argv[2] ?? join(ROOT, 'apps', 'ai-service', 'bench', 'audio', 'b01.wav');

let token = '';
async function call(method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'accept-language': 'en',
      'x-client': 'app',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(method === 'GET' ? {} : { 'idempotency-key': randomUUID() }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
const must = (r, what) => {
  if (r.status >= 300) fail(`${what}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};

const ai = await fetch(`${AI}/ready`)
  .then((r) => r.json())
  .catch(() => null);
if (!ai) fail(`ai-service is not answering at ${AI}. Run pnpm ai:models, then pnpm dev.`);

// Sign in (the code from sms-sink).
const since = Date.now();
must(await call('POST', '/v1/auth/otp/request', { phone: PHONE }), 'otp/request');
let code = null;
for (let i = 0; i < 30 && !code; i++) {
  const { items } = await fetch(`${SMS}/api/messages`).then((r) => r.json());
  const m = items.find((x) => x.to === PHONE && Date.parse(x.receivedAt) >= since - 1000);
  code = m?.body.match(/\d{6}/)?.[0] ?? null;
  if (!code) await new Promise((r) => setTimeout(r, 300));
}
if (!code) fail('No sign-in code in sms-sink.');
token = must(
  await call('POST', '/v1/auth/otp/verify', { phone: PHONE, code }),
  'otp/verify',
).accessToken;

// The record Today asks for (or the latest session of the first follow-up group).
const today = must(await call('GET', '/v1/teachers/me/today'), 'today');
const due = today.recordDue ?? today.needsYou?.[0];
if (!due) fail('No record to fill: Demo controls → "Simulate first session done", or Reset story.');
const record = must(
  await call('POST', `/v1/groups/${due.groupId}/session-records`, {
    groupSessionId: due.sessionId,
  }),
  'open record',
);

const audio = readFileSync(file);
const durationS = Math.max(1, Math.round((statSync(file).size - 44) / 32000)); // 16 kHz mono PCM
const t0 = Date.now();
const note = must(
  await call('POST', '/v1/voice-notes', { sessionRecordId: record.id, durationS }),
  'voice note',
);
const put = await fetch(`${API}${note.uploadUrl}`, {
  method: 'PUT',
  headers: { 'content-type': 'audio/wav' },
  body: audio,
});
if (!put.ok) fail(`upload: ${put.status} ${await put.text()}`);
must(await call('POST', `/v1/voice-notes/${note.id}/uploaded`), 'uploaded');
const t1 = Date.now();

let x = null;
for (let i = 0; i < 360; i++) {
  const r = await call('GET', `/v1/voice-notes/${note.id}/extraction`);
  if (r.status === 200) {
    x = r.body;
    break;
  }
  if (r.status !== 202) fail(`extraction: ${r.status} ${JSON.stringify(r.body)}`);
  await new Promise((res) => setTimeout(res, 500));
}
if (!x) fail('No draft after 3 minutes (stt_timeout).');
const t2 = Date.now();
const ready = await fetch(`${AI}/ready`).then((r) => r.json());

const items = x.items ?? [];
console.log(`
Voice note (sample audio: ${file.replace(ROOT + '/', '')}, ${durationS} s)
  upload (create + signed PUT + uploaded)   ${((t1 - t0) / 1000).toFixed(1)} s
  uploaded → draft extraction              ${((t2 - t1) / 1000).toFixed(1)} s
  total                                    ${((t2 - t0) / 1000).toFixed(1)} s
  speech-to-text                           ${ready.stt?.version}
  language model                           ${ready.llm?.version ?? 'none (rules only)'}
  model version                            ${ready.modelVersion}
  transcript                               ${x.transcript ?? '(not shown)'}
  items                                    ${items.length} (${items.filter((i) => i.identity === 'matched').length} matched to the roster)
The draft is in the teacher app (Follow-up → the record) for Ms Salma to check and confirm.`);
