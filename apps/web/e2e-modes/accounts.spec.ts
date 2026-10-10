// R1 accounts, clicked through the real screens, in BOTH modes (E2E_MODE=mock | live).
// Test names carry requirement IDs.
import { expect, test } from '@playwright/test';
import { codeFor, meInPage, MODE, PEOPLE, ready, resetWorld, smsTo, TEACHER_APP } from './helpers';

test.beforeEach(async () => {
  await resetWorld();
});

/** A18 · owner or staff phone sign-in on the centre web; returns the centre ID it lands in. */
async function centreSignIn(page: import('@playwright/test').Page, national: string) {
  await page.goto('/en/centre');
  await ready(page);
  await page.locator('input[type=tel]').fill(national);
  const since = Date.now();
  await page.getByTestId('owner-send-code').click();
  await page.locator('input[autocomplete=one-time-code]').fill(await codeFor(national, since));
  await page.waitForURL(/\/en\/centre\/[^/]+\/\w+/);
  return page.url().match(/\/centre\/([^/]+)\//)![1]!;
}

test('MKT-ACC-01 P01: the sample parent signs in with the SMS code', async ({ page }) => {
  await page.goto('/en/welcome');
  await ready(page);
  await page.locator('input[type=tel]').fill(PEOPLE.parent);
  const since = Date.now();
  await page.locator('form button[type=submit]').click();
  await page.locator('input[autocomplete=one-time-code]').fill(await codeFor(PEOPLE.parent, since));
  await page.waitForURL(/\/en\/search/);
  const me = await meInPage(page);
  expect(me?.roles).toEqual(['parent']);
  // The session survives a reload (live: httpOnly cookies; mock: the stored token).
  await page.reload();
  expect((await meInPage(page))?.id).toBe(me?.id);
});

test('MKT-ACC-01 AC4: a wrong code says how many tries are left', async ({ page }) => {
  await page.goto('/en/welcome');
  await ready(page);
  await page.locator('input[type=tel]').fill(PEOPLE.parent);
  await page.locator('form button[type=submit]').click();
  const code = await codeFor(PEOPLE.parent, Date.now() - 5000);
  await page
    .locator('input[autocomplete=one-time-code]')
    .fill(code === '000000' ? '111111' : '000000');
  await expect(page.getByText('That code is not right. 4 tries left.')).toBeVisible();
});

test('MKT-ACC-02 P01: a new number signs up as a parent', async ({ page }) => {
  const national = '1555000123';
  await page.goto('/en/welcome');
  await ready(page);
  await page.locator('input[type=tel]').fill(national);
  const since = Date.now();
  await page.locator('form button[type=submit]').click();
  await page.locator('input[autocomplete=one-time-code]').fill(await codeFor(national, since));
  await page.waitForURL(/\/en\/search/);
  expect((await meInPage(page))?.roles).toEqual(['parent']);
});

test('A18: the owner signs in and lands in their own centre; staff list from the server', async ({
  page,
}) => {
  const centreId = await centreSignIn(page, PEOPLE.owner);
  const me = await meInPage(page);
  expect(me?.roles).toEqual(['centre_owner']);
  expect(me?.centreIds).toContain(centreId);
  await page.goto(`/en/centre/${centreId}/staff`);
  // The owner and Reception (the mock also lists the centre's teachers).
  await expect(page.locator('tbody tr').filter({ hasText: 'Reception' })).toHaveCount(1);
  await expect(page.locator('tbody tr').filter({ hasText: 'Owner' })).toHaveCount(1);
});

test('MKT-ACC-06 A16: the owner invites Reception by phone; pending until they sign in', async ({
  page,
}) => {
  const centreId = await centreSignIn(page, PEOPLE.owner);
  await page.goto(`/en/centre/${centreId}/staff`);
  await expect(page.locator('tbody tr').filter({ hasText: 'Reception' })).toHaveCount(1);
  const before = await page.locator('tbody tr').count();
  const since = Date.now();
  await page.getByTestId('invite-phone').fill('01555000999');
  await page.locator('select').last().selectOption('reception');
  await page.getByTestId('send-invite').click();
  await expect(page.locator('tbody tr')).toHaveCount(before + 1);
  await expect(page.locator('tbody tr').filter({ hasText: 'Invite pending' })).toHaveCount(1);
  if (MODE === 'live')
    await expect
      .poll(async () => (await smsTo('1555000999', since)).map((m) => m.templateCode))
      .toContain('staff_invite');
});

test('A18: Reception signs in to the same centre; no invite form (owner only)', async ({
  page,
}) => {
  const centreId = await centreSignIn(page, PEOPLE.reception);
  expect((await meInPage(page))?.roles).toEqual(['centre_staff']);
  await page.goto(`/en/centre/${centreId}/staff`);
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(page.getByTestId('send-invite')).toHaveCount(0);
});

test('MKT-CEN-01 C01: a join request becomes a pending centre when that number signs in', async ({
  page,
}) => {
  const national = '1555000456';
  await page.goto('/en/add-your-centre');
  await ready(page);
  await page.getByTestId('join-centre-name').fill('Sample Join Centre');
  await page.getByTestId('join-area').fill('Dokki');
  await page.getByTestId('join-address').fill('1 Sample Street');
  await page.getByTestId('join-owner').fill('Sample Owner');
  await page.locator('input[type=tel]').fill(national);
  await page.getByRole('checkbox').check();
  await page.getByTestId('join-submit').click();
  await expect(page.getByTestId('join-done')).toBeVisible();
  const centreId = await centreSignIn(page, national);
  const me = await meInPage(page);
  expect(me?.roles).toEqual(['centre_owner']);
  expect(me?.centreIds).toEqual([centreId]);
});

test('T14: the sample teacher signs in on the teacher app', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${TEACHER_APP}/sign-in`);
  await page.getByTestId('t14-phone').fill(PEOPLE.teacher);
  const since = Date.now();
  await page.getByTestId('t14-send').click();
  await page.getByTestId('t14-code').fill(await codeFor(PEOPLE.teacher, since));
  await page.getByTestId('t14-verify').click();
  await expect(page.getByTestId('screen-t14')).toHaveCount(0);
  if (MODE === 'mock') expect((await meInPage(page))?.roles).toEqual(['teacher']);
  else {
    // Live: the app keeps its tokens itself (secure storage on phones); check over the API.
    const stored = await page.evaluate(() => localStorage.getItem('link.teacher.session'));
    const { accessToken } = JSON.parse(stored!) as { accessToken: string };
    const r = await fetch('http://localhost:4000/v1/me', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(((await r.json()) as { roles: string[] }).roles).toEqual(['teacher']);
  }
});

test('MKT-OPS-09: a parent asks Link for a copy of their data from Account → My data', async ({
  page,
}) => {
  await page.goto('/en/welcome');
  await ready(page);
  await page.locator('input[type=tel]').fill(PEOPLE.parent);
  const since = Date.now();
  await page.locator('form button[type=submit]').click();
  await page.locator('input[autocomplete=one-time-code]').fill(await codeFor(PEOPLE.parent, since));
  await page.waitForURL(/\/en\/search/);
  await page.goto('/en/account');
  const card = page.getByTestId('data-rights');
  await expect(card).toBeVisible();
  await card.getByTestId('data-request-access').click();
  await card.getByTestId('data-request-send').click();
  await expect(card.getByText('Received')).toBeVisible();
  // One open request of each kind: the button is off until Link answers.
  await expect(card.getByTestId('data-request-access')).toBeDisabled();
});
