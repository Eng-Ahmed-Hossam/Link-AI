// Step 2A (Batch 2) · centre web marketplace screens on the shared mock server: axe and
// screenshots in Arabic and English, and the rules. Test names carry rule / story / decision IDs.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { C, MOCK, axe, ready, resetScenario, shot, signIn, type Lang } from './helpers';

const SHOTS = join(__dirname, '..', '..', '..', 'docs', 'frontend', 'screenshots', 'batch-2');
mkdirSync(SHOTS, { recursive: true });
const market = () => resetScenario({ marketplace: true });
const extra = (on: boolean) =>
  fetch(`${MOCK}/__demo/features`, {
    method: 'POST',
    body: JSON.stringify({ centreId: 'cen-nour', followupExtra: on }),
  });
const nav = (page: Page) => page.getByRole('navigation');

test.describe('every marketplace page passes axe in both languages', () => {
  for (const lang of ['ar', 'en'] as Lang[])
    test(`axe + screenshots (${lang})`, async ({ page }) => {
      await market();
      await signIn(page, 'owner', lang);
      const pages: [string, string][] = [
        ['C03', 'schedule'],
        ['C02', 'profile'],
        ['C05', 'rooms'],
        ['C06', 'requests'],
        ['C07', 'rent-income'],
        ['C04', 'reviews'],
        ['A16', 'staff'],
      ];
      for (const [id, path] of pages) {
        await page.goto(`${C(lang)}/${path}`);
        await ready(page);
        await expect(page.locator('h1').first()).toBeVisible();
        await axe(page);
        await shot(page, `${id}.${lang}`, SHOTS);
      }
      // "What's included" for a centre without the Follow-up extra.
      await extra(false);
      await page.goto(`${C(lang)}/followup-extra`);
      await expect(page.getByTestId('followup-extra')).toBeVisible();
      await axe(page);
      await shot(page, `C-EXTRA.${lang}`, SHOTS);
      await extra(true);
      // C01 and A18 are public pages.
      await page.goto(`/${lang}/add-your-centre`);
      await ready(page);
      await axe(page);
      await shot(page, `C01.${lang}`, SHOTS);
      await page.evaluate(() => localStorage.removeItem('link.session'));
      await page.goto(`/${lang}/centre`);
      await ready(page);
      await axe(page);
      await shot(page, `A18.${lang}`, SHOTS);
    });
});

test.describe('2A.5 / OD-58: Follow-up is a paid extra', () => {
  test('the menu has two labelled groups and Staff outside both; home is the Room schedule', async ({
    page,
  }) => {
    await market();
    await signIn(page, 'owner', 'en');
    await page.goto('/en/centre');
    await expect(page).toHaveURL(/\/centre\/cen-nour\/schedule$/);
    await expect(page.getByTestId('followup-today-card')).toBeVisible();
    await expect(nav(page).getByText('Marketplace', { exact: true })).toBeVisible();
    await expect(nav(page).getByText('Follow-up', { exact: true })).toBeVisible();
    for (const l of [
      'Public profile',
      'Room schedule',
      'Rooms & rent',
      'Room requests',
      'Rent income',
      'Reviews',
      'Today',
      'Follow-ups',
      'Students',
      'Sessions',
      'Parent messages',
      'Rules & settings',
      'Activity history',
      'Staff',
    ])
      await expect(nav(page).getByRole('link', { name: l, exact: true })).toBeVisible();
    await expect(page.getByTestId('nav-tag-followup')).toHaveText('Paid extra');
  });

  test('without the extra every Follow-up item disappears, its pages lead to "What\'s included" (no prices), and the parent feed hides', async ({
    page,
    browser,
  }) => {
    await market();
    await extra(false);
    await signIn(page, 'owner', 'en');
    await page.goto(`${C('en')}/schedule`);
    await ready(page);
    for (const l of ['Today', 'Follow-ups', 'Students', 'Sessions', 'Parent messages'])
      await expect(nav(page).getByRole('link', { name: l, exact: true })).toHaveCount(0);
    await expect(page.getByTestId('followup-today-card')).toHaveCount(0);
    await expect(page.getByTestId('open-assistant')).toHaveCount(0);
    // A bookmark to a Follow-up page shows what the extra includes instead.
    await page.goto(`${C('en')}/follow-ups`);
    await expect(page).toHaveURL(/\/followup-extra$/);
    const card = page.getByTestId('followup-extra');
    await expect(card).toContainText("What's included");
    await expect(card.getByTestId('extra-contact')).toHaveText('Contact us');
    await expect(card).not.toContainText('EGP');
    // The parent's updates feed is part of the extra too.
    const parent = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await signIn(parent, 'parent', 'en');
    await parent.goto('/en/children');
    await ready(parent);
    await expect(parent.getByTestId('updates-feed')).toHaveCount(0);
    await extra(true);
    await parent.reload();
    await expect(parent.getByTestId('updates-feed').first()).toBeVisible();
  });
});

