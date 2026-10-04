import { expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MOCK = 'http://localhost:4010';
export type Lang = 'ar' | 'en';
const ROOT = join(__dirname, '..', '..', '..');
export const SHOTS = join(ROOT, 'docs', 'frontend', 'screenshots', 'batch-5');
export const WALK = join(ROOT, 'docs', 'frontend', 'walkthroughs', 'batch-5');
mkdirSync(SHOTS, { recursive: true });
mkdirSync(WALK, { recursive: true });

const post = (path: string, body: unknown = {}) =>
  fetch(`${MOCK}${path}`, { method: 'POST', body: JSON.stringify(body) });

/** Fresh demo-followup scenario with the Phase 2 flag on (unless told otherwise). */
export async function resetScenario(settings: Record<string, unknown> = {}) {
  await post('/__demo/reset');
  await post('/__demo/settings', {
    phase2: true,
    offline: false,
    sttDown: false,
    confirmFault: null,
    ...settings,
  });
}
export const setDemo = (settings: Record<string, unknown>) => post('/__demo/settings', settings);
export const demoState = async (lang: Lang = 'en') =>
  (await fetch(`${MOCK}/__demo/state/${lang}`)).json();

/** Empty device storage on the first load of a test, signed in as the sample teacher. */
export async function prepare(page: Page, lang: Lang = 'ar') {
  await page.addInitScript((l) => {
    if (sessionStorage.getItem('e2e.prepared')) return; // later loads = "app restart": keep storage
    sessionStorage.setItem('e2e.prepared', '1');
    localStorage.clear();
    localStorage.setItem(
      'link.teacher.session',
      JSON.stringify({ accessToken: 'mock.usr-salma', userId: 'usr-salma' }),
    );
    localStorage.setItem('link.locale', l);
  }, lang);
}

export const id = (page: Page, testId: string) => page.getByTestId(testId);

/** Today → "Complete session record" → T02. */
export async function openTodayRecord(page: Page) {
  await page.goto('/today');
  await id(page, 'complete-record').click();
  await expect(id(page, 'screen-t02')).toBeVisible();
}

/** Hold the record button for `ms`, then release (optionally sliding `slide` px first). */
export async function holdToRecord(page: Page, ms: number, slide = 0) {
  const box = (await id(page, 'record-button').boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  if (slide) await page.mouse.move(x + slide, y, { steps: 8 });
  await page.mouse.up();
}

/** Full-length capture: react-native-web scrolls inside a container, so let it grow first. */
export async function shot(page: Page, name: string, dir = SHOTS) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
  const restore = await page.evaluateHandle(() => {
    const changed: [HTMLElement, string][] = [];
    const set = (el: HTMLElement, css: string) => {
      changed.push([el, el.getAttribute('style') ?? '']);
      el.setAttribute('style', `${el.getAttribute('style') ?? ''};${css}`);
    };
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      const oy = getComputedStyle(el).overflowY;
      if (oy !== 'auto' && oy !== 'scroll') continue;
      set(el, 'overflow: visible !important; height: auto !important; flex: none !important');
      for (let p = el.parentElement; p; p = p.parentElement)
        set(p, 'height: auto !important; min-height: 0 !important; overflow: visible !important');
    }
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="demo-controls"], [data-testid="mock-badge"]',
      ),
    ))
      set(el, 'visibility: hidden !important');
    // The bottom tab bar cannot follow a grown page in react-native-web: leave it out of full-length captures.
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[role="tablist"]')))
      set(el, 'display: none !important');
    return () => changed.reverse().forEach(([el, s]) => el.setAttribute('style', s));
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
  await page.evaluate((fn) => fn(), restore);
}

export function writeProof(name: string, data: unknown) {
  writeFileSync(join(WALK, name), JSON.stringify(data, null, 2) + '\n');
}
