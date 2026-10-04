// Batch 5 rule tests (teacher app, Phase 2) on Expo web against the shared mock server.
// Test names carry the rule / story IDs (plan §3.5 step 7).
import { expect, test, type Page } from '@playwright/test';
import {
  MOCK,
  demoState,
  holdToRecord,
  id,
  openTodayRecord,
  prepare,
  resetScenario,
  setDemo,
  shot,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await resetScenario();
  await prepare(page, 'ar');
});

/** T02 → T03 → T04 → V01 → V02 on today's session. */
async function toUnderstood(page: Page) {
  await openTodayRecord(page);
  await id(page, 'to-scores').click();
  await id(page, 'to-observation').click();
  await id(page, 'record-voice').click();
  await expect(id(page, 'screen-v01')).toBeVisible();
  await holdToRecord(page, 2200);
  await expect(id(page, 'screen-v02')).toBeVisible({ timeout: 30_000 });
}

test.describe('T02 Confirm attendance', () => {
  test('FUP-REC-02 AC1/AC2: nothing pre-selected; unmarked = "Not recorded"; a draft saves with gaps', async ({
    page,
  }) => {
    await openTodayRecord(page);
    await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(page.getByText('غير مسجَّل', { exact: true })).toHaveCount(18);
    await shot(page, 'T02-attendance.ar');
    await id(page, 'att-chd-mariam-absent').click();
    await id(page, 'save-draft').click();
    await expect(id(page, 'draft-saved')).toBeVisible();
    const recordId = page.url().split('/record/')[1]!.split('/')[0]!;
    const r = await (
      await fetch(`${MOCK}/v1/session-records/${recordId}`, {
        headers: { authorization: 'Bearer mock.usr-salma' },
      })
    ).json();
    const att = Object.fromEntries(
      r.entries.map((e: { student: { id: string }; attendance: string }) => [
        e.student.id,
        e.attendance,
      ]),
    );
    expect(att['chd-mariam']).toBe('absent');
    expect(Object.values(att).filter((a) => a === 'not_recorded')).toHaveLength(17); // never turned into absent
    expect(r.status).toBe('draft');
  });
});

test.describe('T03 Scores', () => {
  test('BR-APR-09: over the maximum is blocked with the honest message and never capped; series picker; absent has no score', async ({
    page,
  }) => {
    await openTodayRecord(page);
    await id(page, 'att-chd-mariam-absent').click();
    await id(page, 'to-scores').click();
    await expect(id(page, 'series-picker')).toBeVisible();
    await expect(id(page, 'series-sign-rules-practice')).toBeVisible();
    await id(page, 'assessment-title').fill('قواعد الإشارات • كويز تدريبي');
    await id(page, 'assessment-max').fill('20');
    await id(page, 'series-sign-rules-practice').click();
    // FUP-REC-03 AC2: absence is separate — no score field for Mariam, never 0.
    await expect(id(page, 'score-absent-chd-mariam')).toBeVisible();
    await expect(id(page, 'score-chd-mariam')).toHaveCount(0);
    await id(page, 'score-stu-omar').fill('24');
    await expect(
      page.getByText('٢٤ أكبر من الدرجة القصوى ٢٠. صحّحها — Link لا يغيّر الدرجة من تلقاء نفسه.'),
    ).toBeVisible();
    await expect(id(page, 'score-stu-omar')).toHaveValue('24'); // as typed, not capped
    await expect(id(page, 'to-observation')).toBeDisabled();
    await shot(page, 'T03-over-max.ar');
    await id(page, 'score-stu-omar').fill('');
    await expect(id(page, 'to-observation')).toBeEnabled();
  });

  test('FUP-REC-03 AC2: a blank score stays blank on the server', async ({ page }) => {
    await openTodayRecord(page);
    await id(page, 'mark-remaining').click();
    await id(page, 'to-scores').click();
    await id(page, 'assessment-title').fill('Quiz');
    await id(page, 'assessment-max').fill('20');
    await id(page, 'score-stu-laila').fill('١٧');
    await id(page, 'to-observation').click();
    await id(page, 'to-review').click();
    await id(page, 'confirm-record').click();
    await expect(id(page, 'screen-t06')).toBeVisible();
    const s = await (
      await fetch(`${MOCK}/v1/groups/grp-salma-ws/session-records`, {
        headers: { authorization: 'Bearer mock.usr-salma' },
      })
    ).json();
    const today = s[0];
    const score = (sid: string) =>
      today.entries.find((e: { student: { id: string } }) => e.student.id === sid).score;
    expect(score('stu-laila')).toBe(17);
    expect(score('stu-omar')).toBeNull();
  });
});

