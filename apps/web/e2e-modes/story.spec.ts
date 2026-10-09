// Step 2B · the connected story, end to end across roles, by clicking: teacher (Expo web, 390) →
// owner (1440) → parent (390) → Reception (1440) and back. One spec, so every step starts from what
// the one before left. It runs in BOTH API modes (E2E_MODE=mock | live): the mock server, or the
// real core-api with real sign-in (codes from sms-sink) and real payments on fake-pay. Live mode runs
// the steps core-api serves so far (LIVE_STORY_STEPS, R2b: 1–7). In mock mode it saves the numbered
// Arabic screenshots in
// docs/frontend/walkthroughs/connected-story/ (docs/testing/walkthrough.md follows the same steps).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { axe } from '../e2e-demo/helpers';
import { API, MODE, PEOPLE, TEACHER_APP, codeFor, fixtureId as id, ready } from './helpers';

/** Live mode runs the story up to this step (R2b: 7; R3: 9). Mock mode runs all nine. */
const LIVE_STORY_STEPS = Number(process.env.LIVE_STORY_STEPS ?? 7);
const runs = (step: number) => MODE === 'mock' || step <= LIVE_STORY_STEPS;

// A stuck click fails within half a minute, not at the end of the story's long timeout.
test.use({ actionTimeout: 30_000 });

