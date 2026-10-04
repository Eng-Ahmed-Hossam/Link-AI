// Batch 6 rule tests (owner web, Phase 2) on the shared mock server. Test names carry rule IDs.
import { expect, test } from '@playwright/test';
import {
  C,
  axe,
  demoState,
  provider,
  ready,
  reply,
  resetScenario,
  setDemo,
  shot,
  signIn,
  teacherConfirmsMariamAbsent,
  type Lang,
} from './helpers';

const mariamCase = async () => {
  const s = await demoState();
  return s.cases.find((c: { student: string }) => c.student === 'Mariam Hassan').id as string;
};
const nourCase = async () => {
  const s = await demoState();
  return s.cases.find((c: { student: string }) => c.student === 'Nour Khaled').id as string;
};

test.describe('every owner page passes axe in both languages', () => {
  for (const lang of ['ar', 'en'] as Lang[])
    test(`axe + screenshots (${lang})`, async ({ page }) => {
      await resetScenario();
      await teacherConfirmsMariamAbsent();
      const cid = await mariamCase();
      await signIn(page, 'owner', lang);
      const pages: [string, string][] = [
        ['A01', 'today'],
        ['A02', 'follow-ups'],
        ['A03', `follow-ups/${cid}`],
        ['A08', `follow-ups/${cid}/outcome`],
        ['A13', 'students'],
        ['A04', 'students/chd-mariam'],
        ['A05', 'sessions'],
        ['A11', 'communication'],
        ['A07', 'rules'],
        ['A16', 'staff'],
        ['A17', 'activity'],
      ];
      for (const [id, path] of pages) {
        await page.goto(`${C(lang)}/${path}`);
        await ready(page);
        await expect(page.locator('h1').first()).toBeVisible();
        await axe(page);
        await shot(page, `${id}.${lang}`);
      }
      // A14 (the record that raised the flag), A06 (draft), A09 (approved), V06 (reply), A10 (done).
      const rec = (await demoState()).signals
        .find((x: { student: string }) => x.student === 'Mariam Hassan')
        .evidence.at(-1).recordId;
      await page.goto(`${C(lang)}/sessions/${rec}`);
      await ready(page);
      await axe(page);
      await shot(page, `A14.${lang}`);
      await page.goto(`${C(lang)}/follow-ups/${cid}`);
      await page.getByTestId('draft-message').click();
      await expect(page.getByTestId('grounded')).toBeVisible();
      await axe(page);
      await shot(page, `A06.${lang}`);
      await page.locator('#checked-facts').click();
      await page.getByTestId('approve').click();
      await expect(page.getByTestId('delivery-status')).toBeVisible();
      await provider('advance');
      await provider('advance');
      await expect(page.getByTestId('status-history')).toContainText(
        lang === 'ar' ? 'وصلت' : 'Delivered',
      );
      await axe(page);
      await shot(page, `A09.${lang}`);
      await reply();
      await page.goto(`${C(lang)}/follow-ups/${cid}`);
      await page.getByTestId('open-reply').click();
      await expect(page.getByTestId('reply-summary')).toBeVisible();
      await axe(page);
      await shot(page, `V06.${lang}`);
      await page.goto(`${C(lang)}/follow-ups/${cid}/outcome`);
      await page.getByTestId('outcome-method').selectOption('phone');
      await page.getByTestId('outcome-result').selectOption('reached');
      await page.getByTestId('save-outcome').click();
      await expect(page.getByTestId('outcome-history')).toBeVisible();
      await axe(page);
      await shot(page, `A10.${lang}`);
      // V07: Today with the assistant open.
      await page.goto(`${C(lang)}/today`);
      await page.getByTestId('open-assistant').click();
      await expect(page.getByTestId('assistant-panel')).toBeVisible();
      await ready(page);
      await axe(page);
      await shot(page, `V07.${lang}`);
    });
});

