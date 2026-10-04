// Batch 5 screenshots: every screen in Arabic and English (docs/frontend/screenshots/batch-5/<ID>.<lang>.png),
// plus the offline and empty states. The rule tests live in teacher.spec.ts.
import { expect, test } from '@playwright/test';
import {
  holdToRecord,
  id,
  openTodayRecord,
  prepare,
  resetScenario,
  setDemo,
  shot,
  type Lang,
} from './helpers';

for (const lang of ['ar', 'en'] as Lang[]) {
  const tx = (ar: string, en: string) => (lang === 'ar' ? ar : en);

  test(`every Batch 5 screen (${lang})`, async ({ page }) => {
    await resetScenario();
    await prepare(page, lang);

    await page.goto('/today');
    await expect(id(page, 'record-due')).toBeVisible();
    await shot(page, `T01.${lang}`);

    await openTodayRecord(page);
    await id(page, 'att-chd-mariam-absent').click();
    await id(page, 'att-stu-youssef-late').click();
    await shot(page, `T02.${lang}`);
    await id(page, 'to-scores').click();
    await id(page, 'assessment-title').fill(
      tx('قواعد الإشارات • كويز تدريبي', 'Sign rules • Practice quiz'),
    );
    await id(page, 'assessment-max').fill('20');
    await id(page, 'series-sign-rules-practice').click();
    await id(page, 'score-stu-omar').fill('12');
    await shot(page, `T03.${lang}`);
    await id(page, 'to-observation').click();
    await shot(page, `T04.${lang}`);

    await id(page, 'record-voice').click();
    await expect(id(page, 'screen-v01')).toBeVisible();
    await shot(page, `V01.${lang}`);
    await holdToRecord(page, 2200);
    await expect(id(page, 'screen-v02')).toBeVisible({ timeout: 30_000 });
    await shot(page, `V02.${lang}`);

    await id(page, 'identity-vi-2').click();
    await expect(id(page, 'screen-t07')).toBeVisible();
    await id(page, 'candidate-stu-ahmed-samir').click();
    await shot(page, `T07.${lang}`);
    await id(page, 'use-candidate').click();
    await expect(id(page, 'screen-v02')).toBeVisible();
    await id(page, 'item-vi-1')
      .getByRole('button', { name: tx('قبول', 'Accept') })
      .click();
    await id(page, 'item-vi-2')
      .getByRole('button', { name: tx('قبول', 'Accept') })
      .click();
    await id(page, 'edit-vi-3').fill(
      tx('نراجع قواعد الإشارات الحصة الجاية', 'Revisit sign rules next session'),
    );
    await id(page, 'use-vi-3').click();
    await id(page, 'unmentioned-present').click();
    await id(page, 'apply-voice').click();
    await expect(id(page, 'screen-t05')).toBeVisible();
    await shot(page, `T05.${lang}`);
    await id(page, 'confirm-record').click();
    await expect(id(page, 'screen-t06')).toBeVisible();
    await shot(page, `T06.${lang}`);

    // T08 on the older session that has no record yet.
    await page.goto('/today');
    await page
      .getByRole('button', { name: tx('سجّل هذه الحصة', 'Record this session') })
      .first()
      .click();
    await expect(id(page, 'screen-t02')).toBeVisible();
    await id(page, 'mark-remaining').click();
    await id(page, 'to-scores').click();
    await id(page, 'no-assessment').click();
    await id(page, 'to-review').click();
    await setDemo({ confirmFault: 'before_commit' });
    await id(page, 'confirm-record').click();
    await expect(id(page, 'screen-t08')).toBeVisible();
    await shot(page, `T08.${lang}`);

    await page.goto('/groups');
    await expect(id(page, 'group-grp-salma-ws')).toBeVisible();
    await shot(page, `T09.${lang}`);
    await page.goto('/group/grp-salma-ws');
    await expect(id(page, 'student-chd-mariam')).toBeVisible();
    await shot(page, `T10.${lang}`);
    await id(page, 'roster-search').fill('zzz');
    await expect(page.getByText(tx('لا يوجد طلاب مطابقون', 'No students match'))).toBeVisible();
    await shot(page, `T10-state-empty.${lang}`);
    await page.goto('/student/stu-omar?groupId=grp-salma-ws');
    await expect(id(page, 'trend-unit-tests')).toBeVisible();
    await shot(page, `T12.${lang}`);
    await id(page, 'add-note').click();
    await id(page, 'topic-understanding').click();
    await id(page, 'note-body').fill(
      tx(
        'فهم الفكرة، بس لسه بيغلط في الإشارات السالبة.',
        'Understood the idea but still mixes up negative signs.',
      ),
    );
    await shot(page, `T11.${lang}`);
    await page.goto('/group/grp-salma-ws/history');
    await expect(page.getByTestId(/^correction-/).first()).toBeVisible();
    await shot(page, `T13.${lang}`);

    await setDemo({ offline: true });
    await page.goto('/today');
    await expect(page.getByRole('alert').first()).toBeVisible();
    await shot(page, `T01-state-offline.${lang}`);
    await setDemo({ offline: false });
  });
}
