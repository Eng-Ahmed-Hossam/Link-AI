// pnpm dev — Link on this machine with the real backend (live mode). Sample data only.
//   1. local services (Postgres, Redis ×2, aws-local, sms-sink, mail-sink, fake-pay, whatsapp-fake)
//   2. migrations, and the demo world when the database is empty (`--reset` re-seeds it)
//   3. core-api: api :4000, worker, messaging-gateway :4002 (restart on change)
//   4. web :3000 and the teacher app :8081, both with API_MODE=live; the ops console :3001
//   5. ai-service :8090 (local Whisper + the extraction), if installed (pnpm ai:models done)
// Sign-in codes go to sms-sink: http://localhost:8093 . `pnpm demo` is still the mock-data demo.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT, fail, loadEnv, redact, run } from './lib/env.mjs';
import { busy, start, waitFor } from './lib/procs.mjs';

loadEnv();
if (process.env.APP_ENV !== 'local')
  fail(`pnpm dev runs with APP_ENV=local (got "${process.env.APP_ENV}").`);
const reset = process.argv.includes('--reset');
const API = `http://localhost:${process.env.CORE_API_PORT || 4000}`;
const SMS = `http://localhost:${process.env.SMS_SINK_HOST_PORT || 8093}`;

const taken = await busy([
  ['core-api', `${API}/health`],
  ['web', 'http://localhost:3000'],
  ['teacher app', 'http://localhost:8081'],
  ['ops console', 'http://localhost:3001'],
  ['mock server', 'http://localhost:4010/__demo/state'],
]);
if (taken.length)
  fail(
    `pnpm dev: already in use: ${taken.join(', ')}. Stop the other servers (or pnpm demo) first.`,
  );

run(process.execPath, [join(ROOT, 'scripts', 'dev-infra.mjs')]);
run(process.execPath, [join(ROOT, 'scripts', 'db.mjs'), 'migrate']);

// Seed only an empty database, so your local changes survive a restart.
const pg = createRequire(join(ROOT, 'apps', 'core-api', 'package.json'))('pg');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_MIGRATOR });
await client.connect();
const { rows } = await client.query('SELECT count(*)::int AS n FROM identity.users');
// docs/10 §5: the stored data names the keys that wrote it; say so when .env.local changed them.
const fp = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 12);
const current = {
  field: fp(Buffer.from(process.env.FIELD_KEY_LOCAL ?? '', 'base64').subarray(0, 32)),
  lookup: fp(process.env.HMAC_KEY_LOOKUP ?? ''),
};
const keys = await client.query('SELECT purpose, key_id FROM platform.data_keys');
await client.end();
const changed = keys.rows.filter((r) => current[r.purpose] !== r.key_id).map((r) => r.purpose);
if (changed.length && !reset)
  console.warn(
    [
      '',
      `WARNING: the data in Postgres was written with other keys (${changed.join(', ')}) than .env.local has.`,
      '  Phones cannot be read and sign-ins will not find their accounts. Run: pnpm dev --reset',
      '',
    ].join('\n'),
  );
if (reset || rows[0].n === 0)
  run(process.execPath, [join(ROOT, 'scripts', 'db.mjs'), 'seed', '--reset']);
else console.log(`Database has data (${rows[0].n} users); kept. pnpm dev --reset re-seeds it.`);

// Voice notes (R3): ai-service on 127.0.0.1 with a fresh token, when it is installed. Without it a
// voice note answers "Type the note instead" (503 stt_unavailable). Sample audio only: a note of
// class consented_real never leaves this machine (docs/10 §7). DEV_AI=0 skips it.
const aiDir = join(ROOT, 'apps', 'ai-service');
const aiReady =
  process.env.DEV_AI !== '0' &&
  existsSync(join(aiDir, '.venv')) &&
  existsSync(join(aiDir, '.models', 'large-v3-turbo', 'model.bin'));
const aiToken = randomBytes(24).toString('base64url');
if (aiReady)
  start(
    'ai',
    ['--directory', aiDir, 'run', 'python', '-m', 'ai_service'],
    { AI_SERVICE_TOKEN: aiToken, AI_SERVICE_HOST: '127.0.0.1', AI_PRELOAD: '0', PYTHONUTF8: '1' },
    'uv',
  );

start(
  'api',
  ['scripts/core-api.mjs', 'dev', 'all'],
  aiReady ? { AI_SERVICE_URL: 'http://127.0.0.1:8090', AI_SERVICE_TOKEN: aiToken } : {},
  'node',
);
await waitFor(`${API}/ready`);

start('web', ['--filter', '@link/web', 'dev'], {
  NEXT_PUBLIC_API_MODE: 'live',
  NEXT_PUBLIC_APP_ENV: 'local',
  // Local Demo controls: the story and the stand-in for Link ops (never in a production build).
  NEXT_PUBLIC_DEMO_CONTROLS: '1',
  CORE_API_URL: API,
});
// The ops console (S2): live only, same-origin /v1 through its own rewrite.
start('ops', ['--filter', '@link/ops', 'dev'], { CORE_API_URL: API });
start(
  'app',
  ['--filter', '@link/teacher-app', 'exec', 'expo', 'start', '--web', '--port', '8081'],
  {
    EXPO_PUBLIC_API_MODE: 'live',
    EXPO_PUBLIC_API_BASE_URL: API,
    EXPO_PUBLIC_APP_ENV: 'local',
    EXPO_PUBLIC_DEMO_CONTROLS: '',
    // The first cold bundle can exceed Node's default heap while Next compiles at the same time.
    NODE_OPTIONS: '--max-old-space-size=4096',
  },
);

const probe = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
console.log(`
Link — live mode on this machine (sample data only; ${redact(probe.stdout.trim() || 'no git')})
  Parent       http://localhost:3000/ar/welcome      +20 10 0000 0001 (Hassan)
  Owner        http://localhost:3000/ar/centre       +20 10 0000 0003 (Tamer, Al Nour)
  Reception    http://localhost:3000/ar/centre       +20 10 0000 0004 (Dina)
  Teacher app  http://localhost:8081                 +20 10 0000 0002 (Ms Salma)
  Ops console  http://localhost:3001/ar/sign-in      +20 10 0000 0051 (agent) · 0052 (finance)
  Codes        ${SMS}                 every SMS lands here; nothing is sent
  core-api     ${API}/ready · ${API}/v1/curricula
  WhatsApp     http://localhost:${process.env.WHATSAPP_FAKE_HOST_PORT || 8094}                 approved parent messages land here; nothing is sent
  Voice notes  ${aiReady ? 'ai-service on 127.0.0.1:8090 (local Whisper)' : 'off: pnpm ai:models installs local speech-to-text'}
  Ask Link     ${process.env.OLLAMA_URL ? `on (${process.env.OLLAMA_URL})` : 'off (set OLLAMA_URL to a local Ollama)'}
  What is real and what is not: docs/RUNNING.md
`);