const OUT = join(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'frontend',
  'walkthroughs',
  'connected-story',
);
mkdirSync(OUT, { recursive: true });
let n = 0;
/** Numbered Arabic screenshots, in story order (mock mode: the walkthrough's sample data). */
async function snap(page: Page, name: string, full = true) {
  if (MODE === 'live') return;
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({
    path: join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`),
    fullPage: full,
  });
}
const story = async () => (await fetch(`${API}/__demo/story`)).json();
const outside = (path: string, body: unknown = {}) =>
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const seatsLeft = async (groupId: string) => {
  const g = await (
    await fetch(`${API}/v1/groups/${groupId}`, {
      headers: MODE === 'mock' ? { authorization: 'Bearer mock.usr-parent' } : {},
    })
  ).json();
  return g.upcomingSessions[0].seatsLeft as number;
};

/**
 * A browser window for one role. Mock: through the role chooser like a visitor. Live: the real
 * phone sign-in of each app (T14, A18, P01), with the code from sms-sink.
 */
async function enter(browser: Browser, role: 'owner' | 'parent' | 'teacher') {
  const desktop = role === 'owner';
  const ctx = await browser.newContext({
    viewport: desktop ? { width: 1440, height: 1000 } : { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  if (MODE === 'live') {
    const since = Date.now();
    if (role === 'teacher') {
      await page.goto(`${TEACHER_APP}/sign-in`);
      await page.getByTestId('t14-phone').fill(PEOPLE.teacher);
      await page.getByTestId('t14-send').click();
      await page.getByTestId('t14-code').fill(await codeFor(PEOPLE.teacher, since));
      await page.getByTestId('t14-verify').click();
      await expect(page.getByTestId('screen-t09')).toBeVisible({ timeout: 60_000 });
      return page;
    }
    await page.goto(role === 'owner' ? '/ar/centre' : '/ar/welcome');
    await ready(page);
    const national = role === 'owner' ? PEOPLE.owner : PEOPLE.parent;
    await page.locator('input[type=tel]').fill(national);
    await (
      role === 'owner'
        ? page.getByTestId('owner-send-code')
        : page.locator('form button[type=submit]')
    ).click();
    await page.locator('input[autocomplete=one-time-code]').fill(await codeFor(national, since));
    await page.waitForURL(role === 'owner' ? /\/schedule$/ : /\/search$/, { timeout: 60_000 });
    return page;
  }
  await page.goto('/ar/try');
  await page.getByTestId(`role-${role}`).click();
  if (role === 'teacher')
    await expect(page.getByTestId('screen-t09')).toBeVisible({ timeout: 60_000 });
  else await page.waitForURL(role === 'owner' ? /\/schedule$/ : /\/search$/, { timeout: 60_000 });
  return page;
}

test('the connected story: one hall slot, one group, one paid seat, one follow-up', async ({
  browser,
}) => {
  test.setTimeout(900_000);
  expect((await outside('/__demo/story/reset')).ok).toBe(true);

  // The way in: the role chooser.
  const site = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await site.goto('/ar/try');
  await ready(site);
  await snap(site, 'role-chooser');
  await site.close();

  const teacher = await enter(browser, 'teacher');
  const tid = (x: string) => teacher.getByTestId(x);
  const owner = await enter(browser, 'owner');
  const nav = owner.getByRole('navigation');

  await test.step('1 · Teacher (J01 → J02): a hall at مركز النور, a Saturday slot', async () => {
    await teacher.getByRole('tab', { name: 'القاعات' }).click();
    await expect(tid('screen-j01')).toBeVisible();
    await snap(teacher, 'teacher-J01-rooms', false);
    await tid(`room-${id('hall-nour-1')}`).click();
    await expect(tid('screen-j02')).toBeVisible();
    await tid('for-new').click();
    await tid(`subject-${id('sub-math')}`).click();
    await tid(`year-${id('sy-sec2')}`).click();
    await tid('new-expected').fill('20');
    await tid('new-fee').fill('550');
    await tid('time-16:00').click();
    await tid('slot-6').click();
    // The estimate: the centre's rent and Link's commission each on their own line.
    await expect(tid('rent-estimate')).toContainText('إيجار المركز');
    await expect(tid('rent-estimate')).toContainText('عمولة لينك');
    await snap(teacher, 'teacher-J02-request', false);
    await tid('send-request').click();
    await expect(tid('screen-j03')).toBeVisible();
    await expect(teacher.getByText('في انتظار مراجعة مركز النور').first()).toBeVisible();
    await snap(teacher, 'teacher-J03-waiting', false);
  });

  const { requestId } = await story();
  await test.step('2 · Owner (C06 → C03): through the columns, approved, then Booked', async () => {
    await nav.getByRole('link', { name: 'طلبات القاعات' }).click();
    const card = owner.getByTestId(`request-${requestId}`);
    await expect(
      owner.getByTestId('column-requested').getByTestId(`request-${requestId}`),
    ).toBeVisible();
    await snap(owner, 'owner-C06-requested');
    await owner.getByTestId(`move-${requestId}`).click();
    await expect(
      owner.getByTestId('column-phone_call').getByTestId(`request-${requestId}`),
    ).toBeVisible();
    await owner.getByTestId(`move-${requestId}`).click();
    await expect(
      owner.getByTestId('column-meeting').getByTestId(`request-${requestId}`),
    ).toBeVisible();
    await owner.getByTestId(`approve-${requestId}`).click();
    await expect(
      owner.getByTestId('column-approved').getByTestId(`request-${requestId}`),
    ).toBeVisible();
    await expect(card).toContainText('٢٥٠');
    await snap(owner, 'owner-C06-approved');
    await nav.getByRole('link', { name: 'جدول القاعات' }).click();
    await owner.getByTestId('day-6').click();
    await expect(
      owner
        .getByTestId(`hall-row-${id('hall-nour-1')}`)
        .getByTestId('cell-booked')
        .filter({ hasText: 'سلمى' }),
    ).toBeVisible();
    await snap(owner, 'owner-C03-booked');
  });

  const { bookingId } = await story();
  await test.step('3 · Teacher (J05): the group, both fees, seats no more than the hall', async () => {
    // J03 is a stacked screen: back to the teacher's home (My groups).
    await teacher.goto(`${TEACHER_APP}/groups`);
    await expect(tid('screen-t09')).toBeVisible();
    const card = tid(`new-group-${bookingId}`);
    await expect(card).toBeVisible();
    await tid('new-fee-month').fill('550');
    await tid('new-fee-session').fill('150');
    await tid('new-fee-seats').fill('30');
    await tid(`create-group-${bookingId}`).click();
    await expect(card.getByRole('alert')).toBeVisible(); // Room 1 has 24 seats.
    await snap(teacher, 'teacher-J05-seat-cap', false);
    await tid('new-fee-seats').fill('24');
    await tid(`create-group-${bookingId}`).click();
    await expect(card).toHaveCount(0);
  });

  const { groupId } = await story();
  if (!runs(4)) return;
  const parent = await enter(browser, 'parent');
  await test.step('4 · Parent (P02 → P06 → P07 → P08): a seat by card, then the Fawry variant', async () => {
    expect(await seatsLeft(groupId)).toBe(24);
    await parent
      .getByRole('link', { name: /مركز النور/ })
      .first()
      .click();
    await parent.waitForURL(/\/centres\/al-nour-maadi/);
    await ready(parent);
    await snap(parent, 'parent-P04-centre');
    await parent.locator(`a[href*="group=${groupId}"]`).first().click();
    await parent.waitForURL(/\/reserve\?group=/);
    await ready(parent);
    await snap(parent, 'parent-P06-choose');
    await parent.locator('main button').filter({ hasText: 'متابعة للدفع' }).click();
    await parent.waitForURL(/reserve\/draft-/);
    await ready(parent);
    await parent.getByRole('radio', { name: /ادفع لشهر واحد فقط/ }).click();
    // Parents pay no booking fee (and there is never a card field in Link).
    await expect(parent.locator('input[autocomplete^="cc-"]')).toHaveCount(0);
    await snap(parent, 'parent-P07-pay');
    await parent.getByRole('button', { name: /^ادفع .* واحجز$/ }).click();
    if (MODE === 'live') {
      // The provider's hosted page (fake-pay): it simulates the result; no card field anywhere.
      await parent.waitForURL(/:8091\/checkout\//);
      await expect(parent.locator('input[autocomplete^="cc-"], input[name*="card"]')).toHaveCount(
        0,
      );
      await parent.getByTestId('fake-pay-succeed').click();
    } else {
      await parent.waitForURL(/mock-checkout/);
      await ready(parent);
      await snap(parent, 'parent-mock-provider');
      await parent.getByRole('button', { name: 'تجربة دفع ناجح' }).click();
    }
    await parent.waitForURL(/\/done$/);
    await expect(parent.getByRole('heading', { name: 'تم حجز المكان!' })).toBeVisible({
      timeout: 20_000,
    });
    await snap(parent, 'parent-P08-reserved');
    expect(await seatsLeft(groupId)).toBe(23);
    // The Fawry variant, for Youssef: the seat is held for 24 hours.
    await parent.goto(`/ar/teachers/salma-fathy-maths/reserve?group=${groupId}`);
    await ready(parent);
    await parent.getByRole('button', { name: 'تغيير' }).click();
    await parent.getByRole('radio', { name: /يوسف/ }).click();
    await parent.locator('main button').filter({ hasText: 'متابعة للدفع' }).click();
    await parent.waitForURL(/reserve\/draft-/);
    await ready(parent);
    await parent.getByRole('radio', { name: /ادفع لشهر واحد فقط/ }).click();
    await parent.getByRole('radio', { name: /^فوري/ }).click();
    await parent.getByRole('button', { name: /^ادفع .* واحجز$/ }).click();
    await parent.waitForURL(/\/done$/);
    await expect(parent.getByText('مكانك محجوز لمدة ٢٤ ساعة')).toBeVisible();
    await snap(parent, 'parent-P08-fawry');
  });

  if (!runs(5)) return;
  await test.step('5 · Teacher (J06, J07): the new enrolment; earnings with Link commission on its own line', async () => {
    await teacher.goto(`${TEACHER_APP}/groups`);
    await tid('open-enrolments').click();
    await expect(tid('screen-j06')).toBeVisible();
    await expect(teacher.getByText('مريم حسن').first()).toBeVisible();
    await snap(teacher, 'teacher-J06-enrolments', false);
    await teacher.goto(`${TEACHER_APP}/earnings`);
    await expect(tid('commission')).toContainText('عمولة لينك');
    await snap(teacher, 'teacher-J07-earnings', false);
  });

  if (!runs(6)) return;
  await test.step('6 · Owner (C07): rent income, Link fee on its own line, net from the data', async () => {
    await nav.getByRole('link', { name: 'دخل الإيجار' }).click();
    await expect(owner.getByRole('columnheader', { name: /رسوم لينك/ })).toBeVisible();
    await expect(
      owner.getByTestId('rent-row').filter({ hasText: 'قاعة ١' }).filter({ hasText: 'سلمى' }),
    ).toBeVisible();
    await snap(owner, 'owner-C07-rent-income');
  });

  if (!runs(7)) return;
  await test.step('7 · Parent (P10) after the first session; Owner (C04) replies', async () => {
    // Demo control: the first session has taken place (the story group's calendar moves a week).
    expect((await outside('/__demo/story/session-done')).ok).toBe(true);
    const { enrolmentId } = await story();
    await parent.goto('/ar/children');
    await ready(parent);
    // P06 switched to Youssef for the Fawry seat: back to Mariam.
    await parent
      .getByRole('group', { name: 'اختر الابن' })
      .getByRole('button', { name: /مريم/ })
      .click();
    await parent.locator(`a[href$="/enrolments/${enrolmentId}/feedback"]`).click();
    await parent.waitForURL(/\/feedback$/);
    await ready(parent);
    const rate = parent.getByRole('radiogroup', { name: /^قيّم / });
    await rate.nth(0).getByRole('radio').nth(4).click();
    await parent.getByRole('textbox').first().fill('أ. سلمى بتشرح كل خطوة وبتتأكد إن مريم فهمت.');
    await snap(parent, 'parent-P10-review');
    await parent.getByRole('button', { name: 'إرسال الرأي' }).click();
    await expect(parent.getByRole('heading', { name: 'شكرًا لك' })).toBeVisible();
    await nav.getByRole('link', { name: 'التقييمات' }).click();
    const review = owner.locator('[data-testid^="review-"]').filter({ hasText: 'بتشرح كل خطوة' });
    const rid = (await review.getAttribute('data-testid'))!.replace('review-', '');
    await owner.getByTestId(`reply-${rid}`).click();
    await review.getByRole('textbox').fill('شكرًا لكم — سعداء إن مريم مستمتعة بالمجموعة.');
    await owner.getByTestId(`send-reply-${rid}`).click();
    await expect(review.getByTestId('review-reply')).toBeVisible();
    await snap(owner, 'owner-C04-reply');
  });

  if (!runs(8)) return;
  const reception = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await test.step('8 · Follow-up: two absences → a flag → Reception → the parent sees the update', async () => {
    // The teacher records the first session by typing, with Mariam absent.
    const recordSession = async (shotName?: string) => {
      await teacher.goto(`${TEACHER_APP}/today`);
      await expect(tid('record-due')).toContainText('٢ ثانوي');
      await tid('complete-record').click();
      await expect(tid('screen-t02')).toBeVisible();
      await tid('att-chd-mariam-absent').click();
      if (shotName) await snap(teacher, shotName, false);
      await tid('to-scores').click();
      await tid('to-observation').click();
      await tid('typed-note').fill('مريم غابت عن الحصة.');
      await tid('to-review').click();
      await expect(tid('screen-t05')).toBeVisible();
      await expect(tid('confirm-record')).toBeEnabled();
      await tid('confirm-record').click();
      await expect(tid('screen-t06')).toBeVisible({ timeout: 30_000 });
    };
    await recordSession('teacher-T02-absent');
    // Demo control: the next Saturday has taken place too.
    expect((await outside('/__demo/story/session-done')).ok).toBe(true);
    await recordSession();
    // The owner's Today shows the flag, assigned to Reception.
    await nav.getByRole('link', { name: 'اليوم' }).click();
    await expect(owner.getByText('مريم حسن').first()).toBeVisible();
    await snap(owner, 'owner-A01-flag');
    // Reception approves the parent message.
    await reception.goto('/ar/centre');
    await reception.getByRole('button', { name: /استقبال/ }).click();
    await reception.waitForURL(/\/centre\/cen-nour\//);
    const c = (await (await fetch(`${API}/__demo/state/en`)).json()).cases.find(
      (x: { student: string; status: string }) =>
        x.student === 'Mariam Hassan' && x.status !== 'resolved',
    );
    expect(c.assignee).toBe('Dina Adel');
    await reception.goto(`/ar/centre/cen-nour/follow-ups/${c.id}`);
    await reception.getByTestId('draft-message').click();
    await expect(reception.getByTestId('grounded')).toBeVisible();
    await reception.locator('#checked-facts').click();
    await reception.getByTestId('approve').click();
    await expect(reception.getByTestId('delivery-status')).toBeVisible();
    await snap(reception, 'reception-A09-approved');
    // The outside world: the provider sends and delivers it.
    await outside('/__demo/provider', { outcome: 'advance' });
    await outside('/__demo/provider', { outcome: 'advance' });
    await parent.goto('/ar/children');
    await ready(parent);
    await expect(parent.getByTestId('updates-feed').first()).toBeVisible();
    await snap(parent, 'parent-P09-update');
    // Reception logs the outcome.
    await reception.goto(`/ar/centre/cen-nour/follow-ups/${c.id}/outcome`);
    await reception.getByTestId('outcome-method').selectOption('phone');
    await reception.getByTestId('outcome-result').selectOption('reached');
    await reception.getByTestId('save-outcome').click();
    await expect(reception.getByTestId('outcome-history')).toBeVisible();
    await snap(reception, 'reception-A10-outcome');
  });

  if (!runs(9)) return;
  await test.step('9 · Follow-up extra off: gone for owner, teacher and parent; the marketplace works', async () => {
    expect((await outside('/__demo/story/extra', { on: false })).ok).toBe(true);
    await owner.reload();
    await ready(owner);
    await expect(nav.getByRole('link', { name: 'المتابعات', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'جدول القاعات' })).toBeVisible();
    await axe(owner);
    await snap(owner, 'owner-extra-off');
    // The teacher's Follow-up page now leads to My groups, and its tab is gone.
    await teacher.goto(`${TEACHER_APP}/today`);
    await expect(tid('screen-t09')).toBeVisible();
    await expect(teacher.getByRole('tab', { name: 'المتابعة' })).toHaveCount(0);
    await snap(teacher, 'teacher-extra-off', false);
    await parent.reload();
    await ready(parent);
    await expect(parent.getByTestId('updates-feed')).toHaveCount(0);
    await snap(parent, 'parent-extra-off');
    // The marketplace still works: the group is still on the centre's page.
    await parent.goto('/ar/centres/al-nour-maadi');
    await expect(parent.locator(`a[href*="group=${groupId}"]`).first()).toBeVisible();
  });
});

test.afterAll(async () => {
  // Leave the demo as it starts for the other suites and the people using it.
  await outside('/__demo/story/reset');
});
