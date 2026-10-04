// Pilot mode end to end, in Arabic (docs/pilot): PIN sign-in, the owner adds Reception and sets the
// teacher's PIN, the teacher confirms two sessions by tap with مريم absent, Reception approves the
// drafted message, sends it from the centre's WhatsApp by hand, logs the reply, and the follow-up
// waits for confirmation. axe on every pilot page in both languages.
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';

const WEB = 'http://127.0.0.1:9443';
const TEACHER = 'http://127.0.0.1:9444';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const SHOTS = join(ROOT, 'docs', 'pilot', 'screenshots');
mkdirSync(SHOTS, { recursive: true });
const ownerPin = () =>
  readFileSync(join(HERE, '..', '.e2e-data', 'owner-pin.e2e.txt'), 'utf8').trim();

async function axe(page: Page) {
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
}
const shot = (page: Page, name: string) =>
  page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

async function webSignIn(browser: Browser, name: string, pin: string, lang = 'ar') {
  const ctx = await browser.newContext({ baseURL: WEB });
  const page = await ctx.newPage();
  await page.goto(`/${lang}/centre`);
  await page.getByText(name, { exact: true }).click();
  await page.getByTestId('pilot-pin').fill(pin);
  await page.getByTestId('pilot-sign-in').click();
  await expect(page).toHaveURL(/\/centre\/cen-pilot\/today$/);
  return page;
}

const state: { reception?: string; teacher?: string } = {};

