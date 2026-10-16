// ADR-0010: per-visitor sandboxes on the hosted demo API (the public trial). Each visitor's world
// is its own; the shared seed is never written; global and dangerous demo routes stay locked;
// the trial's few routes are scoped to the caller's sandbox and rate-limited.
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import * as fu from './followup/db';
import { DEFAULT_LIMITS, Sandboxes } from './sandbox';
import { isPublicDemoRoute, publicSettings } from './demo-gate';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = 'visitorAAAAAAAAAAAAAAAAAAAAAA';
const B = 'visitorBBBBBBBBBBBBBBBBBBBBBB';

describe('Sandboxes (unit)', () => {
  it('two sandboxes never share a world; a new one starts from the seed', async () => {
    const s = new Sandboxes();
    const seed = await s.run(B, async () => fu.demoSnapshot().demo.phase2);
    await s.run(A, async () => void fu.setDemo({ phase2: !seed }));
    expect(await s.run(B, async () => fu.demoSnapshot().demo.phase2)).toBe(seed);
    expect(await s.run(A, async () => fu.demoSnapshot().demo.phase2)).toBe(!seed);
  });

  it('runs one request at a time, even when they overlap', async () => {
    const s = new Sandboxes();
    const order: string[] = [];
    await Promise.all([
      s.run(A, async () => {
        order.push('A start');
        await new Promise((r) => setTimeout(r, 30));
        order.push('A end');
      }),
      s.run(B, async () => void order.push('B')),
    ]);
    expect(order).toEqual(['A start', 'A end', 'B']);
  });

  it('expires idle and old sandboxes, and drops the least recently used past the cap', async () => {
    let now = 0;
    const s = new Sandboxes({ ...DEFAULT_LIMITS, max: 2, idleMs: 1000, maxAgeMs: 5000 }, () => now);
    await s.run(A, async () => undefined);
    now = 500;
    await s.run(B, async () => undefined);
    now = 1200;
    s.sweep();
    expect([s.has(A), s.has(B)]).toEqual([false, true]);
    now = 1300;
    await s.run(A, async () => undefined);
    await s.run('visitorCCCCCCCCCCCCCCCCCCCCCC', async () => undefined);
    expect(s.size).toBeLessThanOrEqual(2);
  });

  it('limits requests and new sandboxes per address', async () => {
    const s = new Sandboxes({ ...DEFAULT_LIMITS, requestsPerIpMinute: 3, newPerIpHour: 1 });
    expect(s.admit(A, '1.1.1.1')).toBe('ok');
    await s.run(A, async () => undefined);
    expect(s.admit(B, '1.1.1.1')).toBe('too_many_sandboxes');
    expect(s.admit(A, '2.2.2.2')).toBe('ok');
    expect(s.admit(A, '1.1.1.1')).toBe('ok');
    expect(s.admit(A, '1.1.1.1')).toBe('rate_limited');
  });
});

describe('the trial routes a browser may call', () => {
  it('only settings, reset and state, and only the trial flags', () => {
    expect(isPublicDemoRoute('POST', '/__demo/settings')).toBe(true);
    expect(isPublicDemoRoute('POST', '/__demo/reset')).toBe(true);
    expect(isPublicDemoRoute('GET', '/__demo/state/ar')).toBe(true);
    for (const p of [
      '/__demo/provider',
      '/__demo/story/reset',
      '/__demo/verify-location',
      '/__demo/new-day',
    ])
      expect(isPublicDemoRoute('POST', p), p).toBe(false);
    expect(
      publicSettings({ phase2: true, realStt: true, confirmFault: 'before_commit', offline: true }),
    ).toEqual({
      phase2: true,
    });
  });
});

// ── the real server, hosted (as on Railway) ────────────────────────────────────
const freePort = () =>
  new Promise<number>((res) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => res(port));
    });
  });
