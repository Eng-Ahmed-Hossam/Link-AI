import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';

/** Every deployed URL (deploy/deployed-urls.json): one source for this suite and the docs. */
const here = __dirname;
export const URLS = JSON.parse(
  readFileSync(join(here, '..', '..', '..', 'deploy', 'deployed-urls.json'), 'utf8'),
) as {
  publicTrial: { web: string; teacher: string; demoApi: string };
  staging: { web: string; teacher: string; ops: string; api: string; smsInbox: string };
};

export type Lang = 'ar' | 'en';
export interface Combo {
  lang: Lang;
  width: number;
}
/** full: Arabic and English at 390 and 1280 px; quick (CI): Arabic at 390, English at 1280. */
export const COMBOS: Combo[] =
  process.env.SMOKE_MATRIX === 'full'
    ? [
        { lang: 'ar', width: 390 },
        { lang: 'en', width: 390 },
        { lang: 'ar', width: 1280 },
        { lang: 'en', width: 1280 },
      ]
    : [
        { lang: 'ar', width: 390 },
        { lang: 'en', width: 1280 },
      ];

export interface PageResult {
  env: 'public trial' | 'staging';
  app: string;
  role: string;
  page: string;
  lang: Lang;
  width: number;
  ok: boolean;
  action: string;
  actionOk: boolean;
  consoleErrors: string[];
  failedRequests: string[];
  map?: { tiles: number; blank: boolean };
  error?: string;
}

const OUT = process.env.SMOKE_OUT ?? join(here, '..', 'test-results', 'deployed-results.jsonl');
mkdirSync(dirname(OUT), { recursive: true });

/** Requests that may fail without being a problem (the browser's own probes). */
const IGNORED = /favicon|\/_next\/static\/.*\.map$|hot-update|__nextjs/;

/** Watches one page for console errors, failed requests and map tiles. */
export function watch(page: Page) {
  const w = { consoleErrors: [] as string[], failed: [] as string[], tiles: 0 };
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // The browser repeats each failed request as a console line; those are counted below.
    if (/^Failed to load resource/.test(t)) return;
    w.consoleErrors.push(t.slice(0, 200));
  });
  page.on('pageerror', (e) => w.consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on('response', (r) => {
    const u = r.url();
    if (/tiles\.openfreemap\.org/.test(u) && r.ok()) w.tiles++;
    if (r.status() >= 400 && !IGNORED.test(u)) w.failed.push(`${r.status()} ${shortUrl(u)}`);
  });
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText ?? '';
    if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(f) || IGNORED.test(r.url())) return;
    w.failed.push(`${f} ${shortUrl(r.url())}`);
  });
  return w;
}

/** Host + path, never the query (no tokens in reports). */
const shortUrl = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.host}${x.pathname}`;
  } catch {
    return u.slice(0, 120);
  }
};

/** A map that really drew: its canvas exists, tiles came back 200, and the picture is not blank. */
export async function mapDrawn(page: Page, scope: string, tilesBefore: () => number) {
  const canvas = page.locator(`${scope} canvas`).first();
  await canvas.waitFor({ timeout: 45_000 });
  await page.waitForTimeout(4000);
  const png = await canvas.screenshot();
  // A blank (single-colour) canvas compresses to a few kB; streets and labels do not.
  return { tiles: tilesBefore(), blank: png.length < 12_000 };
}

export function record(r: PageResult) {
  appendFileSync(OUT, JSON.stringify(r) + '\n');
}

/**
 * Checks one page: runs `action` (the page's main thing), and records console errors, failed
 * requests and, for map pages, the tiles. Returns the problems (empty = clean).
 */
export async function checkPage(
  page: Page,
  meta: Omit<PageResult, 'ok' | 'actionOk' | 'consoleErrors' | 'failedRequests' | 'map' | 'error'>,
  run: (w: ReturnType<typeof watch>) => Promise<{ map?: string } | void>,
  opts: { allowFailed?: RegExp } = {},
) {
  const w = watch(page);
  let actionOk = false;
  let error: string | undefined;
  let map: PageResult['map'];
  try {
    const r = await run(w);
    if (r?.map) map = await mapDrawn(page, r.map, () => w.tiles);
    actionOk = true;
  } catch (e) {
    error = String((e as Error).message ?? e)
      .split('\n')[0]!
      .slice(0, 200);
  }
  const failedRequests = [...new Set(w.failed)].filter((f) => !opts.allowFailed?.test(f));
  const mapBad = map ? map.tiles === 0 || map.blank : false;
  const ok = actionOk && !w.consoleErrors.length && !failedRequests.length && !mapBad;
  record({
    ...meta,
    ok,
    actionOk,
    consoleErrors: [...new Set(w.consoleErrors)],
    failedRequests,
    map,
    error,
  });
  page.removeAllListeners('console');
  page.removeAllListeners('pageerror');
  page.removeAllListeners('response');
  page.removeAllListeners('requestfailed');
  return ok
    ? []
    : [
        `${meta.app} ${meta.page} ${meta.lang}@${meta.width}: ${error ?? ''} ${[...w.consoleErrors, ...failedRequests].slice(0, 3).join(' | ')}${mapBad ? ' | map not drawn' : ''}`,
      ];
}

export async function newPage(browser: Browser, c: Combo, storageState?: string) {
  const ctx: BrowserContext = await browser.newContext({
    viewport: { width: c.width, height: c.width < 600 ? 844 : 900 },
    locale: c.lang === 'ar' ? 'ar-EG' : 'en-US',
    ...(storageState ? { storageState } : {}),
  });
  return { ctx, page: await ctx.newPage() };
}

/** The latest sign-in code for a national number, from the staging's private inbox. */
export async function stagingCode(national: string, since: number) {
  const token = process.env.SMOKE_SMS_TOKEN;
  if (!token) throw new Error('SMOKE_SMS_TOKEN is not set (GitHub secret STAGING_SMS_SINK_TOKEN)');
  const auth = { authorization: `Basic ${Buffer.from(`smoke:${token}`).toString('base64')}` };
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`${URLS.staging.smsInbox}/api/messages`, { headers: auth });
    const { items } = (await r.json()) as {
      items: { to: string; body: string; receivedAt: string }[];
    };
    const m = items.find(
      (x) => x.to === `+20${national}` && Date.parse(x.receivedAt) >= since - 5000,
    );
    if (m) return m.body.match(/\d{6}/)![0];
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`no code reached the inbox for +20${national}`);
}