test.describe('V01 Voice note', () => {
  test('FUP-VOI-01: hold/release with a timer; slide toward the start edge cancels; "Nothing is saved…"', async ({
    page,
  }) => {
    await openTodayRecord(page);
    await id(page, 'to-scores').click();
    await id(page, 'to-observation').click();
    await id(page, 'record-voice').click();
    await expect(
      page.getByText('لا يُحفظ شيء قبل أن تراجع ما فهمه الذكاء الاصطناعي.'),
    ).toBeVisible();
    // Hold: the timer shows while recording.
    const box = (await id(page, 'record-button').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.getByText(/جارٍ التسجيل/)).toBeVisible();
    await shot(page, 'V01-recording.ar');
    // Arabic: the start edge is on the right — slide right to cancel.
    await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(id(page, 'recording-cancelled')).toBeVisible();
    expect(
      (await page.evaluate(() => localStorage.getItem('link.offline.voice-queue'))) ?? '[]',
    ).toBe('[]');
  });

  test('FUP-VOI-06: speech-to-text down → "Type the note instead", the note stays queued', async ({
    page,
  }) => {
    await setDemo({ sttDown: true });
    await openTodayRecord(page);
    await id(page, 'to-scores').click();
    await id(page, 'to-observation').click();
    await id(page, 'record-voice').click();
    await holdToRecord(page, 2000);
    await expect(page.getByText('تحويل الكلام إلى نص لا يستجيب')).toBeVisible({ timeout: 30_000 });
    await shot(page, 'V01-stt-down.ar');
    await id(page, 'type-instead').click();
    await expect(id(page, 'screen-t04').getByTestId('typed-note')).toBeVisible();
  });
});

test.describe('V02 What the AI understood', () => {
  test('FUP-VOI-03: receipt + replay; per-item decisions; low = blank, medium = "Check"; no default for unmentioned; no topic tags', async ({
    page,
  }) => {
    await toUnderstood(page);
    await expect(id(page, 'receipt')).toContainText('إيصال فقط');
    await expect(id(page, 'replay')).toBeVisible();
    await expect(id(page, 'item-vi-2')).toContainText('راجِع'); // medium
    await expect(id(page, 'item-vi-3-value')).toHaveText('—'); // low: blank
    await expect(id(page, 'item-vi-1-value')).toHaveText('غائب'); // high: pre-filled
    await expect(id(page, 'unmentioned-present')).toContainText('١٧');
    // Neither choice is made for the teacher (a chosen chip shows ✓).
    await expect(id(page, 'unmentioned-present')).not.toContainText('✓');
    await expect(id(page, 'unmentioned-leave')).not.toContainText('✓');
    await expect(id(page, 'apply-voice')).toBeDisabled();
    await expect(page.getByText(/Topic|الموضوع|Linear equations/)).toHaveCount(0);
    await shot(page, 'V02-understood.ar');
    // Every item is decided on its own; the low-confidence one must be filled in.
    await id(page, 'item-vi-1').getByRole('button', { name: 'قبول' }).click();
    await expect(id(page, 'apply-voice')).toBeDisabled();
    await id(page, 'item-vi-2').getByRole('button', { name: 'تخطَّ — لا تحفظ' }).click();
    await expect(id(page, 'use-vi-3')).toBeDisabled();
    await id(page, 'item-vi-3').getByRole('button', { name: 'تخطَّ — لا تحفظ' }).click();
    await expect(id(page, 'apply-voice')).toBeDisabled(); // still needs the unmentioned choice
    await id(page, 'unmentioned-leave').click();
    await expect(id(page, 'apply-voice')).toBeEnabled();
  });
});

