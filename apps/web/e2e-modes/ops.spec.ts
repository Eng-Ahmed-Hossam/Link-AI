import { expect, test, type Page } from '@playwright/test';
import { MODE, codeFor, resetWorld } from './helpers';

/**
 * S2 ops console (apps/ops, :3001) on the real backend: live only — ops never runs on mock data.
 * An agent signs in by phone code (CF-60), sees the sample lead in L01 and the teacher queue; the
 * finance user lands on refunds and cannot open the agent's sections (MKT-OPS-08, OD-37).
 */
const OPS = 'http://localhost:3001';
const AGENT = '1000000051';
const FINANCE = '1000000052';
const OWNER = '1000000003';

test.skip(MODE !== 'live', 'The ops console runs on core-api only.');

async function signIn(page: Page, national: string) {
  await page.goto(`${OPS}/en/sign-in`);
  const since = Date.now();
  await page.locator('input[type=tel]').fill(national);
  await page.getByTestId('ops-send-code').click();
  await page.locator('input[autocomplete=one-time-code]').fill(await codeFor(national, since));
}

test.beforeAll(resetWorld);

test('MKT-OPS-01/08: the agent signs in, sees the L01 pipeline with the sample lead, and the teacher queue', async ({
  page,
}) => {
  await signIn(page, AGENT);
  await expect(page).toHaveURL(/\/en\/centres$/);
  await expect(page.getByRole('heading', { name: 'Centre requests', level: 1 })).toBeVisible();
  await expect(page.getByTestId('lead').first()).toBeVisible();
  await page.getByTestId('lead').first().getByRole('button', { name: 'Mark contacted' }).click();
  await expect(page.getByTestId('lead').first()).toContainText('Contacted');
  // Finance's section is not in the agent's navigation.
  await expect(page.getByRole('link', { name: 'Refunds' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Teacher checks' }).click();
  await expect(page.getByTestId('ops-teacher').first()).toBeVisible();
  // Arabic, right to left.
  await page.goto(`${OPS}/ar/teachers`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'توثيق المدرسين', level: 1 })).toBeVisible();
});

test('OD-37: finance lands on refunds; a centre owner is refused', async ({ page }) => {
  await signIn(page, FINANCE);
  await expect(page).toHaveURL(/\/en\/refunds$/);
  await expect(page.getByRole('heading', { name: 'Refunds', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Centre requests' })).toHaveCount(0);

  // MKT-OPS-11: this week's batch, then its CSV for the bank or InstaPay.
  await page.getByRole('link', { name: 'Payouts' }).click();
  await page.getByTestId('run-payouts').click();
  await expect(
    page.getByRole('status').filter({ hasText: /payouts? added|Nothing new/ }),
  ).toBeVisible();
  const batch = page.getByTestId('payout-batch').first();
  await expect(batch).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    batch.getByTestId('export-batch').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^link-payouts-\d{4}-\d{2}-\d{2}\.csv$/);
  await expect(page.getByTestId('payout-item').first()).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, OWNER);
  await expect(page.getByText('This number is not a Link ops account.')).toBeVisible();
  // The owner's session was ended at once: the console stays closed.
  await page.goto(`${OPS}/en/centres`);
  await expect(page).toHaveURL(/\/en\/sign-in$/);
});