test.describe.serial('the concierge pilot, end to end', () => {
  test('A1: no demo route, no parent app, no Ask Link; A3: sign-in leaves nothing in the browser', async ({
    browser,
    request,
  }) => {
    expect((await request.get(`${WEB}/__demo/state`)).status()).toBe(404);
    expect((await request.get(`${WEB}/ar/search`)).status()).toBe(404);
    expect((await request.get(`${WEB}/v1/assistant/briefing`)).status()).toBe(404);
    const ctx = await browser.newContext({ baseURL: WEB });
    const page = await ctx.newPage();
    await page.goto('/ar/centre');
    await expect(page.getByRole('heading', { name: 'الدخول إلى مركز تجريبي' })).toBeVisible();
    await axe(page);
    await shot(page, 'P-sign-in.ar');
    // A wrong PIN says how many tries are left.
    await page.getByText('هالة', { exact: true }).click();
    await page.getByTestId('pilot-pin').fill(ownerPin() === '111222' ? '333444' : '111222');
    await page.getByTestId('pilot-sign-in').click();
    await expect(page.getByText(/رمز خاطئ/)).toBeVisible();
    await page.getByTestId('pilot-pin').fill(ownerPin());
    await page.getByTestId('pilot-sign-in').click();
    await expect(page).toHaveURL(/\/today$/);
    const cookies = await ctx.cookies();
    expect(cookies.find((c) => c.name === 'link_pilot_session')).toMatchObject({
      httpOnly: true,
      sameSite: 'Strict',
    });
    const stored = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    expect(stored).not.toContain(ownerPin());
    expect(stored).not.toContain('link_pilot_session');
    await expect(page.getByTestId('open-assistant')).toHaveCount(0);
    await expect(
      page.getByRole('navigation').getByRole('link', { name: 'الملف العام' }),
    ).toHaveCount(0);
    await ctx.close();
  });

  test('A16: the owner adds Reception and sets the teacher PIN; each PIN is shown once', async ({
    browser,
  }) => {
    const page = await webSignIn(browser, 'هالة', ownerPin());
    await page.goto('/ar/centre/cen-pilot/staff');
    await page.getByTestId('add-name').fill('منى');
    await page.getByTestId('add-role').selectOption('reception');
    await page.getByTestId('add-person').click();
    state.reception = (await page.getByTestId('shown-pin').textContent())!.trim();
    expect(state.reception).toMatch(/^\d{6}$/);
    const salwa = page.locator('tr', { hasText: 'سلوى' });
    await expect(salwa).toContainText('غير محدد');
    await salwa.getByRole('button', { name: 'حدّد الرمز' }).click();
    await expect(page.getByText('رمز سلوى')).toBeVisible();
    state.teacher = (await page.getByTestId('shown-pin').textContent())!.trim();
    expect(state.teacher).not.toBe(state.reception);
    await expect(salwa).toContainText('محدد');
    await axe(page);
    await shot(page, 'A16-people.ar');
    await page.reload();
    await expect(page.getByTestId('shown-pin')).toHaveCount(0); // never shown again
  });

  test('Teacher: two sessions confirmed by tap with مريم absent raise the flag; voice says "type instead"', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      baseURL: TEACHER,
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.getByTestId('pilot-person-' + (await teacherId(page))).click();
    await page.getByTestId('pilot-pin').fill(state.teacher!);
    await page.getByTestId('pilot-sign-in').click();
    await expect(page.getByTestId('screen-today')).toBeVisible();
    await shot(page, 'T01-today.ar');
    // The older session through the API (same cookie), the latest one through the screens.
    const today = await (await page.request.get('/v1/teachers/me/today')).json();
    const older = today.needsYou.find((n: { kind: string }) => n.kind === 'missing');
    const rec = await (
      await page.request.post(`/v1/groups/${older.groupId}/session-records`, {
        data: { groupSessionId: older.sessionId },
      })
    ).json();
    await page.request.patch(`/v1/session-records/${rec.id}`, {
      data: {
        entries: rec.entries.map((e: { student: { id: string } }) => ({
          studentId: e.student.id,
          attendance: e.student.id === 'stu-p-S01' ? 'absent' : 'present',
        })),
      },
    });
    expect(
      (
        await page.request.post(`/v1/session-records/${rec.id}/confirm`, {
          headers: { 'idempotency-key': 'e2e-older' },
        })
      ).status(),
    ).toBe(200);

    await page.getByTestId('complete-record').click();
    await page.getByTestId('mark-remaining').click();
    await page.getByTestId('att-stu-p-S01-absent').click();
    await page.getByTestId('to-scores').click();
    await page.getByTestId('no-assessment').click(); // goes straight to the observation step
    await expect(page.getByText('اكتب الملاحظة بدلًا من ذلك')).toBeVisible();
    await expect(page.getByTestId('record-voice')).toHaveCount(0);
    await shot(page, 'T04-type-instead.ar');
    await page.getByTestId('to-review').click();
    await page.getByTestId('confirm-record').click();
    await expect(page.getByTestId('screen-t06')).toBeVisible();
    await expect(page.getByTestId('raised-flag')).toContainText('مريم');
    await shot(page, 'T06-flag.ar');
    await ctx.close();
  });

  test('Reception: draft from confirmed facts → approve → copy → "sent by hand" (never Delivered) → log the reply', async ({
    browser,
  }) => {
    const page = await webSignIn(browser, 'منى', state.reception!);
    await expect(page.getByText('مريم').first()).toBeVisible();
    await axe(page);
    await shot(page, 'A01-today.ar');
    await page.goto('/ar/centre/cen-pilot/follow-ups');
    const cases = (await (await page.request.get('/v1/cases')).json()).data;
    expect(cases).toHaveLength(1);
    await expect(page.getByTestId(`case-row-${cases[0].id}`)).toContainText('مريم');
    await page.goto(`/ar/centre/cen-pilot/follow-ups/${cases[0].id}`);
    await expect(page.getByTestId('case-assignee')).toContainText('منى');
    await page.getByTestId('draft-message').click();
    await expect(page.getByTestId('grounded')).toBeVisible();
    await expect(page.getByTestId('message-text')).toHaveValue(/مركز تجريبي/);
    await expect(page.getByText('الرقم عند المركز')).toBeVisible();
    await axe(page);
    await shot(page, 'A06-review.ar');
    await page.locator('#checked-facts').click();
    await page.getByTestId('approve').click();
    await expect(page.getByTestId('delivery-status')).toHaveText('معتمدة — لم تُرسل بعد');
    await page.getByTestId('copy-message').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('مريم');
    await page.getByTestId('mark-sent').click();
    await expect(page.getByTestId('delivery-status')).toHaveText('معتمدة — أرسلها يدويًا منى');
    await expect(page.getByTestId('status-history')).not.toContainText('وصلت');
    await expect(page.getByTestId('status-history')).not.toContainText('قُرئت');
    await axe(page);
    await shot(page, 'A09-sent-by-hand.ar');
    await page.getByTestId('log-reply').click();
    await expect(page.getByTestId('outcome-method')).toHaveValue('whatsapp_manual');
    await expect(page.getByTestId('outcome-result')).toHaveValue('replied');
    await page.getByTestId('outcome-learned').fill('عندها درس تاني يوم الثلاثاء');
    await page.getByTestId('save-outcome').click();
    await expect(page.getByTestId('outcome-history')).toBeVisible();
    await expect(page.getByText('بانتظار التأكيد').first()).toBeVisible();
    await shot(page, 'A10-awaiting.ar');
  });

  test('CF-34: the owner asks the teacher to correct; it shows on the teacher Today', async ({
    browser,
  }) => {
    const page = await webSignIn(browser, 'هالة', ownerPin());
    const rows = (await (await page.request.get('/v1/centres/cen-pilot/sessions')).json()).data;
    const confirmed = rows.find((r: { status: string }) => r.status === 'confirmed');
    await page.goto(`/ar/centre/cen-pilot/sessions/${confirmed.recordId}`);
    await page.getByTestId('ask-text').fill('تأكدي من غياب مريم');
    await page.getByTestId('ask-teacher-send').click();
    await expect(page.getByTestId('ask-teacher')).toContainText('بانتظار المعلّم');
    await axe(page);
    await shot(page, 'A14-ask-teacher.ar');
  });

  test('axe on every pilot owner page in English too', async ({ browser }) => {
    const page = await webSignIn(browser, 'هالة', ownerPin(), 'en');
    for (const p of [
      'today',
      'follow-ups',
      'students',
      'sessions',
      'communication',
      'rules',
      'activity',
      'staff',
    ]) {
      await page.goto(`/en/centre/cen-pilot/${p}`);
      await expect(page.locator('h1').first()).toBeVisible();
      await axe(page);
    }
    await shot(page, 'A16-people.en');
  });
});

async function teacherId(page: Page): Promise<string> {
  const people = await (await page.request.get('/v1/pilot/people')).json();
  return people.find((p: { displayName: string }) => p.displayName === 'سلوى').id;
}
