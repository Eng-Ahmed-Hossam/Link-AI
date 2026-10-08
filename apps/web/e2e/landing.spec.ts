// The public website: the landing page (a copy of Figma 68:616, PRODUCT_BRIEF), path A "Try
// Link" (the role chooser, 2A.1: each role's app signed in as a sample user, in the browser) and
// the requests emailed to the Link team (path B and the landing's "Get started" form).
// Runs in API mode `mock` (the in-browser MSW backend), the mode the public demo ships in.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type Request } from '@playwright/test';
import { axe, prepare, type Lang } from './helpers';

const SHOTS = join(__dirname, '..', '..', '..', 'docs', 'frontend', 'screenshots', 'landing');
mkdirSync(SHOTS, { recursive: true });
const LANGS: Lang[] = ['ar', 'en'];
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

/** Scroll the whole page once so lazy images load, then capture it for the report. */
async function capture(page: Page, name: string) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  // Sections below the fold render only near the screen (content-visibility); a full-page
  // capture needs them all drawn.
  await page.addStyleTag({ content: '.site-lazy { content-visibility: visible !important; }' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
};

for (const lang of LANGS)
  for (const [vp, size] of Object.entries(VIEWPORTS))
    test(`landing (${lang}, ${vp}): every section, axe clean, no console error`, async ({
      browser,
    }) => {
      const page = await (
        await browser.newContext({
          viewport: size,
          deviceScaleFactor: vp === 'desktop' ? 1 : 2,
          isMobile: vp === 'mobile',
          reducedMotion: 'reduce',
        })
      ).newPage();
      const errors = errorsOf(page);
      await page.goto(`/${lang}`);
      await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        lang === 'ar' ? 'تكلّم بعد الحصة.' : 'Speak after class.',
      );
      await expect(page.getByTestId('cta-try-hero')).toBeVisible();
      // Figma's 12 sections, in order: nav + hero, then 10 sections, then the footer.
      await expect(page.locator('.site-root > section')).toHaveCount(11);
      for (const id of ['how-it-works', 'features', 'marketplace', 'pricing', 'faq', 'join'])
        await expect(page.locator(`#${id}`)).toBeAttached();
      // Marketplace first (PRODUCT_BRIEF): the marketplace and pricing sections are on the page.
      await expect(page.locator('#marketplace h2')).toHaveText(
        lang === 'ar'
          ? 'أولياء الأمور يجدون المعلّمين. والمعلّمون يجدون القاعات.'
          : 'Parents find teachers. Teachers find rooms.',
      );
      await expect(page.locator('#pricing li[class*="rounded-[28px]"]')).toHaveCount(3);
      // Every "try / get started" button goes to the role chooser.
      for (const a of await page.locator('a[href*="/try"]').all())
        expect(await a.getAttribute('href')).toMatch(
          new RegExp(`^/${lang}/try([?]role=(centre|teacher|parent))?$`),
        );
      // The website never starts the app's mock backend.
      expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
      await axe(page);
      await capture(page, `W00-landing.${lang}.${vp}`);
      expect(errors).toEqual([]);
    });

test('FAQ: one answer open at a time, no JavaScript needed', async ({ page }) => {
  await page.goto('/en#faq');
  const items = page.locator('#faq details');
  await expect(items).toHaveCount(6);
  await expect(items.nth(0)).toHaveAttribute('open', '');
  await items.nth(2).locator('summary').click();
  await expect(items.nth(2)).toHaveAttribute('open', '');
  await expect(items.nth(0)).not.toHaveAttribute('open', '');
  await expect(items.nth(2)).toContainText('Link drafts the WhatsApp update');
});