test.describe('T07 Check the student', () => {
  test('FUP-VOI-04: no default candidate; "Nothing has been saved"', async ({ page }) => {
    await toUnderstood(page);
    await id(page, 'identity-vi-2').click();
    await expect(id(page, 'screen-t07')).toBeVisible();
    await expect(id(page, 'screen-t07').getByText('لم يُحفظ شيء', { exact: true })).toBeVisible();
    await expect(id(page, 'screen-t07').getByRole('radio')).toHaveCount(2);
    await expect(id(page, 'screen-t07').getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(id(page, 'use-candidate')).toBeDisabled();
    await shot(page, 'T07-check-student.ar');
  });
});

test.describe('T05 Review before saving', () => {
  test('FUP-REC-05 AC2: Confirm is disabled while an identity item is open', async ({ page }) => {
    await toUnderstood(page);
    await id(page, 'item-vi-1').getByRole('button', { name: 'قبول' }).click();
    await id(page, 'keep-vi-2').click(); // kept, but which Ahmed is still open
    await id(page, 'item-vi-3').getByRole('button', { name: 'تخطَّ — لا تحفظ' }).click();
    await id(page, 'unmentioned-present').click();
    await id(page, 'apply-voice').click();
    await expect(id(page, 'screen-t05')).toBeVisible();
    await expect(id(page, 'confirm-record')).toBeDisabled();
    await expect(id(page, 'confirm-blocked')).toBeVisible();
    await expect(id(page, 'open-identity-vi-2')).toBeVisible();
    await shot(page, 'T05-identity-open.ar');
    // Resolve from T05: the accepted score goes to the chosen student; Confirm unlocks.
    await id(page, 'open-identity-vi-2').getByRole('button').click();
    await id(page, 'candidate-stu-ahmed-samy').click();
    await id(page, 'use-candidate').click();
    await expect(id(page, 'confirm-record')).toBeEnabled();
    await expect(id(page, 'review-scores')).toContainText('أحمد سامي');
  });

  test('FUP-REC-05 AC3: Confirm sends an Idempotency-Key', async ({ page }) => {
    await openTodayRecord(page);
    await id(page, 'mark-remaining').click();
    await id(page, 'to-scores').click();
    await id(page, 'no-assessment').click();
    await id(page, 'to-review').click();
    const req = page.waitForRequest((r) => r.url().endsWith('/confirm') && r.method() === 'POST');
    await id(page, 'confirm-record').click();
    expect((await req).headers()['idempotency-key']).toMatch(/.{8,}/);
    await expect(id(page, 'screen-t06')).toBeVisible();
  });
});

test.describe('T08 Save failed', () => {
  test('FUP-REC-07: the draft survives (even a restart), no trigger, retry reuses the key — no duplicate', async ({
    page,
  }) => {
    await openTodayRecord(page);
    await id(page, 'mark-remaining').click();
    await id(page, 'att-chd-mariam-absent').click();
    await id(page, 'to-scores').click();
    await id(page, 'no-assessment').click();
    await id(page, 'to-review').click();
    await setDemo({ confirmFault: 'before_commit' });
    const keys: string[] = [];
    page.on('request', (r) => {
      if (r.url().endsWith('/confirm')) keys.push(r.headers()['idempotency-key'] ?? '');
    });
    await id(page, 'confirm-record').click();
    await expect(id(page, 'screen-t08')).toBeVisible();
    await expect(
      page.getByText('السجل غير مؤكَّد. لم تُشغَّل أي قواعد ولم يُرسل أي تحديث لأولياء الأمور.'),
    ).toBeVisible();
    await expect(id(page, 'draft-kept')).toContainText('مريم حسن');
    await shot(page, 'T08-save-failed.ar');
    expect(
      (await demoState()).signals.filter((s: { student: string }) => s.student === 'Mariam Hassan'),
    ).toHaveLength(0);
    await page.reload(); // app restart: the draft is still on the device
    await expect(id(page, 'draft-kept')).toContainText('مريم حسن');
    await id(page, 'retry-save').click();
    await expect(id(page, 'screen-t06')).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    const s = await demoState();
    expect(s.counters.confirmCommits).toBe(1); // mock server: one record, never two
    expect(
      s.signals.filter((x: { student: string }) => x.student === 'Mariam Hassan'),
    ).toHaveLength(1);
  });
});

test.describe('Offline', () => {
  test('FUP-VOI-01 AC4: a recording survives a restart and uploads on reconnect; storage is labelled', async ({
    page,
  }) => {
    await openTodayRecord(page);
    await expect(id(page, 'screen-t02').getByTestId('storage-note')).toContainText('غير مشفّرة');
    await id(page, 'to-scores').click();
    await id(page, 'to-observation').click();
    await setDemo({ offline: true });
    await id(page, 'record-voice').click();
    await holdToRecord(page, 2000);
    await expect(page.getByText('محفوظة على هذا الجهاز')).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await page.goBack();
    await expect(page.getByText('تنتظر الرفع')).toBeVisible();
    await setDemo({ offline: false });
    await expect(page.getByText('جاهزة للمراجعة')).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('T11 Note sheet', () => {
  test('FUP-REC-10: five topics, 500 characters, "Teachers & centre admin"; "Suggest" goes to staff only', async ({
    page,
  }) => {
    await page.goto('/student/stu-omar?groupId=grp-salma-ws');
    await id(page, 'add-note').click();
    await expect(id(page, 'screen-t11')).toBeVisible();
    await expect(id(page, 'topics').getByRole('button')).toHaveCount(5);
    await expect(page.getByText('المعلمون وإدارة المركز')).toBeVisible();
    await id(page, 'note-body').fill('أ'.repeat(510));
    await expect(id(page, 'note-body')).toHaveValue('أ'.repeat(500));
    await expect(page.getByText('٥٠٠ / ٥٠٠')).toBeVisible();
    await id(page, 'note-body').fill('فهم الفكرة بس لسه بيغلط في الإشارات السالبة.');
    await id(page, 'topic-needs_revisit').click();
    await id(page, 'visibility-suggested_for_parent').click();
    await shot(page, 'T11-note.ar');
    await id(page, 'save-note').click();
    await expect(page.getByText('مقترحة لرسالة ولي الأمر • الإدارة تراجعها')).toBeVisible();
    expect((await demoState()).messages).toHaveLength(0); // nothing goes to a parent
  });
});

test.describe('T12 Student detail', () => {
  test('FUP-REC-11 AC2: trends use the same assessment series only', async ({ page }) => {
    await page.goto('/student/stu-omar?groupId=grp-salma-ws');
    await expect(id(page, 'trend-sign-rules-practice')).toBeVisible();
    await expect(id(page, 'trend-unit-tests')).toBeVisible();
    await expect(id(page, 'trend-sign-rules-practice')).not.toContainText('/٣٠');
    await expect(id(page, 'trend-unit-tests')).not.toContainText('/٢٠');
    await shot(page, 'T12-student.ar');
  });
});

test.describe('T13 Records history', () => {
  test('FUP-REC-08: field, old, new, reason and author; the original is kept', async ({ page }) => {
    await page.goto('/group/grp-salma-ws/history');
    const c = page.getByTestId(/^correction-/).first();
    await expect(c).toContainText('الدرجة');
    await expect(c).toContainText('عمر علي');
    await expect(c).toContainText('٢١ ← ١٢');
    await expect(c).toContainText('خطأ في الكتابة');
    await expect(c).toContainText('أ. سلمى فتحي');
    await expect(c).toContainText('الأصل محفوظ في السجل');
    await shot(page, 'T13-history.ar');
  });
});

test.describe('Flags and tabs', () => {
  test('Plan §1.5: with Phase 2 off, Today and the follow-up parts render nothing', async ({
    page,
  }) => {
    await setDemo({ phase2: false });
    await page.goto('/');
    await expect(id(page, 'screen-t09')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'اليوم' })).toHaveCount(0);
    await expect(id(page, 'roster-grp-salma-ws')).toHaveCount(0);
    await shot(page, 'T09-phase2-off.ar');
  });

  test('CF-29: tabs Today · My groups · Rooms · Earnings with Phase 2 on', async ({ page }) => {
    await page.goto('/');
    await expect(id(page, 'screen-today')).toBeVisible();
    await expect(page.getByRole('tab')).toHaveText(['اليوم', 'مجموعاتي', 'القاعات', 'الأرباح']);
  });
});
