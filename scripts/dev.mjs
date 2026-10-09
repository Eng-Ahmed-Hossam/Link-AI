// pnpm dev — Link on this machine with the real backend (live mode). Sample data only.
//   1. local services (Postgres, Redis ×2, aws-local, sms-sink, mail-sink, fake-pay)
//   2. migrations, and the demo world when the database is empty (`--reset` re-seeds it)
//   3. core-api: api :4000, worker, messaging-gateway :4002 (restart on change)
//   4. web :3000 and the teacher app :8081, both with API_MODE=live
// Sign-in codes go to sms-sink: http://localhost:8093 . `pnpm demo` is still the mock-data demo.
import { spawnSync } from 'node:child_process';
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
await client.end();
if (reset || rows[0].n === 0) run(process.execPath, [join(ROOT, 'scripts', 'db.mjs'), 'seed']);
else console.log(`Database has data (${rows[0].n} users); kept. pnpm dev --reset re-seeds it.`);

start('api', ['scripts/core-api.mjs', 'dev', 'all'], {}, 'node');
await waitFor(`${API}/ready`);

start('web', ['--filter', '@link/web', 'dev'], {
  NEXT_PUBLIC_API_MODE: 'live',
  NEXT_PUBLIC_APP_ENV: 'local',
  NEXT_PUBLIC_DEMO_CONTROLS: '',
  CORE_API_URL: API,
});
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
  Codes        ${SMS}                 every SMS lands here; nothing is sent
  core-api     ${API}/ready · ${API}/v1/curricula
  Still on mock in live mode: see docs/RUNNING.md (R1 serves sign-in and accounts only).
`);
