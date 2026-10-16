import { expect, type Page } from '@playwright/test';
import { demoId } from '../../core-api/seeds/demo-id';

/**
 * Specs in this folder run unchanged in both API modes (docs/plan/real-backend.md):
 *   E2E_MODE=mock → the `pnpm demo` stack (mock server :4010, code 123456)
 *   E2E_MODE=live → the `pnpm dev` stack (core-api :4000, codes read from sms-sink :8093)
 */
export const MODE: 'mock' | 'live' = process.env.E2E_MODE === 'live' ? 'live' : 'mock';
/** A deployed stack (playwright.modes.config.ts): the hosted staging. */
export const REMOTE = !!process.env.E2E_WEB_URL;
export const API =
  process.env.E2E_API_URL ?? (MODE === 'live' ? 'http://localhost:4000' : 'http://localhost:4010');
export const SMS = process.env.E2E_SMS_URL ?? 'http://localhost:8093';
export const TEACHER_APP = process.env.E2E_TEACHER_URL ?? 'http://localhost:8081';
export const OPS_APP = process.env.E2E_OPS_URL ?? 'http://localhost:3001';
/** The hosted staging's private code inbox: HTTP Basic auth with the token as the password. */
const SMS_HEADERS: Record<string, string> = process.env.E2E_SMS_TOKEN
  ? { authorization: `Basic ${Buffer.from(`e2e:${process.env.E2E_SMS_TOKEN}`).toString('base64')}` }
  : {};
/** Demo routes on a hosted or staging core-api need the demo secret (pnpm prod:local sets it). */
export const DEMO_HEADERS: Record<string, string> = process.env.DEMO_ROUTES_SECRET
  ? { 'x-link-demo-secret': process.env.DEMO_ROUTES_SECRET }
  : {};

/**
 * A sample record's ID in this mode: the mock's own ID (`hall-nour-1`), or the deterministic UUID
 * `pnpm seed:demo` gives the same record in Postgres.
 */
export const fixtureId = (key: string) => (MODE === 'live' ? demoId(key) : key);

/** The sample people (same numbers in both modes). */
export const PEOPLE = {
  parent: '1000000001',
  teacher: '1000000002',
  owner: '1000000003',
  reception: '1000000004',
};

/** A fresh world: the mock scenario, or the seeded database (local only). */
export async function resetWorld() {
  // The hosted staging has no demo routes: it keeps its world (seeded once, sample data).
  if (REMOTE) return;
  const r = await fetch(`${API}/__demo/reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...DEMO_HEADERS },
    body: '{}',
  });
  expect(r.ok).toBe(true);
  if (MODE === 'mock')
    await fetch(`${API}/__demo/settings`, {
      method: 'POST',
      body: JSON.stringify({ marketplace: true, phase2: false }),
    });
}

/** The sign-in code for a national number: 123456 in mock; the latest SMS in live. */
export async function codeFor(national: string, since: number): Promise<string> {
  if (MODE === 'mock') return '123456';
  const to = `+20${national}`;
  for (let i = 0; i < 40; i++) {
    const { items } = (await (
      await fetch(`${SMS}/api/messages`, { headers: SMS_HEADERS })
    ).json()) as {
      items: { to: string; body: string; templateCode: string | null; receivedAt: string }[];
    };
    const m = items.find(
      (x) => x.to === to && x.templateCode === 'otp' && Date.parse(x.receivedAt) >= since - 1000,
    );
    if (m) return m.body.match(/\d{6}/)![0];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no code reached sms-sink for ${to}`);
}

/** SMS messages to a number since a moment (live only; the mock sends none). */
export async function smsTo(national: string, since: number) {
  const { items } = (await (
    await fetch(`${SMS}/api/messages`, { headers: SMS_HEADERS })
  ).json()) as {
    items: { to: string; body: string; templateCode: string | null; receivedAt: string }[];
  };
  return items.filter((x) => x.to === `+20${national}` && Date.parse(x.receivedAt) >= since - 1000);
}

/** `GET /v1/me` as the page's own session: the cookie in live, the stored mock token in mock. */
export async function meInPage(page: Page) {
  return page.evaluate(
    async ({ mode, api }) => {
      if (mode === 'live') {
        const r = await fetch('/v1/me', { headers: { 'x-link-auth': 'cookie' } });
        return r.ok ? r.json() : null;
      }
      const raw =
        localStorage.getItem('link.session') ?? localStorage.getItem('link.teacher.session');
      if (!raw) return null;
      const r = await fetch(`${api}/v1/me`, {
        headers: { authorization: `Bearer ${JSON.parse(raw).accessToken}` },
      });
      return r.ok ? r.json() : null;
    },
    { mode: MODE, api: API },
  ) as Promise<{ id: string; roles: string[]; centreIds?: string[] } | null>;
}

export async function ready(page: Page) {
  await page.waitForLoadState('networkidle');
}
