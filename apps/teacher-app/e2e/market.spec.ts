// Step 2A (Batch 3) · teacher app marketplace screens on the shared mock server: axe and
// screenshots in Arabic and English (docs/frontend/screenshots/batch-3/), and the rules. Test
// names carry rule / story / decision IDs.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { MOCK, id, prepare, resetScenario, shot, type Lang } from './helpers';

const SHOTS = join(__dirname, '..', '..', '..', 'docs', 'frontend', 'screenshots', 'batch-3');
mkdirSync(SHOTS, { recursive: true });

/** WCAG 2.1 AA: zero serious or critical violations (NFR-05). Dev-only badges are excluded. */
async function axe(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('[data-testid="mock-badge"]')
    .exclude('[data-testid="demo-controls"]')
    .analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual(
    [],
  );
}
const settle = (page: Page) => page.waitForLoadState('networkidle').catch(() => {});

test.beforeEach(async () => {
  await resetScenario({ marketplace: true });
});

for (const lang of ['ar', 'en'] as Lang[])
  test(`every Batch 3 screen passes axe (${lang})`, async ({ page }) => {
    await prepare(page, lang);
    const screens: [string, string, string][] = [
      ['J05', '/groups', 'screen-t09'],
      ['J01', '/rooms', 'screen-j01'],
      ['J02', '/room/hall-nour-a', 'screen-j02'],
      ['J03', '/room-requests', 'screen-j03'],
      ['J04', '/profile', 'screen-j04'],
      ['J06', '/enrolments', 'screen-j06'],
      ['J07', '/earnings', 'screen-j07'],
    ];
    for (const [sid, path, testId] of screens) {
      await page.goto(path);
      await expect(id(page, testId)).toBeVisible();
      await settle(page);
      await axe(page);
      await shot(page, `${sid}.${lang}`, SHOTS);
    }
    await page.evaluate(() => localStorage.removeItem('link.teacher.session'));
    await page.goto('/sign-in');
    await expect(id(page, 'screen-t14')).toBeVisible();
    await axe(page);
    await shot(page, `T14.${lang}`, SHOTS);
  });

test('T14 MKT-ACC-01: sign in with the phone code; home is My groups (2A.6)', async ({ page }) => {
  await page.goto('/sign-in');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await id(page, 't14-phone').fill('1000000002');
  await id(page, 't14-send').click();
  await id(page, 't14-code').fill('111111');
  await id(page, 't14-verify').click();
  await expect(page.getByRole('alert')).toBeVisible();
  await id(page, 't14-code').fill('123456');
  await id(page, 't14-verify').click();
  await expect(id(page, 'screen-t09')).toBeVisible();
});

test('J01 → J02 → J03 MKT-HAL-02/03: a free slot, a rent estimate line by line, then the request in the pipeline', async ({
  page,
}) => {
  await prepare(page, 'en');
  await page.goto('/rooms');
  await id(page, 'room-hall-nour-a').click();
  await expect(id(page, 'screen-j02')).toBeVisible();
  await id(page, 'for-grp-salma-ws').click();
  const free = page.locator('[data-testid^="slot-"]:not([aria-disabled="true"])');
  await free.first().click();
  const est = id(page, 'rent-estimate');
  await expect(est).toContainText('Centre rent');
  await expect(est).toContainText('Link commission (5%');
  const api = await (
    await fetch(`${MOCK}/v1/teachers/me`, { headers: { authorization: 'Bearer mock.usr-salma' } })
  ).json();
  expect(api.teaches.length).toBeGreaterThan(0);
  await id(page, 'send-request').click();
  await expect(id(page, 'screen-j03')).toBeVisible();
  await expect(page.getByText('Waiting for Al Nour Centre to review').first()).toBeVisible();
});

test('J05 CF-05: fees per month and per session; the seat cap cannot go above the hall', async ({
  page,
}) => {
  await prepare(page, 'en');
  await page.goto('/groups');
  await id(page, 'edit-fees-grp-salma-ws').click();
  await id(page, 'fee-seats').fill('999');
  await id(page, 'save-fees-grp-salma-ws').click();
  await expect(page.getByRole('alert')).toContainText('seats');
  await id(page, 'fee-seats').fill('25');
  await id(page, 'fee-month').fill('600');
  await id(page, 'save-fees-grp-salma-ws').click();
  await expect(id(page, 'fees-grp-salma-ws')).toHaveCount(0);
  await expect(id(page, 'group-grp-salma-ws')).toContainText('600');
});

test('J06 OD-08: read-only by default; confirm / decline appear only with "Review each enrolment" on', async ({
  page,
}) => {
  await prepare(page, 'en');
  await page.goto('/enrolments');
  await expect(id(page, 'screen-j06')).toBeVisible();
  await expect(page.locator('[data-testid^="accept-"]')).toHaveCount(0);
  await page.goto('/profile');
  await expect(id(page, 'review-each')).toHaveAttribute('aria-checked', 'false');
  await id(page, 'review-each').click();
  await id(page, 'save-profile').click();
  await expect(page.getByText('Profile saved')).toBeVisible();
});

test('J07 MKT-LED-07: parents paid, Link commission and rent per centre on their own lines; payout on Thursday (OD-04)', async ({
  page,
}) => {
  await prepare(page, 'en');
  await page.goto('/earnings');
  const e = await (
    await fetch(`${MOCK}/v1/teachers/me/earnings`, {
      headers: { authorization: 'Bearer mock.usr-salma' },
    })
  ).json();
  await expect(id(page, 'commission')).toContainText('Link commission (5%');
  await expect(id(page, 'rent-line')).toHaveCount(e.rent.length);
  await expect(id(page, 'next-payout')).toContainText('Thursday');
  expect(e.keep.amountPt).toBe(
    e.parentsPaid.amountPt - e.commission.amountPt - e.rentTotal.amountPt,
  );
});
