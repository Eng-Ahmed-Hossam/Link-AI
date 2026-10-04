// Batch 6 walkthrough (Arabic, both apps) — the Demo Day path on the shared mock server:
// teacher voice note → confirm → flag on A01 → case → Ask Link draft → approve → provider
// "Delivered" → parent feed → reply → V06 → outcome → awaiting confirmation.
import { expect, test, type Page } from '@playwright/test';
import {
  TEACHER_APP,
  WALK,
  axe,
  C,
  demoState,
  provider,
  reply,
  resetScenario,
  shot,
  signIn,
  writeProof,
} from './helpers';

async function holdToRecord(page: Page, ms: number) {
  const box = (await page.getByTestId('record-button').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test('walkthrough (ar): voice note to awaiting confirmation, across the teacher app and the owner web', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  await resetScenario();
  let n = 0;
  const step = (page: Page, name: string) =>
    shot(page, `${String(++n).padStart(2, '0')}-${name}`, WALK);

  // 1. Teacher (Expo web): record a voice note, review, confirm.
  const tctx = await browser.newContext({
    baseURL: TEACHER_APP,
    viewport: { width: 390, height: 844 },
    permissions: ['microphone'],
  });
  const teacher = await tctx.newPage();
  await teacher.addInitScript(() => {
    if (sessionStorage.getItem('e2e.prepared')) return;
    sessionStorage.setItem('e2e.prepared', '1');
    localStorage.clear();
    localStorage.setItem(
      'link.teacher.session',
      JSON.stringify({ accessToken: 'mock.usr-salma', userId: 'usr-salma' }),
    );
    localStorage.setItem('link.locale', 'ar');
  });
  await teacher.goto('/today');
  await teacher.getByTestId('complete-record').click();
  await teacher.getByTestId('to-scores').click();
  await teacher.getByTestId('to-observation').click();
  await teacher.getByTestId('record-voice').click();
  await expect(teacher.getByTestId('screen-v01')).toBeVisible();
  await holdToRecord(teacher, 2500);
  await expect(teacher.getByTestId('screen-v02')).toBeVisible({ timeout: 30_000 });
  await expect(teacher.getByTestId('transcript')).toContainText('مريم غابت النهارده');
  await step(teacher, 'teacher-v02-understood');
  await teacher.getByTestId('item-vi-1').getByRole('button', { name: 'قبول' }).click();
  await teacher.getByTestId('identity-vi-2').click();
  await teacher.getByTestId('candidate-stu-ahmed-samir').click();
  await teacher.getByTestId('use-candidate').click();
  await teacher.getByTestId('item-vi-2').getByRole('button', { name: 'قبول' }).click();
  await teacher.getByTestId('edit-vi-3').fill('نراجع قواعد الإشارات الحصة الجاية');
  await teacher.getByTestId('use-vi-3').click();
  await teacher.getByTestId('unmentioned-present').click();
  await teacher.getByTestId('apply-voice').click();
  await expect(teacher.getByTestId('screen-t05')).toBeVisible();
  await teacher.getByTestId('confirm-record').click();
  await expect(teacher.getByTestId('raised-flag')).toContainText('مريم');
  await step(teacher, 'teacher-t06-confirmed-flag');
  await tctx.close();

  // 2. Owner web (Arabic): the flag is on Today with an owner and a due date.
  const octx = await browser.newContext({ permissions: ['microphone'] });
  const owner = await octx.newPage();
  await signIn(owner, 'reception', 'ar');
  await owner.goto(`${C('ar')}/today`);
  await expect(owner.getByText('مريم حسن').first()).toBeVisible();
  await axe(owner);
  await step(owner, 'a01-today-flag');

  // 3. The case: why it appeared, the rule, the owner.
  const s0 = await demoState();
  const cid = s0.cases.find((c: { student: string }) => c.student === 'Mariam Hassan').id as string;
  await owner.goto(`${C('ar')}/follow-ups/${cid}`);
  await expect(owner.getByTestId('case-assignee')).toBeVisible();
  await step(owner, 'a03-case');

  // 4. Ask Link by voice (fake mic → fixture request) → a draft from confirmed facts.
  await owner.getByTestId('open-assistant').click();
  await expect(owner.getByTestId('assistant-panel')).toBeVisible();
  await owner.getByTestId('assistant-mic').click();
  await owner.waitForTimeout(1200);
  await owner.getByTestId('assistant-mic').click();
  await expect(owner.getByTestId('assistant-draft')).toBeVisible({ timeout: 20_000 });
  await step(owner, 'v03-assistant-draft');

  // 5. Review and approve (the tick is required); the approved message is locked.
  await owner.getByTestId('assistant-draft').getByRole('link').click();
  await expect(owner.getByTestId('grounded')).toBeVisible();
  await expect(owner.getByTestId('approve')).toBeDisabled();
  await step(owner, 'a06-review');
  await owner.locator('#checked-facts').click();
  await owner.getByTestId('approve').click();
  await expect(owner.getByTestId('final-text')).toBeVisible();

  // 6. Status changes only on provider events: sent → delivered.
  await provider('advance');
  await provider('advance');
  await expect(owner.getByTestId('status-history')).toContainText('وصلت');
  // The assistant's briefing follows the provider status too (never "no draft yet" after a send).
  await expect(owner.getByTestId('assistant-panel')).toContainText('الرسالة معتمدة • وصلت');
  await expect(owner.getByRole('link', { name: 'المتابعات', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await step(owner, 'a09-delivered');

  // 7. The parent sees the approved message (never a draft) in the P09 feed.
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const parent = await pctx.newPage();
  await signIn(parent, 'parent', 'ar');
  await parent.goto('/ar/children');
  await expect(parent.getByTestId('updates-feed')).toContainText('مريم', { timeout: 15_000 });
  await step(parent, 'p09-parent-feed');
  await pctx.close();

  // 8. The guardian replies; V06 summarises it, nothing pre-ticked.
  await reply();
  await owner.goto(`${C('ar')}/follow-ups/${cid}`);
  await owner.getByTestId('open-reply').click();
  await expect(owner.getByTestId('reply-summary')).toBeVisible();
  await expect(owner.getByRole('checkbox', { checked: true })).toHaveCount(0);
  await step(owner, 'v06-reply');
  await owner.locator('#step-check_seat').click();
  await owner.locator('#step-record_outcome').click();
  await owner.getByTestId('apply-steps').click();

  // 9. Outcome: contact recorded, the case stays open until confirmed.
  await expect(owner.getByTestId('outcome-learned')).not.toHaveValue('');
  await owner.getByTestId('outcome-method').selectOption('phone');
  await owner.getByTestId('outcome-result').selectOption('reached');
  await step(owner, 'a08-outcome');
  await owner.getByTestId('save-outcome').click();
  await expect(owner.getByTestId('outcome-history')).toBeVisible();
  await axe(owner);
  await step(owner, 'a10-awaiting-confirmation');

  const s = await demoState('ar');
  const c = s.cases.find((x: { id: string }) => x.id === cid);
  expect(c.status).toBe('awaiting_confirmation');
  expect(s.messages.find((m: { status: string }) => m.status === 'delivered')).toBeTruthy();
  writeProof('demo-day-path.json', {
    note: 'GET http://localhost:4010/__demo/state/ar at the end of the walkthrough (sample data).',
    ...s,
  });
  await octx.close();
});
