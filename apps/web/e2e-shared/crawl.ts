/**
 * The route crawler's shared parts (demo: apps/web/e2e-demo/routes.spec.ts; pilot:
 * apps/pilot/e2e/routes.spec.ts). Types only from Playwright, so each suite keeps its own copy.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Page } from '@playwright/test';
import { SCREENS, type ScreenApp } from '../src/screens';

/** `/centre/{centreId}/today?x={y}` → `/centre/*\/today`: what a page file's route looks like. */
export const patternOf = (path: string) => path.split('?')[0]!.replace(/\{\w+\}/g, '*');

function* files(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* files(p);
    else yield p;
  }
}

const segs = (rel: string) =>
  rel
    .split(sep)
    .filter((s) => !/^\(.*\)$/.test(s))
    .map((s) => (/^\[.*\]$/.test(s) ? '*' : s));

/**
 * Web routes from `app/[lang]/**\/page.tsx`. Left out: redirects (`/{lang}`, `/centre/{id}`), the
 * not-found catch-all, and the generic `[section]` page (its sections are C02–C07 in the manifest).
 */
export function webRoutes(appDir: string): string[] {
  const root = join(appDir, '[lang]');
  const out: string[] = [];
  for (const f of files(root)) {
    if (!f.endsWith(`${sep}page.tsx`)) continue;
    const route = `/${segs(relative(root, f)).slice(0, -1).join('/')}`;
    if (['/', '/*', '/centre/*', '/centre/*/*'].includes(route)) continue;
    out.push(route);
  }
  return out.sort();
}

/** Teacher app routes from `app/**\/*.tsx` (expo-router). Left out: layouts, not-found, the tab index redirect. */
export function teacherRoutes(appDir: string): string[] {
  const out: string[] = [];
  for (const f of files(appDir)) {
    const rel = relative(appDir, f);
    if (!rel.endsWith('.tsx') || /(^|[\\/])(_layout|\+not-found)\.tsx$/.test(rel)) continue;
    const parts = segs(rel.replace(/\.tsx$/, ''));
    if (parts.at(-1) === 'index') parts.pop();
    const route = `/${parts.join('/')}`;
    if (route === '/') continue;
    out.push(route);
  }
  return out.sort();
}

/** Page files with no screen in the manifest (the crawler would never visit them). */
export function unlisted(routes: string[], app: ScreenApp): string[] {
  const known = new Set(SCREENS.filter((s) => s.app === app).map((s) => patternOf(s.path)));
  return routes.filter((r) => !known.has(r));
}

/** Console errors and uncaught exceptions on a page, from now on. */
export function watch(page: Page, ignore: RegExp[] = []) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !ignore.some((r) => r.test(m.text())))
      errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on('pageerror', (e) => errors.push(`exception: ${e.message.slice(0, 300)}`));
  return errors;
}

/** Text that means a route did not resolve, whatever the HTTP status said. */
const NOT_FOUND_TEXT = /Unmatched Route|This page could not be found|404: This page/;

/**
 * Open `url` and report what is wrong: an HTTP error, the app's "not found" page, a framework
 * not-found screen, or a console error / exception while it loads.
 */
export async function visit(
  page: Page,
  url: string,
  ready: (p: Page) => Promise<void>,
  errors: string[],
): Promise<string[]> {
  const before = errors.length;
  const problems: string[] = [];
  const res = await page.goto(url).catch((e: Error) => {
    problems.push(`navigation failed: ${e.message.split('\n')[0]}`);
    return null;
  });
  if (res && res.status() >= 400) problems.push(`HTTP ${res.status()}`);
  await ready(page);
  for (const id of ['not-found', 'centre-not-found', 'screen-not-found'])
    if (await page.getByTestId(id).count()) problems.push(`shows "${id}"`);
  const text = await page
    .locator('body')
    .innerText()
    .catch(() => '');
  if (NOT_FOUND_TEXT.test(text)) problems.push('framework not-found screen');
  problems.push(...errors.slice(before));
  return problems.map((p) => `${url}: ${p}`);
}

/** Same-origin links on the page (no hash), to check that none is broken. */
export async function links(page: Page): Promise<string[]> {
  const origin = new URL(page.url()).origin;
  const hrefs = await page
    .locator('a[href]')
    .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  return [
    ...new Set(
      hrefs
        .filter((h) => h.startsWith(origin))
        .map((h) => h.split('#')[0]!)
        .filter((h) => !/\.(pdf|png|jpg|svg|csv|json)$/.test(h)),
    ),
  ];
}
