import { expect, test, type Browser, type Page } from '@playwright/test';
import { axe } from '../e2e-demo/helpers';
import { MODE, PEOPLE, codeFor, ready, resetWorld } from './helpers';

/**
 * Part B (MKT-CEN-02, CF-44, OD-46): the owner sets the centre's exact location in C02 — address
 * search, drag the pin, structured address — and it waits for Link ops; parents keep the approved
 * pin until an ops agent compares old and new in the ops console and approves. Live only: the ops
 * console runs on core-api. The map is the drawn dev map here (no map network in tests).
 */
const OPS = 'http://localhost:3001';
const AGENT = '1000000051';

test.skip(MODE !== 'live', 'The ops console (the approval) runs on core-api only.');
test.beforeAll(resetWorld);

async function ownerPage(browser: Browser) {
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  ).newPage();
  const since = Date.now();
  await page.goto('/ar/centre');
  await ready(page);
  await page.locator('input[type=tel]').fill(PEOPLE.owner);
  await page.getByTestId('owner-send-code').click();
  await page.locator('input[autocomplete=one-time-code]').fill(await codeFor(PEOPLE.owner, since));
  await page.waitForURL(/\/centre\/[^/]+\//, { timeout: 60_000 });
  const centreId = /\/centre\/([^/]+)\//.exec(page.url())![1]!;
  return { page, centreId };
}

async function opsAgent(browser: Browser) {
  const page = await (await browser.newContext()).newPage();
  const since = Date.now();
  await page.goto(`${OPS}/en/sign-in`);
  await page.locator('input[type=tel]').fill(AGENT);
  await page.getByTestId('ops-send-code').click();
  await page.locator('input[autocomplete=one-time-code]').fill(await codeFor(AGENT, since));
  await expect(page).toHaveURL(/\/en\/centres$/);
  return page;
}

async function publicCentre(browser: Browser): Promise<Page> {
  const page = await (
    await browser.newContext({ viewport: { width: 390, height: 844 } })
  ).newPage();
  await page.goto('/ar/centres/al-nour-maadi');
  await expect(page.getByTestId('centre-map')).toBeVisible({ timeout: 60_000 });
  return page;
}

test('Part B: search → drag → save → under review → ops approve → the public map updates', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const before = await publicCentre(browser);
  const oldHref = await before.getByTestId('open-in-maps').getAttribute('href');
  await before.close();

  // C02, Arabic, right to left.
  const { page, centreId } = await ownerPage(browser);
  await page.goto(`/ar/centre/${centreId}/profile`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByTestId('edit-pin').click();
  await page.getByTestId('location-search').fill('شارع ٩ المعادي');
  await page.getByTestId('location-search-button').click();
  await page.getByTestId('place-result').first().click();
  await expect(page.getByTestId('location-area')).toHaveValue('المعادي');
  await axe(page);

  // Drag the pin a little (toward the door), then add the landmark.
  const pin = page.getByTestId('picker-pin');
  const box = (await pin.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 - 25, { steps: 8 });
  await page.mouse.up();
  await page.getByTestId('location-landmark').fill('بجوار الصيدلية');
  await page.getByTestId('location-address').fill('١٤ شارع ٩، المعادي');
  await page.getByTestId('save-pin').click();
  await expect(page.getByTestId('location-under-review')).toBeVisible();
  await expect(page.getByTestId('location-pending')).toContainText('بجوار الصيدلية');
  await axe(page);

  // Parents still see the approved pin.
  const waiting = await publicCentre(browser);
  await expect(waiting.getByTestId('location-under-review')).toBeVisible();
  expect(await waiting.getByTestId('open-in-maps').getAttribute('href')).toBe(oldHref);
  await waiting.close();

  // Ops compare old and new, check the pin, approve.
  const ops = await opsAgent(browser);
  await ops.getByRole('radio', { name: 'Live' }).click();
  const card = ops
    .getByTestId('centre-application')
    .filter({ has: ops.getByTestId('pin-compare') });
  await expect(card.getByTestId('pin-new')).toContainText('بجوار الصيدلية');
  await expect(card.getByTestId('pin-moved')).toContainText('Moved');
  await axe(ops);
  await card.getByTestId('check-address_pin_match-done').click();
  await card.getByTestId('approve-centre').click();
  await expect(ops.getByTestId('pin-compare')).toHaveCount(0);

  // The public map now shows the new pin and landmark.
  const after = await publicCentre(browser);
  await expect(after.getByTestId('location-under-review')).toHaveCount(0);
  await expect(after.getByTestId('centre-map')).toContainText('بجوار الصيدلية');
  expect(await after.getByTestId('open-in-maps').getAttribute('href')).not.toBe(oldHref);
});
