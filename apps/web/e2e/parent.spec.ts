// Batch 1 · parent PWA. Rule tests carry their rule/story IDs; every page runs axe in AR and EN
// and saves screenshots to docs/frontend/screenshots/batch-1/.
import { expect, test, type Page } from '@playwright/test';
import { axe, LANGS, prepare, ready, shot } from './helpers';

const SALMA = '/teachers/salma-fathy-maths';

async function signInFlow(page: Page, lang: 'ar' | 'en', code: string) {
  await page.goto(`/${lang}/welcome`);
  await ready(page);
  await page.locator('input[type=tel]').fill('1000000001');
  await page.locator('form button[type=submit]').click();
  await page.locator('input[autocomplete=one-time-code]').waitFor();
  await page.locator('input[autocomplete=one-time-code]').fill(code);
}

/** Creates a confirmed card enrolment through P06 → P07 → mock checkout → P08. */
async function reserveByCard(page: Page, lang: 'ar' | 'en' = 'en', plan?: RegExp) {
  await page.goto(`/${lang}${SALMA}/reserve?group=grp-salma-ws`);
  await ready(page);
  await page
    .locator('main button')
    .filter({ hasText: lang === 'en' ? 'Continue to payment' : 'متابعة للدفع' })
    .click();
  await page.waitForURL(/reserve\/draft-/);
  await ready(page);
  if (plan) await page.getByRole('radio', { name: plan }).click();
  await page
    .getByRole('button', {
      name:
        lang === 'en'
          ? /^(Pay .* reserve|Try paying again)$/
          : /^(ادفع .* واحجز|حاول الدفع مرة أخرى)$/,
    })
    .click();
}

// ── P01 ─────────────────────────────────────────────────────────────────────────
test.describe('P01 Welcome & sign up', () => {
  for (const lang of LANGS) {
    test(`renders, passes axe, screenshots (${lang})`, async ({ page }) => {
      await prepare(page);
      await page.goto(`/${lang}/welcome`);
      await ready(page);
      await axe(page);
      await shot(page, 'P01-welcome', lang);
      await page.locator('input[type=tel]').fill('1000000001');
      await page.locator('form button[type=submit]').click();
      await page.locator('input[autocomplete=one-time-code]').waitFor();
      await axe(page);
      await shot(page, 'P01-code', lang);
    });
  }

  test('MKT-ACC-02 AC1: offers parent, teacher and centre owner; CF-02: no email/password form', async ({
    page,
  }) => {
    await prepare(page);
    await page.goto('/en/welcome');
    await ready(page);
    for (const r of ['A parent', 'A teacher', 'A centre owner'])
      await expect(page.getByRole('radio', { name: new RegExp(r) })).toBeVisible();
    await expect(page.locator('input[type=password], input[type=email]')).toHaveCount(0);
  });

  test('MKT-ACC-01 AC4: a wrong code says how many tries are left; AC2: resend timer', async ({
    page,
  }) => {
    await prepare(page);
    await signInFlow(page, 'en', '111111');
    await expect(page.getByText('That code is not right. 4 tries left.')).toBeVisible();
    await expect(page.getByText(/Resend in 0:\d\d/)).toBeVisible();
    await shot(page, 'P01-code-wrong', 'en');
  });

  test('MKT-ACC-01: the mock code 123456 signs in and returns to the reservation', async ({
    page,
  }) => {
    await prepare(page);
    await page.goto(`/en/welcome?next=${encodeURIComponent(`/en${SALMA}/reserve`)}`);
    await ready(page);
    await page.locator('input[type=tel]').fill('1000000001');
    await page.locator('form button[type=submit]').click();
    await page.locator('input[autocomplete=one-time-code]').fill('123456');
    await page.waitForURL(/\/reserve$/);
  });

  test('RTL-04: Arabic-Indic digits in the phone are accepted', async ({ page }) => {
    await prepare(page);
    await page.goto('/ar/welcome');
    await ready(page);
    await page.locator('input[type=tel]').fill('١٠٠٠٠٠٠٠٠١');
    await expect(page.locator('input[type=tel]')).toHaveValue('1000000001');
  });
});