test('SEO: description, canonical, hreflang, Open Graph and the social card, per language', async ({
  page,
}) => {
  for (const lang of LANGS) {
    await page.goto(`/${lang}`);
    const meta = (sel: string) => page.locator(sel).first().getAttribute('content');
    expect(await meta('meta[name="description"]')).toBeTruthy();
    expect(await meta('meta[property="og:image"]')).toContain(`/og/landing-${lang}.png`);
    expect(await meta('meta[property="og:locale"]')).toBe(lang === 'ar' ? 'ar_EG' : 'en_GB');
    expect(await meta('meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toMatch(
      new RegExp(`/${lang}$`),
    );
    for (const alt of ['ar', 'en'])
      await expect(page.locator(`link[rel="alternate"][hreflang="${alt}"]`)).toHaveCount(1);
    const og = await page.request.get(`/og/landing-${lang}.png`);
    expect(og.status()).toBe(200);
  }
});

/** Every request the page makes leaves the browser only for our own static files. */
function networkLog(page: Page) {
  const outside: string[] = [];
  const apiCalls: Request[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== 'http://localhost:3000') outside.push(r.url());
    else if (/^\/(v1|__demo|__mock|api)\//.test(u.pathname)) apiCalls.push(r);
  });
  return { outside, apiCalls };
}

test('2A.1 role chooser: Centre owner opens the Room schedule, signed in — nothing leaves the browser', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await prepare(page);
  const net = networkLog(page);
  await page.goto('/ar');
  await page.getByTestId('cta-try-hero').click();
  await expect(page).toHaveURL(/\/ar\/try$/);
  // Three roles, one card each.
  for (const role of ['parent', 'teacher', 'owner'])
    await expect(page.getByTestId(`role-${role}`)).toBeVisible();
  await axe(page);
  await capture(page, 'W-TRY.ar.mobile');
  await page.getByTestId('role-owner').click();
  await expect(page).toHaveURL(/\/ar\/centre\/cen-nour\/schedule$/, { timeout: 30_000 });
  // The centre web is a desktop app (Figma owner frames are 1440 wide).
  await page.setViewportSize({ width: 1440, height: 900 });
  // The banner: "Demo — sample data", "Switch role" and "Reset demo" only (2A.6).
  const banner = page.getByTestId('try-banner');
  await expect(banner).toContainText('عرض تجريبي — بيانات تجريبية');
  await expect(banner.getByTestId('switch-role')).toHaveAttribute('href', '/ar/try');
  await expect(banner.getByRole('link')).toHaveCount(1);
  await expect(banner.getByRole('button')).toHaveCount(1);
  await expect(page.getByText('Demo controls')).toHaveCount(0);
  // One connected product (OD-58): the marketplace, and Follow-up as a labelled paid extra.
  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('link', { name: 'الصفحة العامة' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'المتابعات', exact: true })).toBeVisible();
  await expect(page.getByTestId('nav-tag-followup')).toHaveText('إضافة مدفوعة');
  await expect(page.getByTestId('followup-today-card')).toBeVisible();
  await capture(page, 'W-TRY-demo.ar.desktop');

  // The proof: every API call was answered inside the browser (the MSW worker), none reached a
  // server, and no request went to any other origin (analytics is off: no key in tests).
  expect(net.outside).toEqual([]);
  expect(net.apiCalls.length).toBeGreaterThan(3);
  for (const r of net.apiCalls) {
    const res = await r.response();
    expect(res?.fromServiceWorker(), `${r.method()} ${r.url()}`).toBe(true);
  }

  // "Switch role" goes back to the chooser without resetting the story.
  await banner.getByTestId('switch-role').click();
  await expect(page).toHaveURL(/\/ar\/try$/);
  // "Reset demo" wipes the browser and goes home.
  await page.getByTestId('role-owner').click();
  await expect(page).toHaveURL(/\/schedule$/, { timeout: 30_000 });
  await page.getByTestId('try-reset').click();
  await expect(page).toHaveURL(/\/ar$/);
  const left = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => /^link\.(try|session|mock)/.test(k)),
  );
  expect(left).toEqual([]);
});

