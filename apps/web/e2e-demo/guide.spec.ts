// docs/testing/walkthrough.md, tours 1–3, followed click by click on `pnpm demo` (Arabic, as the
// guide is). Each `test.step` carries the guide's step ID; the last test checks that every step in
// the guide is either here (or in apps/pilot/e2e/tour.spec.ts) or marked "Manual".
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { C, TEACHER_APP, demoState, ready, resetScenario, setDemo } from './helpers';

const ROOT = join(__dirname, '..', '..', '..');
const GUIDE = join(ROOT, 'docs', 'testing', 'walkthrough.md');

let before: Record<string, unknown>;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  before = (await demoState()).demo;
  await resetScenario();
});
test.afterAll(async () => {
  await resetScenario(before);
});

/** The amber Demo controls panel on any web page; `label` is the button to press. */
async function demoControl(page: Page, label: string | RegExp) {
  await page.getByRole('button', { name: 'Demo controls' }).click();
  const dialog = page.getByRole('dialog', { name: 'Demo controls' });
  await dialog.getByRole('button', { name: label }).click();
  await expect(dialog.getByRole('status')).toContainText('done');
  await dialog.getByRole('button', { name: 'Close' }).click();
}

async function holdMic(page: Page, ms: number) {
  const box = (await page.getByTestId('record-button').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

async function webPage(browser: Browser, viewport = { width: 1440, height: 1000 }) {
  const ctx = await browser.newContext({ viewport, permissions: ['microphone'] });
  return ctx.newPage();
}

test('Tour 1 · Teacher', async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext({
    baseURL: TEACHER_APP,
    viewport: { width: 390, height: 844 },
    permissions: ['microphone'],
  });
  const t = await ctx.newPage();
  const id = (x: string) => t.getByTestId(x);
  // A fresh device in Arabic (the guide's private window).
  await t.addInitScript(() => {
    if (sessionStorage.getItem('guide.prepared')) return;
    sessionStorage.setItem('guide.prepared', '1');
    localStorage.clear();
    localStorage.setItem('link.locale', 'ar');
  });

  await test.step('T1.1 sign in as the sample teacher', async () => {
    await t.goto('/sign-in');
    await t.getByRole('button', { name: 'الدخول باسم أ. سلمى (معلّمة تجريبية)' }).click();
    await expect(t.getByText('يومك التعليمي').first()).toBeVisible();
    await expect(t.getByText('السجل مطلوب')).toBeVisible();
  });
  await test.step('T1.2 complete session record: nothing pre-selected', async () => {
    await t.getByRole('button', { name: 'أكمل سجل الحصة' }).click();
    await expect(id('screen-t02')).toBeVisible();
    await expect(t.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(t.getByText('غير مسجَّل', { exact: true })).toHaveCount(18);
  });
  await test.step('T1.3 Mariam absent, save a draft', async () => {
    await id('att-chd-mariam-absent').click();
    await t.getByRole('button', { name: 'حفظ كمسودة' }).click();
    await expect(
      t.getByText('تم حفظ المسودة. غير مؤكَّدة — القواعد لا تعمل على المسودات.'),
    ).toBeVisible();
    await expect(t.getByText('غير مسجَّل', { exact: true })).toHaveCount(17);
  });
  await test.step('T1.4 mark the rest present, continue to scores', async () => {
    await t.getByRole('button', { name: 'سجّل الباقين حاضرين' }).click();
    await t.getByRole('button', { name: 'التالي: الدرجات' }).click();
    await expect(t.getByText('هل توجد درجات لإضافتها؟').first()).toBeVisible();
    await expect(id('score-absent-chd-mariam')).toBeVisible();
  });
  await test.step('T1.5 24 out of 20 is blocked, never capped', async () => {
    await id('assessment-title').fill('Quiz');
    await id('assessment-max').fill('20');
    await id('score-stu-omar').fill('24');
    await expect(
      t.getByText('٢٤ أكبر من الدرجة القصوى ٢٠. صحّحها — Link لا يغيّر الدرجة من تلقاء نفسه.'),
    ).toBeVisible();
    await expect(id('score-stu-omar')).toHaveValue('24');
    await expect(id('to-observation')).toBeDisabled();
  });
  await test.step('T1.6 a blank score stays blank; continue', async () => {
    await id('score-stu-omar').fill('');
    await t.getByRole('button', { name: 'التالي: الملاحظات' }).click();
    await expect(id('screen-t04')).toBeVisible();
    await expect(t.getByRole('button', { name: 'سجّل ملاحظة صوتية' })).toBeVisible();
  });
  await test.step('T1.7 hold to record a voice note', async () => {
    await t.getByRole('button', { name: 'سجّل ملاحظة صوتية' }).click();
    await expect(id('screen-v01')).toBeVisible();
    await expect(t.getByText('لا يُحفظ شيء قبل أن تراجع ما فهمه الذكاء الاصطناعي.')).toBeVisible();
    await holdMic(t, 2500);
    await expect(id('screen-v02')).toBeVisible({ timeout: 30_000 });
    await expect(t.getByText('هذا ما فهمه Link').first()).toBeVisible();
  });
  await test.step('T1.8 receipt only; high accepted, medium "Check", low blank', async () => {
    await expect(id('receipt')).toContainText('إيصال فقط');
    await expect(id('item-vi-2')).toContainText('راجِع');
    await expect(id('item-vi-3-value')).toHaveText('—');
    await id('item-vi-1').getByRole('button', { name: 'قبول' }).click();
  });
  await test.step('T1.9 the ambiguous «أحمد»: nothing saved, nothing pre-selected', async () => {
    await id('identity-vi-2').click();
    await expect(id('screen-t07')).toBeVisible();
    await expect(id('screen-t07').getByText('لم يُحفظ شيء', { exact: true })).toBeVisible();
    await expect(id('screen-t07').getByRole('radio')).toHaveCount(2);
    await expect(id('screen-t07').getByRole('radio', { checked: true })).toHaveCount(0);
    await id('candidate-stu-ahmed-samir').click();
    await id('use-candidate').click();
    await expect(id('screen-v02')).toBeVisible();
  });
  await test.step('T1.10 decide every item, then add to the record', async () => {
    await id('item-vi-2').getByRole('button', { name: 'قبول' }).click();
    await expect(id('apply-voice')).toBeDisabled();
    await id('edit-vi-3').fill('نراجع قواعد الإشارات الحصة الجاية');
    await id('use-vi-3').click();
    await expect(id('apply-voice')).toBeDisabled(); // the unmentioned students are still undecided
    await id('unmentioned-present').click();
    await id('apply-voice').click();
    await expect(id('screen-t05')).toBeVisible();
  });
  await test.step('T1.11 confirm: saved, and a follow-up for Mariam', async () => {
    await t.getByRole('button', { name: 'تأكيد وحفظ السجل' }).click();
    await expect(id('screen-t06')).toBeVisible();
    await expect(t.getByText('تم حفظ سجل الحصة').first()).toBeVisible();
    await expect(t.getByText('هذا السجل أنشأ متابعة لإدارة المركز')).toBeVisible();
    await expect(id('raised-flag')).toContainText('مريم');
  });
  await test.step('T1.12 a correction keeps the original', async () => {
    await t.goto('/records');
    const rec = (await demoState()).signals
      .find((s: { student: string }) => s.student === 'Mariam Hassan')
      .evidence.at(-1).recordId as string;
    await id(`correct-${rec}`).click();
    await id('correct-student-stu-omar').click();
    await t.getByRole('radio', { name: 'الدرجة' }).click();
    await id('correct-value').fill('12');
    await id('correct-reason').fill('خطأ في الكتابة');
    await id('submit-correction').click();
    const c = t.getByTestId(/^correction-/).first();
    await expect(c).toContainText('عمر علي');
    await expect(c).toContainText('خطأ في الكتابة');
    await expect(c).toContainText('الأصل محفوظ في السجل');
  });
  await test.step('T1.13 offline: the recording waits on the device, then uploads', async () => {
    // The next session's record (Today offers the one still missing).
    await t.goto('/today');
    await t
      .getByRole('button', { name: /سجّل هذه الحصة|أكمل سجل الحصة/ })
      .first()
      .click();
    await t.getByRole('button', { name: 'التالي: الدرجات' }).click();
    await t.getByRole('button', { name: 'التالي: الملاحظات' }).click();
    await setDemo({ offline: true }); // Demo controls → Offline: on
    await t.getByRole('button', { name: 'سجّل ملاحظة صوتية' }).click();
    await holdMic(t, 2000);
    await expect(t.getByText('محفوظة على هذا الجهاز').first()).toBeVisible({ timeout: 30_000 });
    await t.getByRole('button', { name: 'العودة إلى السجل' }).click();
    await expect(t.getByText('تنتظر الرفع', { exact: true })).toBeVisible();
    await setDemo({ offline: false }); // Offline: off
    await expect(t.getByText('جاهزة للمراجعة', { exact: true })).toBeVisible({ timeout: 30_000 });
  });
  await ctx.close();
});

test('Tour 2 · Owner and Reception', async ({ browser }) => {
  test.setTimeout(300_000);
  const p = await webPage(browser);
  const id = (x: string) => p.getByTestId(x);
  // Case ids follow the scenario's dates, so cases are found by the student.
  const caseOf = async (student: string) =>
    (await demoState()).cases.find((c: { student: string }) => c.student === student).id as string;
  const mariam = () => caseOf('Mariam Hassan');

  await test.step('O2.1 Reception signs in: Today', async () => {
    await p.goto('/ar/centre');
    await p.getByRole('button', { name: 'الدخول كموظفة استقبال (دينا عادل، تجريبي)' }).click();
    await expect(p).toHaveURL(/\/ar\/centre\/cen-nour\/today$/);
    await expect(p.getByText('مريم حسن').first()).toBeVisible();
    await expect(id('kpi-overdue')).toBeVisible();
  });
  await test.step('O2.2 follow-ups: reason, rule, owner, due', async () => {
    await p.getByRole('link', { name: 'المتابعات', exact: true }).click();
    await expect(p).toHaveURL(/\/follow-ups$/);
    await expect(id(`case-row-${await mariam()}`)).toContainText('(الإصدار ١)');
    await id('filter-overdue').click();
    await expect(id(`case-row-${await caseOf('Nour Khaled')}`)).toBeVisible();
  });
  await test.step('O2.3 why this appeared', async () => {
    await p.goto(`${C('ar')}/follow-ups/${await mariam()}`);
    await expect(p.getByRole('heading', { name: 'لماذا ظهرت هذه المتابعة' })).toBeVisible();
    await expect(p.getByText(/^الحضور • .* • غائب$/)).toHaveCount(2);
    await expect(p.getByText('الحصتان أكّدتهما أ. سلمى فتحي')).toBeVisible();
    await expect(p.getByText('القاعدة المستخدمة (الإصدار ١)')).toBeVisible();
    await expect(id('case-assignee')).toBeVisible();
  });
  await test.step('O2.4 Ask Link drafts, never sends', async () => {
    await id('open-assistant').click();
    await expect(id('assistant-panel')).toBeVisible();
    await id('assistant-input').fill('اعتمدها وابعتها دلوقتي');
    await id('assistant-send').click();
    await expect(id('assistant-panel')).toContainText('إجراء — يحتاج اعتمادك');
    expect((await demoState()).messages).toHaveLength(0);
    await id('assistant-input').fill('ابعت لولي أمر مريم إنها غابت حصتين');
    await id('assistant-send').click();
    await expect(id('assistant-draft')).toBeVisible({ timeout: 20_000 });
  });
  await test.step('O2.5 review: the tick is required; approved text is locked', async () => {
    await id('assistant-draft').getByRole('link').click();
    await expect(id('grounded')).toBeVisible();
    await expect(id('approve')).toBeDisabled();
    await p.getByText('راجعت الطالب ووليّ الأمر والتواريخ').click();
    await id('approve').click();
    await expect(id('final-text')).toBeVisible();
    await expect(p.getByText('مقفلة بعد الاعتماد')).toBeVisible();
  });
  await test.step('O2.6 Delivered only after the provider says so', async () => {
    await expect(id('status-history')).not.toContainText('وصلت');
    await demoControl(p, 'Advance: Sent → Delivered');
    await demoControl(p, 'Advance: Sent → Delivered');
    await expect(id('status-history')).toContainText('وصلت');
  });
  await test.step('O2.7 the parent replies; nothing pre-ticked', async () => {
    await demoControl(p, /Deliver reply/);
    await p.goto(`${C('ar')}/follow-ups/${await mariam()}`);
    await id('open-reply').click();
    await expect(id('reply-summary')).toBeVisible();
    await expect(p.getByRole('checkbox', { checked: true })).toHaveCount(0);
  });
  await test.step('O2.8 outcome recorded; the case stays open', async () => {
    await p.locator('#step-record_outcome').click();
    await id('apply-steps').click();
    await id('outcome-method').selectOption('phone');
    await id('outcome-result').selectOption('reached');
    await id('save-outcome').click();
    await expect(id('outcome-history')).toBeVisible();
    await expect(p.getByText('بانتظار التأكيد').first()).toBeVisible();
  });
  await test.step('O2.9 dismiss needs a reason; reopen', async () => {
    await p.goto(`${C('ar')}/follow-ups/${await caseOf('Nour Khaled')}`);
    await id('dismiss').click();
    await expect(id('confirm-dismiss')).toBeDisabled();
    await id('dismiss-reason').fill('سفر عائلي أكّده وليّ الأمر');
    await id('confirm-dismiss').click();
    await expect(p.getByText('يبقى التنبيه في سجل النشاط ويمكن إعادة فتحه.')).toBeVisible();
    await id('reopen').click();
    await expect(id('draft-message')).toBeVisible();
  });
  await test.step('O2.10 Reception proposes, the owner approves', async () => {
    await p.goto(`${C('ar')}/rules`);
    await id('param-consecutive_absences-n').fill('3');
    await id('save-consecutive_absences').click();
    await expect(id('rule-consecutive_absences')).toContainText('تعديل مقترح — بانتظار المالك');
    await expect(id('rule-consecutive_absences')).toContainText('القاعدة الإصدار ١');
    await p.getByRole('button', { name: 'تسجيل الخروج' }).click();
    await p.getByRole('button', { name: 'الدخول كمالك (تامر فؤاد، تجريبي)' }).click();
    await expect(p).toHaveURL(/\/today$/);
    await p.goto(`${C('ar')}/rules`);
    await p.getByRole('button', { name: 'وافق على التعديل' }).click();
    await expect(id('rule-consecutive_absences')).toContainText('القاعدة الإصدار ٢');
  });
  await test.step('O2.11 only the owner invites', async () => {
    await p.goto(`${C('ar')}/staff`);
    await expect(id('role-matrix')).toBeVisible();
    await id('invite-phone').fill('010 0000 0077');
    await p.getByRole('combobox').first().selectOption('teacher');
    await id('send-invite').click();
    await expect(p.getByText('الدعوة قيد الانتظار')).toBeVisible();
  });
  await test.step('O2.12 activity history is append-only', async () => {
    await p.goto(`${C('ar')}/activity`);
    await expect(id('week-counts')).toBeVisible();
    await id('activity-corrections').click();
    await expect(id('activity-event').first()).toContainText('عمر علي');
  });
  await p.context().close();
});

test('Tour 3 · Parent', async ({ browser }) => {
  test.setTimeout(300_000);
  await setDemo({ marketplace: true }); // Demo controls → Marketplace flag: on
  const p = await webPage(browser, { width: 390, height: 844 });
  const main = p.locator('main');

  await test.step('P3.1 OTP sign-in: a wrong code says what is left', async () => {
    await p.goto('/ar/welcome');
    await ready(p);
    await p.locator('input[type=tel]').fill('1000000001');
    await p.getByRole('button', { name: 'ابعت لي الكود' }).click();
    await p.locator('input[autocomplete=one-time-code]').fill('111111');
    await expect(p.getByText(/محاولات|محاولة/).first()).toBeVisible();
    await p.locator('input[autocomplete=one-time-code]').fill('123456');
    await expect(p).not.toHaveURL(/welcome/);
    await expect(p.locator('input[type=password]')).toHaveCount(0);
  });
  await test.step('P3.2 search and results', async () => {
    await p.goto('/ar/search');
    await ready(p);
    await expect(main.getByRole('heading').first()).toBeVisible();
    await p.goto('/ar/search/results');
    await ready(p);
    await expect(main.getByText('مركز النور').first()).toBeVisible();
  });
  await test.step('P3.3 centre profile: each teacher sets their fee', async () => {
    await p.goto('/ar/centres/al-nour-maadi');
    await ready(p);
    await expect(p.getByText('كل معلّم يحدد سعره. تحجز وتدفع للمعلّم من خلال Link.')).toBeVisible();
  });
  await test.step('P3.4 teacher → choose group and session → continue', async () => {
    await p.goto('/ar/teachers/salma-fathy-maths');
    await ready(p);
    await main
      .getByRole('link', { name: /احجز مع/ })
      .first()
      .click();
    await ready(p);
    await expect(main.getByText(/متبقٍ|متبقية|متبق/).first()).toBeVisible();
    await main.getByRole('button', { name: 'متابعة للدفع' }).click();
    await p.waitForURL(/reserve\/draft-/);
  });
  await test.step('P3.5 pay by card: confirming, then reserved', async () => {
    await ready(p);
    await expect(main.getByText('رسوم الحجز')).toBeVisible();
    await expect(p.getByRole('checkbox', { checked: true })).toHaveCount(0);
    await main.getByRole('button', { name: /^(ادفع .* واحجز)$/ }).click();
    await p.waitForURL(/mock-checkout/);
    await expect(p.locator('input[autocomplete^=cc-]')).toHaveCount(0);
    await p.getByRole('button', { name: 'تجربة دفع ناجح' }).click();
    await p.waitForURL(/\/done$/);
    await expect(p.getByRole('heading', { name: 'تم حجز المكان!' })).toBeVisible({
      timeout: 20_000,
    });
  });
  await test.step('P3.6 Fawry: a reference code valid 24 hours', async () => {
    await p.goto('/ar/teachers/karim-adel-maths/reserve?group=grp-karim-nour');
    await ready(p);
    await main.getByRole('button', { name: 'متابعة للدفع' }).click();
    await p.waitForURL(/reserve\/draft-/);
    await ready(p);
    await p.getByRole('radio', { name: /^ادفع لشهر واحد فقط/ }).click();
    await p.getByRole('radio', { name: /^فوري/ }).click();
    await main.getByRole('button', { name: /^(ادفع .* واحجز)$/ }).click();
    await expect(p.getByText('كود فوري المرجعي')).toBeVisible({ timeout: 20_000 });
    await expect(p.getByText(/الكود صالح حتى/)).toBeVisible();
  });
  await test.step('P3.8 my children: only approved updates', async () => {
    await p.goto('/ar/children');
    await ready(p);
    await expect(p.getByTestId('updates-feed')).toContainText('مريم');
  });
  await test.step('P3.9 feedback: teacher first, public or private', async () => {
    await p.goto('/ar/enrolments/enr-mariam-phys/feedback');
    await ready(p);
    await expect(main.getByRole('heading').first()).toBeVisible();
    await expect(main.locator('textarea').first()).toBeVisible();
  });
  await p.context().close();
});

test('the guide and its tests agree: every step is tested or marked Manual', () => {
  const guide = readFileSync(GUIDE, 'utf8');
  const ids = [...guide.matchAll(/^\*\*([TOPL]\d\.\d+)\*\*/gm)].map((m) => m[1]!);
  expect(ids.length).toBeGreaterThan(40);
  const specs =
    readFileSync(__filename, 'utf8') +
    readFileSync(join(ROOT, 'apps', 'pilot', 'e2e', 'tour.spec.ts'), 'utf8');
  const body = (step: string) =>
    guide.split(`**${step}**`)[1]!.split(/\n\*\*[TOPL]\d\.\d+\*\*/)[0]!;
  const untested = ids.filter(
    (step) => !specs.includes(`step('${step} `) && !body(step).includes('Manual · يدوي'),
  );
  expect(untested).toEqual([]);
});