// ── P02 ─────────────────────────────────────────────────────────────────────────
test.describe('P02 Search home', () => {
  for (const lang of LANGS) {
    test(`signed in: renders, axe, screenshot (${lang})`, async ({ page }) => {
      await prepare(page, { signedIn: true });
      await page.goto(`/${lang}/search`);
      await ready(page);
      await axe(page);
      await shot(page, 'P02-search', lang);
    });
    for (const scenario of ['empty', 'error', 'offline', 'slow'] as const) {
      test(`state ${scenario} (${lang})`, async ({ page }) => {
        await prepare(page, { signedIn: true, overrides: { scenario } });
        await page.goto(`/${lang}/search`);
        if (scenario === 'slow') await page.waitForTimeout(800);
        else await ready(page);
        await shot(page, `P02-state-${scenario}`, lang);
      });
    }
  }

  test('MKT-DSC-01 AC3 and MKT-ACC-05 AC3: ratings note; search defaults to the selected child', async ({
    page,
  }) => {
    await prepare(page, { signedIn: true });
    await page.goto('/en/search');
    await ready(page);
    await expect(
      page.getByText('Ratings come only from parents whose children are enrolled.'),
    ).toBeVisible();
    await expect(page.getByText(/Mariam • National • Secondary 2/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Hi Hassan 👋' })).toBeVisible();
  });
});

// ── P03 ─────────────────────────────────────────────────────────────────────────
test.describe('P03 Map & results', () => {
  const url = (lang: string, extra = '') =>
    `/${lang}/search/results?subjectId=sub-math&curriculumId=cur-national&schoolYearId=sy-sec2${extra}`;
  for (const lang of LANGS) {
    test(`renders, axe, screenshots (${lang})`, async ({ page }) => {
      await prepare(page);
      await page.goto(url(lang));
      await ready(page);
      await axe(page);
      await shot(page, 'P03-results-map', lang);
      await page.goto(url(lang, '&view=list'));
      await ready(page);
      await shot(page, 'P03-results-list', lang);
      await page.goto(url(lang, '&radiusKm=2&minRating=4.9'));
      await ready(page);
      await shot(page, 'P03-state-empty', lang);
    });
  }

  test('MKT-DSC-02 AC1: distance defaults to ≤ 5 km; centres beyond it are hidden', async ({
    page,
  }) => {
    await prepare(page);
    await page.goto(url('en'));
    await ready(page);
    await expect(page.getByRole('button', { name: /≤ 5 km/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByText('Horizon Centre')).toHaveCount(0);
    await expect(page.getByText(/4 centres • 2 Maths teachers within 5 km/)).toBeVisible();
  });

  test('MKT-DSC-03 AC1: a fully booked centre shows "Waitlist only" (dot + text)', async ({
    page,
  }) => {
    await prepare(page);
    await page.goto(url('en', '&view=list'));
    await ready(page);
    const card = page.getByRole('link', { name: /Future Minds/ });
    await expect(card.getByText('Waitlist only')).toBeVisible();
  });
});

// ── P04 ─────────────────────────────────────────────────────────────────────────
test.describe('P04 Centre profile', () => {
  for (const lang of LANGS) {
    test(`renders, axe, screenshot (${lang})`, async ({ page }) => {
      await prepare(page, { signedIn: true });
      await page.goto(`/${lang}/centres/al-nour-maadi?schoolYearId=sy-sec2&subjectId=sub-math`);
      await ready(page);
      await axe(page);
      await shot(page, 'P04-centre', lang);
    });
  }

  test('CF-05 / MKT-DSC-04 AC4: fees are "set by each teacher"; trust badges come from Link data only', async ({
    page,
  }) => {
    await prepare(page);
    await page.goto('/en/centres/al-nour-maadi?schoolYearId=sy-sec2&subjectId=sub-math');
    await ready(page);
    await expect(page.getByText('Fees set by each teacher')).toBeVisible();
    await expect(page.getByText('Verified by Link')).toBeVisible();
    // Figma's owner-style badges are Phase 2 / undefined data (CF-21): not shown.
    await expect(page.getByText('Uses Link for follow-up')).toHaveCount(0);
    await expect(page.getByText('Sends regular progress updates')).toHaveCount(0);
  });
});

// ── P05 ─────────────────────────────────────────────────────────────────────────
test.describe('P05 Teacher profile', () => {
  for (const lang of LANGS) {
    test(`renders, axe, screenshot (${lang})`, async ({ page }) => {
      await prepare(page);
      await page.goto(`/${lang}${SALMA}`);
      await ready(page);
      await axe(page);
      await shot(page, 'P05-teacher', lang);
    });
  }

  test('MKT-DSC-05 AC1: the "% recorded" badge is Phase 2 — hidden unless the flag is on', async ({
    page,
  }) => {
    await prepare(page);
    await page.goto(`/en${SALMA}`);
    await ready(page);
    await expect(page.getByText('recorded', { exact: true })).toHaveCount(0);
  });

  test('flag teacher.recorded_badge on shows the badge', async ({ page }) => {
    await prepare(page, { flags: { 'teacher.recorded_badge': true } });
    await page.goto(`/en${SALMA}`);
    await ready(page);
    await expect(page.getByText('recorded', { exact: true })).toBeVisible();
  });
});

// ── P06 ─────────────────────────────────────────────────────────────────────────
test.describe('P06 Choose a group & start date', () => {
  for (const lang of LANGS) {
    test(`renders, axe, screenshots (${lang})`, async ({ page }) => {
      await prepare(page, { signedIn: true });
      await page.goto(`/${lang}${SALMA}/reserve?group=grp-salma-ws`);
      await ready(page);
      await axe(page);
      await shot(page, 'P06-choose', lang);
      await page.goto(`/${lang}${SALMA}/reserve?group=grp-salma-fri`);
      await ready(page);
      await shot(page, 'P06-full-waitlist', lang);
      await page.goto(`/${lang}${SALMA}/reserve?group=grp-salma-nile`);
      await ready(page);
      await shot(page, 'P06-year-mismatch', lang);
    });
  }

  test('MKT-GRP-03 AC4: seats are shown per session', async ({ page }) => {
    await prepare(page, { signedIn: true });
    await page.goto(`/en${SALMA}/reserve?group=grp-salma-ws`);
    await ready(page);
    await expect(page.getByRole('radio', { name: /2 left/ }).first()).toBeVisible();
    await expect(page.getByText(/1 seat left on/).first()).toBeVisible();
  });

  test('MKT-ENR-01 AC1 / MKT-ENR-09: a full group offers the free waitlist, not payment', async ({
    page,
  }) => {
    await prepare(page, { signedIn: true });
    await page.goto(`/en${SALMA}/reserve?group=grp-salma-fri`);
    await ready(page);
    await expect(page.getByText('Full — join waitlist').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue to payment' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page.getByText(/You are number \d+ in line/)).toBeVisible();
  });

  test('BR-ENR-09: a school-year mismatch warns but does not block', async ({ page }) => {
    await prepare(page, { signedIn: true });
    await page.goto(`/en${SALMA}/reserve?group=grp-salma-nile`);
    await ready(page);
    await expect(
      page.getByText(
        /This group is for Secondary 3\. Mariam is in Secondary 2\. You can still reserve\./,
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue to payment' })).toBeEnabled();
  });
});

// ── P07 ─────────────────────────────────────────────────────────────────────────
test.describe('P07 Reserve & pay', () => {
  async function openP07(page: Page, lang: 'ar' | 'en', group = 'grp-salma-ws') {
    await page.goto(`/${lang}${SALMA}/reserve?group=${group}`);
    await ready(page);
    await page
      .locator('main button')
      .filter({ hasText: lang === 'en' ? 'Continue to payment' : 'متابعة للدفع' })
      .click();
    await page.waitForURL(/reserve\/draft-/);
    await ready(page);
  }
  for (const lang of LANGS) {
    test(`renders, axe, screenshots (${lang})`, async ({ page }) => {
      await prepare(page, { signedIn: true });
      await openP07(page, lang);
      await axe(page);
      await shot(page, 'P07-pay-monthly', lang);
      await page
        .getByRole('radio', {
          name: lang === 'en' ? /Pay for one month only/ : /ادفع لشهر واحد فقط/,
        })
        .click();
      await shot(page, 'P07-pay-single-month', lang);
    });
    test(`full covered session named (${lang})`, async ({ page }) => {
      await prepare(page, { signedIn: true });
      await openP07(page, lang, 'grp-salma-st');
      await shot(page, 'P07-session-full', lang);
    });
    test(`hold expired (${lang})`, async ({ page }) => {
      await prepare(page, { signedIn: true });
      await openP07(page, lang);
      await page
        .getByRole('button', {
          name:
            lang === 'en'
              ? /^(Pay .* reserve|Try paying again)$/
              : /^(ادفع .* واحجز|حاول الدفع مرة أخرى)$/,
        })
        .click();
      await page.waitForURL(/mock-checkout/);
      const id = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('link.mock.db.v1')!);
        const e = s.enrolments.find((x: { status: string }) => x.status === 'pending_payment');
        // Move the hold into the past; the mock expires it on the next read (BR-ENR-01).
        e.holdExpiresAt = new Date(Date.now() - 1000).toISOString();
        localStorage.setItem('link.mock.db.v1', JSON.stringify(s));
        return e.id as string;
      });
      await page.goto(`/${lang}/reserve/${id}`);
      await ready(page);
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: lang === 'en' ? 'Your seat hold ran out' : 'انتهت مهلة الدفع' }),
      ).toBeVisible();
      await shot(page, 'P07-hold-expired', lang);
    });
  }

  test('CF-06: says "Monthly plan", never "subscription"; booking fee EGP 0; no extra fees', async ({
    page,
  }) => {
    await prepare(page, { signedIn: true });
    await openP07(page, 'en');
    await expect(page.getByText(/Monthly plan with/)).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/subscription/i);
    await expect(page.getByText('Booking fee')).toBeVisible();
    await expect(page.locator('dd').filter({ hasText: /^EGP 0$/ })).toBeVisible();
    await expect(page.getByText(/No extra fees for parents/)).toBeVisible();
  });

  test('BR-PMT-02 / OD-10: monthly plan = card only; one month = card, Fawry or wallet', async ({
    page,
  }) => {
    await prepare(page, { signedIn: true });
    await openP07(page, 'en');
    await expect(page.getByRole('radio', { name: /^Fawry/ })).toBeDisabled();
    await expect(page.getByRole('radio', { name: /^Mobile wallet/ })).toBeDisabled();
    await expect(page.getByText('Monthly plans can only be paid by card.')).toBeVisible();
    await page.getByRole('radio', { name: /Pay for one month only/ }).click();
    await expect(page.getByRole('radio', { name: /^Fawry/ })).toBeEnabled();
    await expect(page.getByRole('radio', { name: /^Mobile wallet/ })).toBeEnabled();
  });

  test('MKT-ENR-02 AC4: phone sharing is unticked by default; AC5: refund rule shown', async ({
    page,
  }) => {
    await prepare(page, { signedIn: true });
    await openP07(page, 'en');
    await expect(page.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
    await expect(
      page.getByText(/Full refund if you cancel before the first session/),
    ).toBeVisible();
  });

  test('BR-MNY-06: no card field anywhere in Link', async ({ page }) => {
    await prepare(page, { signedIn: true });
    await openP07(page, 'en');
    await expect(page.locator('input[autocomplete^="cc-"], input[name*="card" i]')).toHaveCount(0);
  });

  test('MKT-ENR-02 AC7: a full covered session is named and the waitlist offered', async ({
    page,
  }) => {
    await prepare(page, { signedIn: true });
    await openP07(page, 'en', 'grp-salma-st');
    await expect(page.getByRole('alert').filter({ hasText: /is full/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Join the waitlist' })).toBeVisible();
  });
});

// ── P08 ─────────────────────────────────────────────────────────────────────────
test.describe('P08 Place reserved', () => {
  for (const lang of LANGS) {
    test(`card: Confirming… then Place reserved, axe, screenshots (${lang})`, async ({ page }) => {
      await prepare(page, { signedIn: true });
      await reserveByCard(page, lang);
      await page.waitForURL(/mock-checkout/);
      await ready(page);
      await shot(page, 'P08-mock-provider', lang);
      await page
        .getByRole('button', {
          name: lang === 'en' ? 'Simulate a successful payment' : 'تجربة دفع ناجح',
        })
        .click();
      await page.waitForURL(/\/done$/);
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: lang === 'en' ? 'Confirming your payment' : 'جارٍ تأكيد الدفع' }),
      ).toBeVisible();
      await shot(page, 'P08-confirming', lang);
      await expect(
        page.getByRole('heading', { name: lang === 'en' ? 'Place reserved!' : 'تم حجز المكان!' }),
      ).toBeVisible({ timeout: 10_000 });
      await axe(page);
      await shot(page, 'P08-reserved', lang);
    });
    test(`Fawry variant (${lang})`, async ({ page }) => {
      await prepare(page, { signedIn: true });
      await page.goto(`/${lang}/teachers/karim-adel-maths/reserve?group=grp-karim-nour`);
      await ready(page);
      await page
        .locator('main button')
        .filter({ hasText: lang === 'en' ? 'Continue to payment' : 'متابعة للدفع' })
        .click();
      await page.waitForURL(/reserve\/draft-/);
      await ready(page);
      await page
        .getByRole('radio', {
          name: lang === 'en' ? /Pay for one month only/ : /ادفع لشهر واحد فقط/,
        })
        .click();
      await page.getByRole('radio', { name: lang === 'en' ? /^Fawry/ : /^فوري/ }).click();
      await page
        .getByRole('button', {
          name:
            lang === 'en'
              ? /^(Pay .* reserve|Try paying again)$/
              : /^(ادفع .* واحجز|حاول الدفع مرة أخرى)$/,
        })
        .click();
      await page.waitForURL(/\/done$/);
      await expect(
        page.getByText(lang === 'en' ? 'Fawry reference code' : 'كود فوري المرجعي'),
      ).toBeVisible();
      await expect(
        page.getByText(
          lang === 'en' ? 'Your seat is held for 24 hours' : 'مكانك محجوز لمدة ٢٤ ساعة',
        ),
      ).toBeVisible();
      await axe(page);
      await shot(page, 'P08-fawry', lang);
    });
  }

  test('BR-MNY-12: status changes only when the webhook lands; OD-08 step only when the teacher reviews', async ({
    page,
  }) => {
    await prepare(page, {
      signedIn: true,
      overrides: { reviewEachEnrolment: { 'tch-salma': true } },
    });
    await reserveByCard(page, 'en');
    await page.waitForURL(/mock-checkout/);
    await page.getByRole('button', { name: 'Simulate a successful payment' }).click();
    await page.waitForURL(/\/done$/);
    await expect(page.getByText('Confirming your payment…')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Payment received' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Ms Salma Fathy confirms the seat')).toBeVisible();
    await shot(page, 'P08-awaiting-teacher', 'en');
  });

  test('OD-08 default: no teacher-confirmation step', async ({ page }) => {
    await prepare(page, { signedIn: true });
    await reserveByCard(page, 'en');
    await page.waitForURL(/mock-checkout/);
    await page.getByRole('button', { name: 'Simulate a successful payment' }).click();
    await expect(page.getByRole('heading', { name: 'Place reserved!' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/confirms the seat/)).toHaveCount(0);
  });

  test('BR-ENR-05: a failed attempt returns to P07 with "try again" and the hold still running', async ({
    page,
  }) => {
    await prepare(page, { signedIn: true });
    await reserveByCard(page, 'en');
    await page.waitForURL(/mock-checkout/);
    await page.getByRole('button', { name: 'Simulate a failed payment' }).click();
    await page.waitForURL(/reserve\/enr-\d+$/);
    await expect(page.getByText('Payment didn’t go through — try again')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('timer')).toBeVisible();
    await shot(page, 'P07-payment-failed', 'en');
  });
});

// ── P09 ─────────────────────────────────────────────────────────────────────────
test.describe('P09 My children', () => {
  for (const lang of LANGS) {
    test(`renders, axe, screenshot (${lang})`, async ({ page }) => {
      await prepare(page, { signedIn: true });
      await page.goto(`/${lang}/children`);
      await ready(page);
      await axe(page);
      await shot(page, 'P09-children', lang);
      await page.getByRole('button', { name: lang === 'en' ? /Youssef/ : /يوسف/ }).click();
      await shot(page, 'P09-child-not-enrolled', lang);
    });
  }

  test('MKT-ENR-08: cancelling before the first session shows a separate refund status', async ({
    page,
  }) => {
    await prepare(page, { signedIn: true });
    await reserveByCard(page, 'en');
    await page.waitForURL(/mock-checkout/);
    await page.getByRole('button', { name: 'Simulate a successful payment' }).click();
    await expect(page.getByRole('heading', { name: 'Place reserved!' })).toBeVisible({
      timeout: 10_000,
    });
    await page.goto('/en/children');
    await ready(page);
    const card = page.locator('main > div').filter({ hasText: 'Maths • Ms Salma Fathy' }).first();
    await card.getByRole('button', { name: 'Manage' }).click();
    await page.getByRole('button', { name: 'Cancel this place' }).click();
    await page.getByRole('button', { name: 'Cancel the place' }).click();
    await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
    await expect(page.getByText('Refund requested')).toBeVisible();
    await shot(page, 'P09-cancelled-refund', 'en');
  });

  test('MKT-ENR-07 AC4: the Phase 2 updates feed is hidden; AC3: "Find a teacher"', async ({
    page,
  }) => {
    await prepare(page, { signedIn: true });
    await page.goto('/en/children');
    await ready(page);
    await expect(page.getByText('Updates from the centre')).toHaveCount(0);
    await page.getByRole('button', { name: /Youssef/ }).click();
    await expect(page.getByText('Youssef isn’t enrolled with a teacher yet.')).toBeVisible();
  });
});

// ── P10 ─────────────────────────────────────────────────────────────────────────
test.describe('P10 Leave feedback', () => {
  for (const lang of LANGS) {
    test(`renders, axe, screenshot (${lang})`, async ({ page }) => {
      await prepare(page, { signedIn: true });
      await page.goto(`/${lang}/enrolments/enr-mariam-phys/feedback`);
      await ready(page);
      await axe(page);
      await shot(page, 'P10-feedback', lang);
    });
  }

  test('MKT-REV-01: separate ratings, ≤ 600 characters, public or private, then thanks', async ({
    page,
  }) => {
    await prepare(page, { signedIn: true });
    await page.goto('/en/enrolments/enr-mariam-phys/feedback');
    await ready(page);
    await expect(page.getByRole('radiogroup', { name: /Rate The centre/ })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: /Rate Mr Ahmed Samy/ })).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveAttribute('maxlength', '600');
    await expect(page.getByRole('radio', { name: /Post publicly/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Send privately/ })).toBeVisible();
    await page.getByRole('radio', { name: '5 stars out of 5' }).first().click();
    await page.getByRole('button', { name: 'Submit feedback' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you' })).toBeVisible();
    await shot(page, 'P10-thanks', 'en');
  });

  test('BR-REV-01: before the first session, feedback is not open', async ({ page }) => {
    await prepare(page, { signedIn: true });
    await reserveByCard(page, 'en');
    await page.waitForURL(/mock-checkout/);
    await page.getByRole('button', { name: 'Simulate a successful payment' }).click();
    await expect(page.getByRole('heading', { name: 'Place reserved!' })).toBeVisible({
      timeout: 10_000,
    });
    const id = page.url().match(/enr-\d+/)![0];
    await page.goto(`/en/enrolments/${id}/feedback`);
    await ready(page);
    await expect(page.getByText('Feedback opens after the first session')).toBeVisible();
    await shot(page, 'P10-not-yet', 'en');
  });
});