test('2A.1 role chooser: Parent opens Search signed in; Teacher opens the teacher app', async ({
  page,
}) => {
  await prepare(page);
  await page.goto('/en/try');
  await page.getByTestId('role-parent').click();
  await expect(page).toHaveURL(/\/en\/search$/, { timeout: 30_000 });
  await expect(page.getByTestId('try-banner')).toBeVisible();
  await page.getByTestId('try-reset').click();
  await expect(page).toHaveURL(/\/en$/);
  // Teacher: the browser goes to the teacher app's /try with the language (no centre name).
  await page.route('http://localhost:8081/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: '<p>teacher app</p>' }),
  );
  await page.goto('/ar/try');
  await page.getByTestId('role-teacher').click();
  await page.waitForURL(/localhost:8081\/try/);
  const u = new URL(page.url());
  expect(u.searchParams.get('lang')).toBe('ar');
  expect(u.searchParams.get('centre')).toBeNull();
});

test('path A: after two minutes, a gentle pilot card on a home page only — never mid-task', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.clock.install();
  await prepare(page);
  await page.goto('/ar/try');
  await page.getByTestId('role-owner').click();
  await expect(page).toHaveURL(/\/schedule$/, { timeout: 30_000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId('try-pilot-card')).toHaveCount(0);
  // In a task (editing rooms) when two minutes pass: nothing appears.
  await page.goto('/ar/centre/cen-nour/rooms');
  await page.clock.fastForward('02:05');
  await expect(page.getByTestId('try-pilot-card')).toHaveCount(0);
  // Back on the owner's home (between tasks): the card.
  await page.goto('/ar/centre/cen-nour/schedule');
  await expect(page.getByTestId('try-pilot-card')).toBeVisible();
  await expect(page.getByTestId('try-pilot-card')).toContainText('تحب تجرّب ده في مركزك الحقيقي؟');
  await axe(page);
  await capture(page, 'W-TRY-card.ar.desktop');
  await page.getByTestId('try-pilot-card').getByRole('link').click();
  await expect(page).toHaveURL(/\/ar\/pilot$/);
  // Shown once: not again after it was used.
  await page.goto('/ar/centre/cen-nour/schedule');
  await expect(page.getByTestId('try-banner')).toBeVisible();
  await expect(page.getByTestId('try-pilot-card')).toHaveCount(0);
});

test('path B: the pilot request checks every field, then confirms', async ({ page }) => {
  await prepare(page);
  // Each run gets its own address for the rate limit (5 per 10 minutes per address).
  const ip = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  await page.route('**/api/pilot-request', (r) =>
    r.continue({ headers: { ...r.request().headers(), 'x-forwarded-for': ip } }),
  );
  await page.goto('/ar/pilot');
  await page.getByTestId('pilot-submit').click();
  for (const msg of [
    'اكتب اسم المركز.',
    'اكتب اسمك.',
    'اكتب رقم موبايل مصري (١١ رقمًا يبدأ بـ ٠١).',
    'اكتب منطقة المركز.',
    'اكتب رقمًا من ١ إلى ٥٠٠.',
    'ضع علامة في المربّع حتى نستطيع التواصل معك.',
  ])
    await expect(page.getByText(msg)).toBeVisible();
  await axe(page);
  await page.getByLabel('اسم المركز').fill('مركز الأمل');
  await page.getByLabel('اسمك').fill('هبة مصطفى');
  await page.getByLabel('الهاتف أو واتساب').fill('٠١٠ ١٢٣٤ ٥٦٧٨');
  await page.getByLabel('المنطقة').fill('مدينة نصر');
  await page.getByLabel('عدد المعلّمين').fill('٨');
  await page.getByText('أوافق على أن يتواصل معي فريق لينك').click();
  await capture(page, 'W-PILOT.ar.mobile');
  const sent = page.waitForResponse('**/api/pilot-request');
  await page.getByTestId('pilot-submit').click();
  expect((await sent).status()).toBe(200);
  await expect(page.getByTestId('pilot-done')).toContainText('شكرًا! هنتواصل معاك خلال يوم عمل.');
  await axe(page);
  await capture(page, 'W-PILOT-done.ar.mobile');
});