test.describe('nav and landing (CF-29, plan §1.5)', () => {
  test('MVP pilot: follow-up items + Staff, no marketplace items; the centre entry lands on Today', async ({
    page,
  }) => {
    await resetScenario();
    await signIn(page, 'owner', 'en');
    await page.goto('/en/centre');
    await expect(page).toHaveURL(/\/centre\/cen-nour\/today$/);
    const nav = page.getByRole('navigation');
    for (const l of [
      'Today',
      'Follow-ups',
      'Students',
      'Sessions',
      'Parent communication',
      'Rules & settings',
      'Activity history',
      'Staff',
    ])
      await expect(nav.getByRole('link', { name: l, exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Public profile' })).toHaveCount(0);
  });

  test('marketplace on adds its items; Phase 2 off renders no follow-up item at all', async ({
    page,
  }) => {
    await resetScenario({ marketplace: true });
    await signIn(page, 'owner', 'en');
    await page.goto(`${C('en')}/staff`);
    await expect(
      page.getByRole('navigation').getByRole('link', { name: 'Public profile' }),
    ).toBeVisible();
    await setDemo({ phase2: false });
    await page.reload();
    await expect(
      page.getByRole('navigation').getByRole('link', { name: 'Today', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByTestId('open-assistant')).toHaveCount(0);
    await expect(page.getByTestId('role-matrix')).toHaveCount(0);
    await setDemo({ phase2: true, marketplace: false });
  });
});

test.describe('A01 / A02 / A03', () => {
  test.beforeEach(async () => {
    await resetScenario();
    await teacherConfirmsMariamAbsent();
  });

  test('FUP-DSH-01: cards, lists, "Missing data is not absence"; FUP-CAS-05 new day → overdue', async ({
    page,
  }) => {
    await signIn(page, 'owner', 'en');
    await page.goto(`${C('en')}/today`);
    await expect(page.getByTestId('kpi-overdue')).toContainText('1');
    await expect(page.getByTestId('kpi-overdue')).toContainText('Dina Adel');
    await expect(page.getByTestId('kpi-missing')).toContainText('eligible sessions');
    await expect(page.getByText('Missing data is not absence.')).toBeVisible();
    await page.request.post('http://localhost:4010/__demo/new-day', { data: {} });
    await page.reload();
    await expect(page.getByTestId('kpi-overdue')).toContainText('2');
  });

  test('FUP-CAS-01: reason with dates and rule name, owner, due; "A flag starts a review…"', async ({
    page,
  }) => {
    await signIn(page, 'owner', 'en');
    await page.goto(`${C('en')}/follow-ups`);
    const row = page.getByTestId(`case-row-${await mariamCase()}`);
    await expect(row).toContainText('Absent from two consecutive scheduled sessions');
    await expect(row).toContainText('Rule: Consecutive absences (v1)');
    await expect(row).toContainText('Dina Adel (Reception)');
    await expect(
      page.getByText('A flag starts a review. It does not predict that a student will leave.'),
    ).toBeVisible();
    await page.getByTestId('filter-overdue').click();
    await expect(page.getByTestId(`case-row-${await nourCase()}`)).toBeVisible();
    await expect(page.getByTestId(`case-row-${await mariamCase()}`)).toHaveCount(0);
  });

  test('FUP-CAS-02/04: why it appeared; Reception, due today; dismissing needs a reason; reopen', async ({
    page,
  }) => {
    await signIn(page, 'owner', 'en');
    await page.goto(`${C('en')}/follow-ups/${await mariamCase()}`);
    await expect(page.getByText('Both sessions confirmed by Ms Salma Fathy')).toBeVisible();
    await expect(page.getByTestId('case-assignee')).toContainText('Reception');
    await expect(
      page.getByText(
        /a flag is raised when a student is absent from the last 2 scheduled sessions/,
      ),
    ).toBeVisible();
    await page.getByTestId('dismiss').click();
    await expect(page.getByTestId('confirm-dismiss')).toBeDisabled();
    await page.getByTestId('dismiss-reason').fill('Planned family trip, confirmed by the guardian');
    await page.getByTestId('confirm-dismiss').click();
    await expect(
      page.getByText('The flag stays in the activity history and can be reopened.'),
    ).toBeVisible();
    await page.getByTestId('reopen').click();
    await expect(page.getByTestId('draft-message')).toBeVisible();
  });
});

test.describe('A06 / V04 / A09 / A11 messages', () => {
  test.beforeEach(async () => {
    await resetScenario();
    await teacherConfirmsMariamAbsent();
  });

  test('FUP-MSG-01/02: grounded facts with sources; tone; masked phone; tick required; locked; new draft', async ({
    page,
  }) => {
    await signIn(page, 'reception', 'en');
    await page.goto(`${C('en')}/follow-ups/${await mariamCase()}`);
    await page.getByTestId('draft-message').click();
    const g = page.getByTestId('grounded');
    await expect(g).toContainText('Attendance •');
    await expect(g).toContainText('Session record • confirmed by Ms Salma Fathy');
    await expect(page.getByTestId('masked-phone')).toHaveText('+20 10 •••• 0001');
    const before = await page.getByTestId('message-text').inputValue();
    await page.getByRole('radio', { name: 'Formal' }).click();
    await expect(page.getByTestId('message-text')).not.toHaveValue(before);
    await expect(page.getByTestId('approve')).toBeDisabled();
    await page.locator('#checked-facts').click();
    await page.getByTestId('approve').click();
    await expect(page.getByTestId('final-text')).toBeVisible();
    await expect(page.getByText('Locked after approval')).toBeVisible();
    await page.getByTestId('revise').click();
    await expect(page.getByTestId('message-text')).toBeVisible();
    expect((await demoState()).messages.map((m: { status: string }) => m.status).sort()).toEqual([
      'draft',
      'queued',
    ]);
  });

  test('BR-APR-11 / FUP-MSG-03: status moves only on provider events; sending is not solving; A11 shows issues', async ({
    page,
  }) => {
    await signIn(page, 'owner', 'en');
    await page.goto(`${C('en')}/follow-ups/${await mariamCase()}`);
    await page.getByTestId('draft-message').click();
    await page.locator('#checked-facts').click();
    await page.getByTestId('approve').click();
    await expect(page.getByTestId('delivery-status')).toHaveText('Queued');
    await page.waitForTimeout(2500);
    await expect(page.getByTestId('delivery-status')).toHaveText('Queued'); // nothing changes on its own
    await provider('advance');
    await expect(page.getByTestId('delivery-status')).toHaveText('Sent');
    await provider('fail');
    await expect(page.getByTestId('delivery-status')).toHaveText('Failed');
    await expect(
      page.getByText(
        'Delivery failed. Check the recipient and connection, then retry. The case remains open.',
      ),
    ).toBeVisible();
    const s = await demoState();
    expect(s.cases.find((c: { student: string }) => c.student === 'Mariam Hassan').status).toBe(
      'in_progress',
    );
    await page.goto(`${C('en')}/communication`);
    await page.getByTestId('comm-issues').click();
    await expect(page.getByText('Mariam Hassan')).toBeVisible();
  });

  test('FUP-MSG-03 AC2: a guardian who replied STOP cannot be sent to; the approver sees why', async ({
    page,
  }) => {
    await signIn(page, 'owner', 'en');
    await page.goto(`${C('en')}/follow-ups/${await nourCase()}`);
    await page.getByTestId('draft-message').click();
    await expect(page.getByText(/replied STOP/)).toBeVisible();
    await page.locator('#checked-facts').click();
    await expect(page.getByTestId('approve')).toBeDisabled();
  });
});

test.describe('V06 / A08 / A10', () => {
  test('FUP-MSG-05: reply, summary, intent; nothing pre-ticked; never closes; FUP-CAS-03 keep open by default', async ({
    page,
  }) => {
    await resetScenario();
    await teacherConfirmsMariamAbsent();
    await signIn(page, 'owner', 'en');
    const cid = await mariamCase();
    await page.goto(`${C('en')}/follow-ups/${cid}`);
    await page.getByTestId('draft-message').click();
    await page.locator('#checked-facts').click();
    await page.getByTestId('approve').click();
    await provider('advance');
    await provider('advance');
    await reply();
    await page.goto(`${C('en')}/follow-ups/${cid}`);
    await page.getByTestId('open-reply').click();
    await expect(page.getByTestId('reply-body')).toContainText('عندها درس تاني الأربع');
    await expect(page.getByTestId('reply-summary')).toContainText('Timetable clash on Wednesdays');
    await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(0);
    await expect(page.getByTestId('apply-steps')).toBeDisabled();
    await expect(
      page.getByText('Suggestions never close a case on their own.', { exact: false }),
    ).toBeVisible();
    await page.locator('#step-check_seat').click();
    await page.locator('#step-record_outcome').click();
    await page.getByTestId('apply-steps').click();
    await expect(page).toHaveURL(/outcome\?learned=/);
    await expect(page.getByTestId('outcome-learned')).toHaveValue(/Wednesdays/);
    await expect(page.locator('#keep-open')).toBeChecked();
    await page.getByTestId('save-outcome').click();
    await expect(page.getByText('Choose the contact method and the result.')).toBeVisible();
    await page.getByTestId('outcome-method').selectOption('phone');
    await page.getByTestId('outcome-result').selectOption('reached');
    await page.getByTestId('save-outcome').click();
    await expect(
      page.getByRole('heading', { name: 'Contact recorded. Next step set.' }),
    ).toBeVisible();
    await expect(page.getByText('Awaiting confirmation').first()).toBeVisible();
    const s = await demoState();
    expect(s.cases.find((c: { id: string }) => c.id === cid).status).toBe('awaiting_confirmation');
  });
});

test.describe('A13 / A04 / A05 / A14', () => {
  test.beforeEach(async () => {
    await resetScenario();
    await teacherConfirmsMariamAbsent();
  });

  test('FUP-DSH-02: search by guardian; No guardian filter; internal note; guardian status', async ({
    page,
  }) => {
    await signIn(page, 'owner', 'en');
    await page.goto(`${C('en')}/students`);
    await page.getByTestId('students-search').fill('Hassan Mahmoud');
    await expect(page.getByTestId('student-row-chd-mariam')).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await page.getByTestId('students-search').fill('');
    await page.getByTestId('students-noGuardian').click();
    await expect(page.getByTestId('student-row-stu-habiba')).toContainText('Missing phone');
    await page.getByTestId('students-noGuardian').click();
    await expect(page.getByTestId('student-row-stu-ahmed-samir')).toContainText(
      'Internal • teacher',
    );
  });

  test('FUP-DSH-03: "Not recorded" as such; "More comparable results are needed…"', async ({
    page,
  }) => {
    await signIn(page, 'owner', 'en');
    await page.goto(`${C('en')}/students/stu-habiba`);
    await expect(page.getByText('Not recorded').first()).toBeVisible();
    await expect(page.getByTestId('no-trend')).toContainText(
      'More comparable results are needed before showing a decline.',
    );
  });

  test('FUP-REC-12 / FUP-REC-08: record status, rules triggered, correction history with the original', async ({
    page,
  }) => {
    await signIn(page, 'owner', 'en');
    await page.goto(`${C('en')}/sessions`);
    await expect(page.getByText('Only confirmed records trigger rules')).toBeVisible();
    const s = await demoState();
    const rec = s.signals
      .find((x: { student: string }) => x.student === 'Mariam Hassan')
      .evidence.at(-1).recordId;
    await page.goto(`${C('en')}/sessions/${rec}`);
    await expect(page.getByText('Rules triggered by this record')).toBeVisible();
    await expect(page.getByTestId('record-timeline')).toContainText('Draft created');
    // The unit-test record holds Omar's correction 21 → 12.
    await page.goto(`${C('en')}/sessions`);
    const all = await page.request.get(
      'http://localhost:4010/v1/groups/grp-salma-ws/session-records',
      { headers: { authorization: 'Bearer mock.usr-owner' } },
    );
    const withCorr = (await all.json()).find(
      (r: { corrections: unknown[] }) => r.corrections.length,
    );
    await page.goto(`${C('en')}/sessions/${withCorr.id}`);
    await expect(page.getByText('Score changed for Omar Ali')).toBeVisible();
    await expect(page.getByText(/21 → 12/)).toBeVisible();
    await expect(
      page.getByText('The original entry is preserved and can be viewed.'),
    ).toBeVisible();
  });
});

test.describe('A07 / A16 / A17', () => {
  test.beforeEach(async () => resetScenario());

  test('FUP-RUL-01/02: defaults, "Rule v1"; Reception proposes, owner approves → v2', async ({
    browser,
  }) => {
    const rec = await browser.newPage();
    await signIn(rec, 'reception', 'en');
    await rec.goto(`${C('en')}/rules`);
    const card = rec.getByTestId('rule-consecutive_absences');
    await expect(card).toContainText('Rule v1');
    await rec.getByTestId('param-consecutive_absences-n').fill('3');
    await rec.getByTestId('save-consecutive_absences').click();
    await expect(card).toContainText('Change proposed — waiting for the owner');
    await expect(card).toContainText('Rule v1');
    const owner = await browser.newPage();
    await signIn(owner, 'owner', 'en');
    await owner.goto(`${C('en')}/rules`);
    await owner.getByTestId('approve-consecutive_absences').click();
    await expect(owner.getByTestId('rule-consecutive_absences')).toContainText('Rule v2');
    await expect(owner.getByTestId('rule-text-consecutive_absences')).toContainText(
      'last 3 scheduled sessions',
    );
    await expect(owner.getByTestId('rule-score_decline')).toContainText('Off');
  });

  test('FUP-STF-01: role matrix; only the owner invites; FUP-DSH-04 log is append-only with weekly counts', async ({
    page,
  }) => {
    await signIn(page, 'owner', 'en');
    await page.goto(`${C('en')}/staff`);
    await expect(page.getByTestId('role-matrix')).toContainText('No guardian phone numbers');
    await page.getByTestId('invite-phone').fill('010 0000 0077');
    await page.getByRole('combobox', { name: 'Role' }).selectOption('teacher');
    await page.getByTestId('send-invite').click();
    await expect(page.getByText('Invite pending')).toBeVisible();
    await page.goto(`${C('en')}/activity`);
    await expect(page.getByText("This log can't be edited")).toBeVisible();
    await expect(page.getByTestId('week-counts')).toContainText('records confirmed');
    await page.getByTestId('activity-corrections').click();
    await expect(page.getByTestId('activity-event')).toHaveCount(1);
    await expect(page.getByTestId('activity-event')).toContainText('Omar Ali');
  });
});

test.describe('V07 / V03 Ask Link', () => {
  test('FUP-DSH-05: streams; Draft tier creates a draft for approval; Act needs approval; voice works', async ({
    page,
  }) => {
    await resetScenario();
    await teacherConfirmsMariamAbsent();
    await signIn(page, 'reception', 'en');
    await page.goto(`${C('en')}/today`);
    await page.getByTestId('open-assistant').click();
    await expect(
      page.getByText('Link only drafts. Every message to a parent needs your approval.'),
    ).toBeVisible();
    await page.getByTestId('assistant-input').fill('approve and send it now');
    await page.getByTestId('assistant-send').click();
    await expect(page.getByText('Act — needs your approval')).toBeVisible();
    await expect(page.getByTestId('assistant-send')).toBeDisabled(); // input cleared
    expect((await demoState()).messages).toHaveLength(0);
    // Voice: the fake microphone records; the mock transcribes the fixture request.
    await page.getByTestId('assistant-mic').click();
    await page.waitForTimeout(1200);
    await page.getByTestId('assistant-mic').click();
    await expect(page.getByTestId('assistant-draft')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('assistant-draft')).toContainText('Attendance •');
    expect((await demoState()).messages.map((m: { status: string }) => m.status)).toEqual([
      'draft',
    ]);
    await page.getByTestId('assistant-draft').getByRole('link').click();
    await expect(page.getByTestId('approve')).toBeDisabled();
  });
});

test.describe('P09 feed (FUP-MSG-08)', () => {
  test('approved messages only; nothing renders with the flag off', async ({ page }) => {
    await resetScenario();
    await teacherConfirmsMariamAbsent();
    await signIn(page, 'parent', 'en');
    await page.goto('/en/children');
    await expect(page.getByTestId('updates-feed')).toContainText('No updates yet');
    // Staff approve over the API (the owner UI is covered above).
    const cid = await mariamCase();
    const h = { authorization: 'Bearer mock.usr-owner', 'content-type': 'application/json' };
    const m = await (
      await fetch('http://localhost:4010/v1/messages/drafts', {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ caseId: cid }),
      })
    ).json();
    await fetch(`http://localhost:4010/v1/messages/${m.id}/approve`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ checked: true }),
    });
    await expect(page.getByTestId('updates-feed')).toContainText('مريم', { timeout: 15_000 });
    await axe(page);
    await shot(page, 'P09-feed.en');
    await setDemo({ phase2: false });
    await page.reload();
    await expect(page.getByTestId('updates-feed')).toHaveCount(0);
    await setDemo({ phase2: true });
  });
});

