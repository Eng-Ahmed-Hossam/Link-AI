import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type Lang = 'ar' | 'en';
export const LANGS: Lang[] = ['ar', 'en'];
const SHOTS = join(__dirname, '..', '..', '..', 'docs', 'frontend', 'screenshots', 'batch-1');
mkdirSync(SHOTS, { recursive: true });

/** Fresh mock state, optional mock overrides, and (optionally) the sample parent signed in. */
export async function prepare(
  page: Page,
  opts: {
    signedIn?: boolean;
    overrides?: {
      scenario?: string;
      holdSeconds?: number;
      reviewEachEnrolment?: Record<string, boolean>;
    };
    flags?: Record<string, boolean>;
    childId?: string;
  } = {},
) {
  await page.addInitScript(
    ({ signedIn, overrides, flags, childId }) => {
      if (sessionStorage.getItem('e2e.prepared')) return; // only on the first load of a test
      sessionStorage.setItem('e2e.prepared', '1');
      localStorage.clear();
      if (signedIn)
        localStorage.setItem(
          'link.session',
          JSON.stringify({
            accessToken: 'mock.usr-parent',
            userId: 'usr-parent',
            roles: ['parent'],
          }),
        );
      if (overrides) localStorage.setItem('link.mock.overrides', JSON.stringify(overrides));
      if (flags) localStorage.setItem('link.flags', JSON.stringify(flags));
      if (childId) localStorage.setItem('link.search.childId', childId);
    },
    {
      signedIn: !!opts.signedIn,
      overrides: opts.overrides ?? null,
      flags: opts.flags ?? null,
      childId: opts.childId ?? null,
    },
  );
}

/** Waits for fonts and idle network, hides the dev-only badges, then saves `<id>.<lang>.png`. */
export async function shot(page: Page, id: string, lang: Lang, fullPage = true) {
  await page.evaluate(() => document.fonts.ready);
  // Hide dev-only badges; lay sticky bars out in flow so full-page captures match the Figma frames.
  await page.addStyleTag({
    content:
      '[role="note"].fixed, button.fixed { visibility: hidden !important; } .sticky { position: static !important; }',
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, `${id}.${lang}.png`), fullPage });
}

/** WCAG 2.1 AA: zero serious or critical violations (NFR-05). */
export async function axe(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    bad.map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`,
    ),
  ).toEqual([]);
  return r.violations.length;
}

export async function ready(page: Page) {
  await page.waitForLoadState('networkidle');
  await page
    .locator('[aria-busy="true"]')
    .first()
    .waitFor({ state: 'detached', timeout: 15_000 })
    .catch(() => {});
}