let child: ChildProcess | undefined;
afterEach(() => child?.kill());
async function start(env: Record<string, string> = {}) {
  const port = await freePort();
  child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      APP_ENV: 'local',
      MOCK_SERVER_PORT: String(port),
      RAILWAY_PROJECT_ID: 'sample-project',
      DEMO_REAL_STT: '',
      AI_SERVICE_URL: '',
      DEMO_ROUTES_SECRET: '',
      ...env,
    },
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`${base}/health`);
      return base;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error('mock server did not start');
}
const OWNER = { authorization: 'Bearer mock.usr-owner', 'content-type': 'application/json' };
const call = (base: string, sb: string, path: string, init: RequestInit = {}) =>
  fetch(`${base}/sb/${sb}${path}`, { ...init, headers: { ...OWNER, ...(init.headers ?? {}) } });

describe('the hosted demo API (sandbox mode)', () => {
  it('no sandbox: 400; a malformed sandbox id is no sandbox', async () => {
    const base = await start();
    expect((await fetch(`${base}/v1/feature-flags`)).status).toBe(400);
    expect((await fetch(`${base}/sb/short/v1/feature-flags`)).status).toBe(400);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  }, 30_000);

  it("visitor B can't see, reset or change visitor A's sandbox", async () => {
    const base = await start();
    // A moves the centre's pin (CF-44: pending) in A's world.
    const move = {
      location: {
        lat: 29.961,
        lng: 31.258,
        address: 'A moved here',
        governorate: 'Cairo',
        area: 'Maadi',
      },
    };
    expect(
      (await call(base, A, '/v1/centres/cen-nour', { method: 'PATCH', body: JSON.stringify(move) }))
        .ok,
    ).toBe(true);
    const pendingIn = async (sb: string) =>
      (
        (await (await call(base, sb, '/v1/centres/cen-nour/profile')).json()) as {
          location: { pending: { address: string } | null };
        }
      ).location.pending?.address ?? null;
    expect(await pendingIn(A)).toBe('A moved here');
    expect(await pendingIn(B)).toBeNull();
    // B resets its own world: A's change stays.
    expect((await call(base, B, '/__demo/reset', { method: 'POST', body: '{}' })).ok).toBe(true);
    expect(await pendingIn(A)).toBe('A moved here');
    // A's flags are A's.
    const phase2 = async (sb: string) =>
      ((await (await call(base, sb, '/__demo/state')).json()) as { demo: { phase2: boolean } }).demo
        .phase2;
    const seed = await phase2(B);
    await call(base, A, '/__demo/settings', {
      method: 'POST',
      body: JSON.stringify({ phase2: !seed }),
    });
    expect([await phase2(A), await phase2(B)]).toEqual([!seed, seed]);
  }, 60_000);

  it('global and dangerous demo routes stay locked, even inside a sandbox', async () => {
    const base = await start();
    for (const p of [
      '/__demo/provider',
      '/__demo/story/reset',
      '/__demo/verify-location',
      '/__demo/new-day',
      '/x/__demo/reset',
    ])
      expect((await call(base, A, p, { method: 'POST', body: '{}' })).status, p).toBe(404);
    // A visitor can't switch on real speech-to-text or faults through settings.
    await call(base, A, '/__demo/settings', {
      method: 'POST',
      body: JSON.stringify({ realStt: true, confirmFault: 'before_commit', offline: true }),
    });
    const demo = (
      (await (await call(base, A, '/__demo/state')).json()) as { demo: Record<string, unknown> }
    ).demo;
    expect(demo.realStt).toBeFalsy();
    expect(demo.confirmFault ?? null).toBeNull();
    expect(demo.offline).toBeFalsy();
  }, 30_000);

  it('rate-limited per address: requests, and new sandboxes', async () => {
    const base = await start({
      MOCK_SANDBOX_REQ_PER_IP_MIN: '4',
      MOCK_SANDBOX_NEW_PER_IP_HOUR: '1',
    });
    expect((await call(base, A, '/v1/feature-flags')).status).toBe(200);
    expect((await call(base, B, '/v1/feature-flags')).status).toBe(429);
    for (let i = 0; i < 3; i++) await call(base, A, '/v1/feature-flags');
    const r = await call(base, A, '/v1/feature-flags');
    expect(r.status).toBe(429);
    expect(((await r.json()) as { code: string }).code).toBe('rate_limited');
  }, 30_000);
});