test.describe('CF-39 / CF-34 (decided 2026-10-04)', () => {
  test('CF-39: with the marketplace off, P09 shows only the child’s groups at the centre', async ({
    page,
  }) => {
    await resetScenario();
    await signIn(page, 'parent', 'en');
    await page.goto('/en/children');
    await expect(page.getByTestId('centre-group-grp-salma-ws')).toContainText(
      'Secondary 2 · Maths',
    );
    await expect(page.getByTestId('centre-group-grp-salma-ws')).toContainText('Ms Salma Fathy');
    await expect(page.getByText('Physics')).toHaveCount(0);
    await axe(page);
    await setDemo({ marketplace: true });
    await page.reload();
    await expect(page.getByTestId('centre-group-grp-salma-ws')).toHaveCount(0);
    await setDemo({ marketplace: false });
  });

  test('CF-34: the owner asks the teacher to correct on A14; Reception sees it but cannot ask', async ({
    browser,
  }) => {
    await resetScenario();
    const rec = (await teacherConfirmsMariamAbsent()) as { id: string };
    const owner = await (await browser.newContext({ baseURL: 'http://localhost:3000' })).newPage();
    await signIn(owner, 'owner', 'en');
    await owner.goto(`${C('en')}/sessions/${rec.id}`);
    await owner.getByTestId('ask-text').fill('Please check Mariam: she may have come late.');
    await owner.getByTestId('ask-teacher-send').click();
    await expect(owner.getByTestId('ask-teacher')).toContainText('Waiting for the teacher');
    await axe(owner);
    const today = await (
      await fetch('http://localhost:4010/v1/teachers/me/today', {
        headers: { authorization: 'Bearer mock.usr-salma' },
      })
    ).json();
    expect(today.correctionRequests).toHaveLength(1);
    const reception = await (
      await browser.newContext({ baseURL: 'http://localhost:3000' })
    ).newPage();
    await signIn(reception, 'reception', 'en');
    await reception.goto(`${C('en')}/sessions/${rec.id}`);
    await expect(reception.getByTestId('ask-teacher')).toContainText('Waiting for the teacher');
    await expect(reception.getByTestId('ask-teacher-send')).toHaveCount(0);
  });
});
