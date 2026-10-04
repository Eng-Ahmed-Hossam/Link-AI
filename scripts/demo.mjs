// pnpm demo — the cross-app demo on ONE shared mock state (docs/frontend/demo-script.md):
//   mock server  http://localhost:4010  (scenario demo-followup, Phase 2 flag on)
//   web          http://localhost:3000  (parent PWA + owner web, API mode mock-server, Demo controls)
//   teacher app  http://localhost:8081  (Expo web, API mode mock-server, Demo controls)
// Local only: APP_ENV=local is forced; no real provider is called. Ctrl+C stops everything.
import { spawn, spawnSync } from 'node:child_process';
import { ROOT } from './lib/env.mjs';

const MOCK = 'http://localhost:4010';
const common = { ...process.env, APP_ENV: 'local', FORCE_COLOR: '1' };
const procs = [];
const restarts = {};
let stopping = false;

function start(name, args, env) {
  const p = spawn('pnpm', args, { cwd: ROOT, env: { ...common, ...env }, shell: true });
  const tag = `[${name}]`.padEnd(8);
  const out = (stream) => (d) =>
    String(d)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((l) => stream.write(`${tag}${l}\n`));
  p.stdout.on('data', out(process.stdout));
  p.stderr.on('data', out(process.stderr));
  p.on('exit', (code) => {
    if (stopping) return;
    // A dev server can crash on its own (e.g. a Turbopack cache panic): restart it, keep the rest up.
    restarts[name] = (restarts[name] ?? 0) + 1;
    if (restarts[name] <= 3) {
      console.log(`${tag}exited (${code ?? 'signal'}); restarting (${restarts[name]}/3)…`);
      start(name, args, env);
    } else {
      console.log(`${tag}exited (${code ?? 'signal'}) too often; stopping the demo.`);
      stopAll(1);
    }
  });
  procs.push(p);
}

function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) {
    if (p.exitCode !== null) continue;
    // Windows: kill the whole tree (pnpm → node → next/expo).
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F']);
    else p.kill('SIGTERM');
  }
  process.exit(code);
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

async function waitFor(url, ms = 60_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

// Fail fast if another dev server (or an earlier demo) still holds a port.
const busy = [];
for (const [name, url] of [
  ['mock server', `${MOCK}/__demo/state`],
  ['web', 'http://localhost:3000'],
  ['teacher app', 'http://localhost:8081'],
]) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1500) });
    busy.push(`${name} (${new URL(url).port})`);
  } catch {
    /* free */
  }
}
if (busy.length) {
  console.error(
    `pnpm demo: already in use: ${busy.join(', ')}. Stop the other dev servers (or an earlier demo) first.`,
  );
  process.exit(1);
}

// First run: the MVP pilot setup (Phase 2 only, CF-29). After that the presenter's switches are
// kept in packages/mocks/.data/demo-flags.json, so a restart never loses them.
start('mock', ['--filter', '@link/mocks', 'mock:server'], { DEMO_DEFAULT_FLAGS: 'phase2-only' });
await waitFor(`${MOCK}/__demo/state`);
await fetch(`${MOCK}/__demo/reset`, { method: 'POST', body: '{}' });

const apiEnv = (prefix) => ({
  [`${prefix}_API_MODE`]: 'mock-server',
  [`${prefix}_API_BASE_URL`]: MOCK,
  [`${prefix}_APP_ENV`]: 'local',
  [`${prefix}_DEMO_CONTROLS`]: '1',
});
start('web', ['--filter', '@link/web', 'dev'], apiEnv('NEXT_PUBLIC'));
// --web serves the teacher app in the browser on 8081. (No CI=1: it would turn off file watching;
// Expo does not prompt anyway because stdin is not a terminal.)
start(
  'app',
  ['--filter', '@link/teacher-app', 'exec', 'expo', 'start', '--web', '--port', '8081'],
  apiEnv('EXPO_PUBLIC'),
);

console.log(`
Link demo (sample data only)
  Teacher app  http://localhost:8081   sign in as the sample teacher (Ms Salma)
  Owner web    http://localhost:3000/ar/centre/today   (Batch 6)
  Parent PWA   http://localhost:3000/ar/children       sign in: +20 10 0000 0001, code 123456
  Mock server  ${MOCK}/__demo/state
`);
