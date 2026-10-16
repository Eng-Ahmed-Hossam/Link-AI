// The real mock server process, hosted (as on Railway): an anonymous reset never runs.
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const freePort = () =>
  new Promise<number>((res) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => res(port));
    });
  });

let child: ChildProcess | undefined;
afterEach(() => child?.kill());

async function start(env: Record<string, string>) {
  const port = await freePort();
  child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      APP_ENV: 'local',
      MOCK_SERVER_PORT: String(port),
      DEMO_REAL_STT: '',
      AI_SERVICE_URL: '',
      ...env,
    },
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`${base}/v1/feature-flags`);
      return base;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error('mock server did not start');
}

const SB = '/sb/gateTestSandboxAAAAAAAAAAAAAA';
const post = (base: string, path: string, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: 'POST', headers, body: '{}' });

it('hosted without a secret: no sandbox → 400; the global demo routes → 404 even in a sandbox', async () => {
  const base = await start({ RAILWAY_PROJECT_ID: 'sample-project' });
  expect((await post(base, '/__demo/reset')).status).toBe(400);
  expect((await fetch(`${base}/health`)).status).toBe(200);
  expect((await fetch(`${base}/__demo/state/en`)).status).toBe(400);
  expect((await post(base, `${SB}/__demo/provider`)).status).toBe(404);
  expect((await post(base, `${SB}/__demo/story/reset`)).status).toBe(404);
  expect((await post(base, `${SB}/x/__demo/reset`)).status).toBe(404);
  // The trial's own routes work, on the caller's sandbox only (sandbox.test.ts).
  expect((await post(base, `${SB}/__demo/reset`)).ok).toBe(true);
}, 30_000);

it('hosted with a secret: the global routes need it (401 without, 401 wrong, works with it)', async () => {
  const base = await start({
    RAILWAY_PROJECT_ID: 'sample-project',
    DEMO_ROUTES_SECRET: 'sample-secret',
  });
  expect((await post(base, `${SB}/__demo/provider`)).status).toBe(401);
  expect((await post(base, `${SB}/__demo/provider`, { 'x-link-demo-secret': 'nope' })).status).toBe(
    401,
  );
  expect(
    (await post(base, `${SB}/__demo/reset`, { 'x-link-demo-secret': 'sample-secret' })).ok,
  ).toBe(true);
}, 30_000);
