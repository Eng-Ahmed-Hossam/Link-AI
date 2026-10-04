// Batch 5 walkthrough (Arabic): record a voice note, review what the AI understood, resolve the
// ambiguous name, confirm — and prove on the mock server that `consecutive_absences` fired.
// Then go offline, record again, restart the app, reconnect: the queued note uploads.
import { expect, test } from '@playwright/test';
import {
  WALK,
  demoState,
  holdToRecord,
  id,
  openTodayRecord,
  prepare,
  resetScenario,
  setDemo,
  shot,
  writeProof,
} from './helpers';

test('walkthrough: voice → review → T07 → confirm → flag; offline → restart → upload', async ({
  page,
}) => {
  await resetScenario();
  await prepare(page, 'ar');
  let n = 0;
  const step = async (name: string) => shot(page, `${String(++n).padStart(2, '0')}-${name}`, WALK);

  await page.goto('/today');
  await expect(id(page, 'record-due')).toBeVisible();
  await step('today');

  await openTodayRecord(page);
  await step('t02-attendance');
  await id(page, 'to-scores').click();
  await expect(id(page, 'screen-t03')).toBeVisible();
  await id(page, 'to-observation').click();
  await expect(id(page, 'screen-t04')).toBeVisible();
  await step('t04-observation');

  // 1. Record a voice note (V01).
  await id(page, 'record-voice').click();
  await expect(id(page, 'screen-v01')).toBeVisible();
  await step('v01-ready');
  await holdToRecord(page, 2500);

  // 2. What the AI understood (V02).
  await expect(id(page, 'screen-v02')).toBeVisible({ timeout: 30_000 });
  await expect(id(page, 'transcript')).toContainText('مريم غابت النهارده');
  await step('v02-understood');
  await id(page, 'item-vi-1').getByRole('button', { name: 'قبول' }).click();

  // Resolve the ambiguous "أحمد" (T07): no candidate is pre-selected.
  await id(page, 'identity-vi-2').click();
  await expect(id(page, 'screen-t07')).toBeVisible();
  await step('t07-check-student');
  await id(page, 'candidate-stu-ahmed-samir').click();
  await id(page, 'use-candidate').click();
  await expect(id(page, 'screen-v02')).toBeVisible();
  await id(page, 'item-vi-2').getByRole('button', { name: 'قبول' }).click();
  // The low-confidence group note is blank: the teacher fills it in.
  await id(page, 'edit-vi-3').fill('نراجع قواعد الإشارات الحصة الجاية');
  await id(page, 'use-vi-3').click();
  await id(page, 'unmentioned-present').click();
  await step('v02-decided');
  await id(page, 'apply-voice').click();

  // 3. Review and confirm (T05 → T06).
  await expect(id(page, 'screen-t05')).toBeVisible();
  await step('t05-review');
  await id(page, 'confirm-record').click();
  await expect(id(page, 'screen-t06')).toBeVisible();
  await expect(id(page, 'raised-flag')).toContainText('مريم');
  await step('t06-saved');

  // Proof on the mock server: the confirmed record raised consecutive_absences for Mariam.
  const s = await demoState('ar');
  const mariam = s.signals.find(
    (x: { rule: string; student: string }) =>
      x.rule === 'consecutive_absences' && x.student === 'مريم حسن',
  );
  expect(mariam).toBeTruthy();
  expect(s.counters.confirmCommits).toBe(1);
  writeProof('consecutive-absences.json', {
    note: 'GET http://localhost:4010/__demo/state/ar right after the teacher confirmed the record (sample data).',
    ...s,
  });

  // 4. Offline: record again, restart the app, reconnect — the queued note uploads.
  // Today's record is confirmed now: record the older session that has no record yet.
  await page.goto('/today');
  await page.getByRole('button', { name: 'سجّل هذه الحصة' }).first().click();
  await expect(id(page, 'screen-t02')).toBeVisible();
  await id(page, 'to-scores').click();
  await id(page, 'to-observation').click();
  await setDemo({ offline: true });
  await id(page, 'record-voice').click();
  await holdToRecord(page, 2000);
  await expect(page.getByText('محفوظة على هذا الجهاز')).toBeVisible({ timeout: 30_000 });
  await step('v01-offline-queued');
  await page.reload(); // app restart
  await page.goBack();
  await expect(id(page, 'screen-t04')).toBeVisible();
  await expect(page.getByText('تنتظر الرفع')).toBeVisible();
  await step('t04-queued-after-restart');
  await setDemo({ offline: false });
  await expect(page.getByText('جاهزة للمراجعة')).toBeVisible({ timeout: 30_000 });
  await step('t04-uploaded-on-reconnect');
});