test.describe('C06 room requests (MKT-HAL-04)', () => {
  test('"Approve instantly" only when every rule is met; approving books the slot on C03; decline needs a reason', async ({
    page,
  }) => {
    await market();
    await signIn(page, 'owner', 'en');
    await page.goto(`${C('en')}/requests`);
    await ready(page);
    for (const col of ['requested', 'phone_call', 'meeting', 'approved'])
      await expect(page.getByTestId(`column-${col}`)).toBeVisible();
    // Omar meets the rules; Dina (ID pending) and Tamer (rating below) do not.
    await expect(page.getByTestId('approve-instantly-req-omar')).toBeVisible();
    await expect(page.getByTestId('approve-instantly-req-dina')).toHaveCount(0);
    await expect(page.getByTestId('approve-instantly-req-tamer')).toHaveCount(0);
    await page.getByTestId('approve-instantly-req-omar').click();
    await expect(page.getByTestId('column-approved').getByTestId('request-req-omar')).toBeVisible();
    // Forward only: Dina moves to a phone call.
    await page.getByTestId('move-req-dina').click();
    await expect(
      page.getByTestId('column-phone_call').getByTestId('request-req-dina'),
    ).toBeVisible();
    // Declining asks for a reason first.
    const tamer = page.getByTestId('request-req-tamer');
    await tamer.getByRole('button', { name: 'Decline' }).click();
    await expect(page.getByTestId('decline-req-tamer')).toBeDisabled();
    await tamer.getByRole('textbox').fill('The hall is kept for exam revision.');
    await page.getByTestId('decline-req-tamer').click();
    await expect(page.getByTestId('request-req-tamer')).toHaveCount(0);
    // C03: Omar's approved slot shows as booked.
    await page.goto(`${C('en')}/schedule`);
    await ready(page);
    for (const d of ['7', '2']) {
      await page.getByTestId(`day-${d}`).click();
      if (await page.getByTestId('cell-booked').filter({ hasText: 'Omar' }).count()) break;
    }
    await expect(page.getByTestId('cell-booked').filter({ hasText: 'Omar' }).first()).toBeVisible();
  });
});

test.describe('C05 rooms & rent', () => {
  test('MKT-HAL-05: auto-approve is off by default; one rent rule per hall; the per-student rule flags OD-13', async ({
    page,
  }) => {
    await market();
    await signIn(page, 'owner', 'en');
    await page.goto(`${C('en')}/rooms`);
    await ready(page);
    await expect(page.getByTestId('auto-approve-switch')).toHaveAttribute('aria-checked', 'false');
    // Hall A: per student per session → the OD-13 note; one radio checked at a time.
    await page.getByTestId('hall-hall-nour-a').click();
    await expect(page.getByRole('radio', { checked: true })).toHaveCount(1);
    await expect(page.getByText(/OD-13/)).toBeVisible();
    await page.getByRole('radio', { name: /Fixed per session/ }).click();
    await expect(page.getByRole('radio', { checked: true })).toHaveCount(1);
    await expect(page.getByText(/OD-13/)).toHaveCount(0);
  });
});

test.describe('C04 reviews (BR-REV-06)', () => {
  test('reply or report only — there is no delete or hide; a report moves the review to Reported', async ({
    page,
  }) => {
    await market();
    await signIn(page, 'owner', 'en');
    await page.goto(`${C('en')}/reviews`);
    await ready(page);
    await expect(page.getByRole('button', { name: /delete|hide|remove/i })).toHaveCount(0);
    const first = page.locator('[data-testid^="review-"]').first();
    const id = (await first.getAttribute('data-testid'))!.replace('review-', '');
    await page.getByTestId(`reply-${id}`).click();
    await first.getByRole('textbox').fill('Thank you — see you next week.');
    await page.getByTestId(`send-reply-${id}`).click();
    await expect(first.getByTestId('review-reply')).toContainText('see you next week');
    await page.getByTestId(`report-${id}`).click();
    await first.getByRole('textbox').fill('Names a child in full.');
    await page.getByTestId(`send-report-${id}`).click();
    await page.getByTestId('tab-reported').click();
    await expect(page.getByTestId(`review-${id}`)).toBeVisible();
    // Private feedback takes no public reply.
    await page.getByTestId('tab-private').click();
    await expect(page.locator('[data-testid^="reply-"]')).toHaveCount(0);
  });
});

