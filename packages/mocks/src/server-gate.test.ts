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

const reset = (base: string, headers: Record<string, string> = {}) =>
  fetch(`${base}/__demo/reset`, { method: 'POST', headers, body: '{}' });

it('hosted without a secret: /__demo/* answers 404', async () => {
  const base = await start({ RAILWAY_PROJECT_ID: 'sample-project' });
  expect((await reset(base)).status).toBe(404);
  expect((await fetch(`${base}/x/__demo/reset`, { method: 'POST' })).status).toBe(404);
}, 30_000);

it('hosted with a secret: anonymous 401, wrong 401, right header works', async () => {
  const base = await start({
    RAILWAY_PROJECT_ID: 'sample-project',
    DEMO_ROUTES_SECRET: 'sample-secret',
  });
  expect((await reset(base)).status).toBe(401);
  expect((await reset(base, { 'x-link-demo-secret': 'nope' })).status).toBe(401);
  expect((await reset(base, { 'x-link-demo-secret': 'sample-secret' })).ok).toBe(true);
}, 30_000);
