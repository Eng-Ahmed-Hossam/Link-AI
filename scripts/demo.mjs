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

function start(name, args, env) {
  const p = spawn('pnpm', args, { cwd: ROOT, env: { ...common, ...env }, shell: true });
  const tag = `[${name}]`.padEnd(8);
  const out = (s) => (d) =>
    String(d)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((l) => s.write(`${tag}${l}\n`));
  p.stdout.on('data', out(process.stdout));
  p.stderr.on('data', out(process.stderr));
  p.on('exit', (code) => {
    console.log(`${tag}exited (${code ?? 'signal'})`);
    stopAll(code ?? 0);
  });
  procs.push(p);
}

let stopping = false;
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

start('mock', ['--filter', '@link/mocks', 'mock:server'], {});
await waitFor(`${MOCK}/__demo/state`);
await fetch(`${MOCK}/__demo/reset`, { method: 'POST', body: '{}' });
await fetch(`${MOCK}/__demo/settings`, { method: 'POST', body: JSON.stringify({ phase2: true }) });

const apiEnv = (prefix) => ({
  [`${prefix}_API_MODE`]: 'mock-server',
  [`${prefix}_API_BASE_URL`]: MOCK,
  [`${prefix}_APP_ENV`]: 'local',
  [`${prefix}_DEMO_CONTROLS`]: '1',
});
start('web', ['--filter', '@link/web', 'dev'], apiEnv('NEXT_PUBLIC'));
// CI=1 keeps Expo non-interactive; --web serves the teacher app in the browser on 8081.
start(
  'app',
  ['--filter', '@link/teacher-app', 'exec', 'expo', 'start', '--web', '--port', '8081'],
  {
    ...apiEnv('EXPO_PUBLIC'),
    CI: '1',
  },
);

console.log(`
Link demo (sample data only)
  Teacher app  http://localhost:8081   sign in: +20 10 0000 0002, code 123456
  Owner web    http://localhost:3000/ar/centre/today   sign in: +20 10 0000 0003 (owner) or …0004 (reception)
  Parent PWA   http://localhost:3000/ar/children       sign in: +20 10 0000 0001
  Mock server  ${MOCK}/__demo/state
`);