test.describe('C07 rent income (CF-13, OD-01, OD-16)', () => {
  test("Link's fee is its own column; the totals come from the rows, the net is rent − fee", async ({
    page,
  }) => {
    await market();
    await signIn(page, 'owner', 'en');
    await page.goto(`${C('en')}/rent-income`);
    await ready(page);
    const api = await (
      await fetch(`${MOCK}/v1/centres/cen-nour/rent-income`, {
        headers: { authorization: 'Bearer mock.usr-owner' },
      })
    ).json();
    await expect(page.getByRole('columnheader', { name: /Link fee \(5%\)/ })).toBeVisible();
    await expect(page.getByTestId('rent-row')).toHaveCount(api.rows.length);
    const egp = (pt: number) =>
      new Intl.NumberFormat('en-EG', { maximumFractionDigits: 2 }).format(pt / 100);
    await expect(page.getByTestId('total-rent')).toContainText(egp(api.totals.rentDue.amountPt));
    await expect(page.getByTestId('total-net')).toContainText(egp(api.totals.net.amountPt));
    expect(api.totals.net.amountPt).toBe(api.totals.rentDue.amountPt - api.totals.linkFee.amountPt);
    await expect(page.getByTestId('next-transfer')).toContainText('Thursday');
  });
});

test.describe('A18 / C01 / A16', () => {
  test('A18 MKT-ACC-01: the owner signs in with a phone code and lands on the Room schedule', async ({
    page,
  }) => {
    await market();
    await page.goto('/en/centre');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('input[type=tel]').fill('1000000003');
    await page.getByTestId('owner-send-code').click();
    await page.locator('input[autocomplete=one-time-code]').fill('123456');
    await expect(page).toHaveURL(/\/centre\/cen-nour\/schedule$/, { timeout: 20_000 });
    await expect(page.getByTestId('signed-in-as')).toContainText('Tamer Fouad');
  });

  test('A18: a parent number is not a centre account and is pointed to "Add my centre"', async ({
    page,
  }) => {
    await market();
    await page.goto('/en/centre');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('input[type=tel]').fill('1000000001');
    await page.getByTestId('owner-send-code').click();
    await page.locator('input[autocomplete=one-time-code]').fill('123456');
    await expect(page.getByTestId('not-staff')).toBeVisible();
    await expect(page.getByTestId('not-staff').getByRole('link')).toHaveAttribute(
      'href',
      '/en/add-your-centre',
    );
  });

  test('C01 MKT-ACC-02 AC3: the request checks the fields and the unticked consent, then confirms', async ({
    page,
  }) => {
    await market();
    await page.goto('/en/add-your-centre');
    await ready(page);
    await page.getByTestId('join-submit').click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByTestId('join-centre-name').fill('Al Amal Centre');
    await page.getByTestId('join-area').fill('Nasr City');
    await page.getByTestId('join-address').fill('5 Makram Ebeid St');
    await page.getByTestId('join-owner').fill('Hany Nabil');
    await page.locator('input[type=tel]').fill('1012345678');
    await page.getByTestId('join-submit').click();
    await expect(page.getByRole('alert')).toContainText('Tick the box');
    await page.getByRole('checkbox').click();
    await page.getByTestId('join-submit').click();
    await expect(page.getByTestId('join-done')).toBeVisible();
  });

  test('A16 MKT-ACC-04 AC1: a Reception invite carries marketplace permissions', async ({
    page,
  }) => {
    await market();
    await signIn(page, 'owner', 'en');
    await page.goto(`${C('en')}/staff`);
    await ready(page);
    await expect(page.getByTestId('staff-perms')).toContainText('Room requests & bookings');
    await page.getByTestId('invite-phone').fill('01011112222');
    await page.getByRole('combobox').selectOption('reception');
    await expect(page.getByTestId('invite-perms')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Reply to & report reviews' }).click();
    await page.getByTestId('send-invite').click();
    await expect(page.getByTestId('staff-perms')).toHaveCount(2);
  });
});