test('path B API: bad input 400, honeypot dropped, rate limit 429', async ({ request }) => {
  const ip = `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const headers = { 'x-forwarded-for': ip };
  const good = {
    centreName: 'مركز الأمل',
    contactName: 'هبة مصطفى',
    phone: '01012345678',
    area: 'مدينة نصر',
    teachers: 8,
    consent: true,
    lang: 'ar',
  };
  const bad = await request.post('/api/pilot-request', { data: { ...good, phone: '12' }, headers });
  expect(bad.status()).toBe(400);
  expect(await bad.json()).toMatchObject({ code: 'validation_failed', errors: ['phone'] });
  const spam = await request.post('/api/pilot-request', {
    data: { ...good, website: 'x' },
    headers,
  });
  expect(await spam.json()).toEqual({ ok: true });
  const codes: number[] = [];
  for (let i = 0; i < 6; i++)
    codes.push((await request.post('/api/pilot-request', { data: good, headers })).status());
  // The bad one counted too: 4 more pass, then 429.
  expect(codes).toEqual([200, 200, 200, 200, 429, 429]);
});

test('sign in (pilot centres): pilots are being set up, with the way to request one', async ({
  page,
}) => {
  await page.goto('/en');
  await page.locator('header').getByRole('link', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in for pilot centres');
  await axe(page);
  await capture(page, 'W-SIGNIN.en.mobile');
  await page
    .getByRole('main')
    .getByRole('link', { name: /Request a free pilot/ })
    .click();
  await expect(page).toHaveURL(/\/en\/pilot$/);
});

test('product tabs: owner dashboard, teacher app, parent updates (Figma renders, no JavaScript)', async ({
  page,
}) => {
  await page.goto('/en');
  const tabs = page.getByRole('radiogroup', { name: 'One place to see who needs attention today' });
  await expect(page.getByTestId('product-owner')).toBeVisible();
  await expect(page.getByTestId('product-teacher')).toBeHidden();
  await tabs.getByText('Teacher app').click();
  await expect(page.getByTestId('product-teacher')).toBeVisible();
  await expect(page.getByTestId('product-owner')).toBeHidden();
  await expect(tabs.getByRole('radio', { name: 'Teacher app' })).toBeChecked();
  await tabs.getByText('Parent updates').click();
  await expect(page.getByTestId('product-parent').getByRole('img')).toHaveAttribute(
    'alt',
    /WhatsApp update/,
  );
});

test('landing "Get started" form (section 11): checks every field, then sends the request', async ({
  page,
}) => {
  const ip = `10.2.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  await page.route('**/api/pilot-request', (r) =>
    r.continue({ headers: { ...r.request().headers(), 'x-forwarded-for': ip } }),
  );
  await page.goto('/ar#join');
  const form = page.getByTestId('pilot-form');
  await expect(form).toBeVisible();
  await expect(form.getByRole('button', { name: 'اطلب حسابك المجاني' })).toBeVisible();
  await form.getByTestId('pilot-submit').click();
  for (const msg of [
    'اكتب اسمك.',
    'اكتب اسم المركز.',
    'اكتب منطقة المركز.',
    'اكتب رقمًا من ١ إلى ٥٠٠.',
    'اكتب رقم موبايل مصري (١١ رقمًا يبدأ بـ ٠١).',
    'ضع علامة في المربّع حتى نستطيع التواصل معك.',
  ])
    await expect(form.getByText(msg)).toBeVisible();
  await axe(page);
  await form.getByLabel('اسمك').fill('هبة مصطفى');
  await form.getByLabel('اسم المركز').fill('مركز الأمل');
  await form.getByLabel('المنطقة').fill('مدينة نصر');
  await form.getByLabel('عدد المعلّمين').fill('٨');
  await form.getByLabel('رقم واتساب').fill('+20 10 1234 5678');
  await form.getByText('أوافق على أن يتواصل معي فريق لينك').click();
  const sent = page.waitForResponse('**/api/pilot-request');
  await form.getByTestId('pilot-submit').click();
  const res = await sent;
  expect(res.status()).toBe(200);
  expect(res.request().postDataJSON()).toMatchObject({
    contactName: 'هبة مصطفى',
    centreName: 'مركز الأمل',
    lang: 'ar',
  });
  await expect(page.getByTestId('pilot-done')).toContainText('شكرًا! هنتواصل معاك خلال يوم عمل.');
});
