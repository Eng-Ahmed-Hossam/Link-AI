// docs/testing/walkthrough.md, tour 4 (the pilot), followed click by click on the pilot e2e server.
// The guide runs it on the practice centre; the server here has the same synthetic sample roster.
// Runs after pilot.spec.ts and routes.spec.ts on the same server, so it works with the second
// teacher (كريم) and a new Reception person, whose sessions and PINs those leave untouched.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';

const WEB = 'http://127.0.0.1:9443';
const TEACHER = 'http://127.0.0.1:9444';
const HERE = dirname(fileURLToPath(import.meta.url));
const ownerPin = () =>
  readFileSync(join(HERE, '..', '.e2e-data', 'owner-pin.e2e.txt'), 'utf8').trim();

async function signInAs(page: Page, name: string, pin: string) {
  await page.goto('/ar/centre');
  await page.getByText(name, { exact: true }).click();
  await page.getByTestId('pilot-pin').fill(pin);
  await page.getByTestId('pilot-sign-in').click();
}

async function web(browser: Browser) {
  return (
    await browser.newContext({ baseURL: WEB, viewport: { width: 1440, height: 1000 } })
  ).newPage();
}

const pins: { reception?: string; teacher?: string } = {};

test.describe.configure({ mode: 'serial' });

test('Tour 4 · Pilot', async ({ browser }) => {
  test.setTimeout(600_000);
  const owner = await web(browser);

  await test.step('L4.2 a wrong PIN says how many tries are left; the right one opens Today', async () => {
    await signInAs(owner, 'هالة', ownerPin() === '111222' ? '333444' : '111222');
    await expect(owner.getByText(/رمز خاطئ\. متبقية/)).toBeVisible();
    await owner.getByTestId('pilot-pin').fill(ownerPin());
    await owner.getByTestId('pilot-sign-in').click();
    await expect(owner).toHaveURL(/\/ar\/centre\/cen-pilot\/today$/);
  });

  await test.step('L4.3 add Reception and set the teacher PIN; each PIN shown once', async () => {
    await owner.goto('/ar/centre/cen-pilot/staff');
    await owner.getByTestId('add-name').fill('سارة');
    await owner.getByTestId('add-role').selectOption('reception');
    await owner.getByRole('button', { name: 'أضف واعرض الرمز' }).click();
    pins.reception = (await owner.getByTestId('shown-pin').textContent())!.trim();
    expect(pins.reception).toMatch(/^\d{6}$/);
    const karim = owner.locator('tr', { hasText: 'كريم' });
    await karim.getByRole('button', { name: 'حدّد الرمز' }).click();
    await expect(owner.getByText('رمز كريم')).toBeVisible();
    pins.teacher = (await owner.getByTestId('shown-pin').textContent())!.trim();
    await owner.reload();
    await expect(owner.getByTestId('shown-pin')).toHaveCount(0);
  });

  await test.step('L4.2 five wrong PINs lock the account for 15 minutes', async () => {
    // A throwaway person, so nobody the tour needs is locked out.
    await owner.getByTestId('add-name').fill('قفل');
    await owner.getByTestId('add-role').selectOption('reception');
    await owner.getByRole('button', { name: 'أضف واعرض الرمز' }).click();
    const right = (await owner.getByTestId('shown-pin').textContent())!.trim();
    const wrong = right === '111222' ? '333444' : '111222';
    const p = await web(browser);
    await signInAs(p, 'قفل', wrong);
    for (let i = 0; i < 4; i++) {
      // Each answer clears the PIN field: wait for it before the next try.
      await expect(p.getByText(/^رمز خاطئ\./)).toBeVisible();
      await expect(p.getByTestId('pilot-pin')).toHaveValue('');
      await p.getByTestId('pilot-pin').fill(wrong);
      await p.getByTestId('pilot-sign-in').click();
    }
    await expect(p.getByTestId('pilot-pin')).toHaveValue('');
    // Locked now: even the right PIN is refused until the 15 minutes are up.
    await p.getByTestId('pilot-pin').fill(right);
    await p.getByTestId('pilot-sign-in').click();
    await expect(p.getByText(/رموز خاطئة كثيرة\. حاول مرة أخرى بعد/)).toBeVisible();
    await expect(p).toHaveURL(/\/ar\/centre$/);
    await p.context().close();
  });

  await test.step('L4.4 the teacher confirms two sessions by tap with نور absent', async () => {
    const ctx = await browser.newContext({
      baseURL: TEACHER,
      viewport: { width: 390, height: 844 },
    });
    const t = await ctx.newPage();
    await t.goto('/');
    const people = await (await t.request.get('/v1/pilot/people')).json();
    const karim = people.find((x: { displayName: string }) => x.displayName === 'كريم').id;
    await t.getByTestId(`pilot-person-${karim}`).click();
    await t.getByTestId('pilot-pin').fill(pins.teacher!);
    await t.getByTestId('pilot-sign-in').click();
    await expect(t.getByTestId('screen-today')).toBeVisible();
    const confirm = async () => {
      await t.getByRole('button', { name: 'سجّل الباقين حاضرين' }).click();
      await t.getByTestId('att-stu-p-S07-absent').click();
      await t.getByRole('button', { name: 'التالي: الدرجات' }).click();
      await t.getByTestId('no-assessment').click();
      await expect(t.getByText('اكتب الملاحظة بدلًا من ذلك')).toBeVisible();
      await t.getByTestId('to-review').click();
      await t.getByRole('button', { name: 'تأكيد وحفظ السجل' }).click();
      await expect(t.getByTestId('screen-t06')).toBeVisible();
    };
    await t.getByRole('button', { name: 'سجّل هذه الحصة' }).first().click(); // the older one
    await confirm();
    await t.goto('/today');
    await t.getByRole('button', { name: 'أكمل سجل الحصة' }).click(); // the latest one
    await confirm();
    await expect(t.getByTestId('raised-flag')).toContainText('نور');
    await ctx.close();
  });

  const rec = await web(browser);
  await test.step('L4.5 Reception: approve, copy, "I sent it" — never "Delivered"', async () => {
    await signInAs(rec, 'سارة', pins.reception!);
    await expect(rec).toHaveURL(/\/today$/);
    const cases = (await (await rec.request.get('/v1/cases')).json()).data as {
      id: string;
      signal: { student: { displayName: string } };
    }[];
    const nour = cases.find((c) => c.signal.student.displayName === 'نور')!;
    await rec.goto(`/ar/centre/cen-pilot/follow-ups/${nour.id}`);
    await rec.getByRole('button', { name: 'صِغ رسالة لوليّ الأمر' }).click();
    await expect(rec.getByTestId('grounded')).toBeVisible();
    await rec.getByText('راجعت الطالب ووليّ الأمر والتواريخ').click();
    await rec.getByRole('button', { name: 'اعتمد (ثم ترسلها أنت)' }).click();
    await expect(rec.getByTestId('delivery-status')).toHaveText('معتمدة — لم تُرسل بعد');
    await rec.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await rec.getByRole('button', { name: 'انسخ الرسالة' }).click();
    await rec.getByRole('button', { name: 'أرسلتها من واتساب المركز' }).click();
    await expect(rec.getByTestId('delivery-status')).toHaveText('معتمدة — أرسلها يدويًا سارة');
    await expect(rec.getByTestId('status-history')).not.toContainText('وصلت');
    await expect(rec.getByTestId('status-history')).not.toContainText('قُرئت');
  });

  await test.step('L4.6 log the reply; the case waits for confirmation', async () => {
    await rec.getByTestId('log-reply').click(); // «سجّل ردّ وليّ الأمر»
    await expect(rec.getByTestId('outcome-method')).toHaveValue('whatsapp_manual');
    await expect(rec.getByTestId('outcome-result')).toHaveValue('replied');
    await rec.getByTestId('outcome-learned').fill('سترجع الحصة القادمة');
    await rec.getByTestId('save-outcome').click();
    await expect(rec.getByText('بانتظار التأكيد').first()).toBeVisible();
  });

  await test.step('L4.7 the voice card: off unless switched on per teacher', async () => {
    await owner.goto('/ar/centre/cen-pilot/staff');
    await expect(owner.getByTestId('voice-card')).toBeVisible();
    await expect(owner.locator('tr', { hasText: 'كريم' })).toContainText('الصوت متوقف');
  });
  await owner.context().close();
  await rec.context().close();
});
