// Route crawler, demo mode (`pnpm demo`): every screen in the route manifest (src/screens.ts), as
// each role, in Arabic and English. Fails on an HTTP error, a "not found" page, a console error or
// exception, or a broken same-origin link on any page it opens. The pilot twin is
// apps/pilot/e2e/routes.spec.ts.
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_PARAMS, SCREENS, fillPath, type ScreenRole } from '../src/screens';
import { links, teacherRoutes, unlisted, visit, watch, webRoutes } from '../e2e-shared/crawl';
import {
  MOCK,
  TEACHER_APP,
  demoState,
  provider,
  ready,
  reply,
  resetScenario,
  signIn,
  teacherConfirmsMariamAbsent,
  type Lang,
} from './helpers';

const ROOT = join(__dirname, '..', '..', '..');
const LANGS: Lang[] = ['ar', 'en'];
const WEB_ROLES: ScreenRole[] = ['anyone', 'parent', 'owner', 'reception'];

const call = async (method: string, path: string, token: string, body?: unknown) => {
  const res = await fetch(`${MOCK}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'idempotency-key': `crawl-${path}-${Date.now()}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
};

/**
 * The scenario's ids, plus what only a flow creates: a case for Mariam with an approved,
 * delivered message she replied to (A06/A09, V06), a fresh reservation with a card checkout (P07,
 * P08, the mock provider page) and the teacher's draft record (T02–T08).
 */
async function demoParams(): Promise<Record<string, string>> {
  await resetScenario({ marketplace: true });
  await teacherConfirmsMariamAbsent();
  const s = await demoState();
  const mariam = s.cases.find((c: { student: string }) => c.student === 'Mariam Hassan');
  const msg = await call('POST', '/v1/messages/drafts', 'mock.usr-reception', {
    caseId: mariam.id,
  });
  await call('POST', `/v1/messages/${msg.id}/approve`, 'mock.usr-reception', { checked: true });
  await provider('advance');
  await provider('advance');
  await reply();
  const group = await call('GET', '/v1/groups/grp-salma-ws', 'mock.usr-parent');
  const enr = await call('POST', '/v1/enrolments', 'mock.usr-parent', {
    groupId: group.id,
    studentId: 'chd-mariam',
    paymentPlan: 'per_session',
    sessionId: group.upcomingSessions[0].id,
    sharePhone: false,
  });
  const pay = await call('POST', `/v1/enrolments/${enr.id}/checkout`, 'mock.usr-parent', {
    method: 'card',
  });
  // A draft record for the teacher screens (T02–T08): the oldest session still without one.
  const today = await call('GET', '/v1/teachers/me/today', 'mock.usr-salma');
  const open =
    today.needsYou.find((n: { kind: string }) => n.kind === 'missing') ?? today.recordDue;
  const draft = await call('POST', `/v1/groups/${open.groupId}/session-records`, 'mock.usr-salma', {
    groupSessionId: open.sessionId,
  });
  const after = await demoState();
  return {
    ...DEMO_PARAMS,
    caseId: mariam.id,
    messageId: msg.id,
    recordId: after.signals
      .find((x: { student: string }) => x.student === 'Mariam Hassan')
      .evidence.at(-1).recordId,
    enrolmentId: enr.id,
    paymentId: String(pay.checkoutUrl).split('/').pop()!.split('?')[0]!,
    draftRecordId: draft.id,
  };
}

test.describe.configure({ mode: 'serial' });
let params: Record<string, string>;
let before: Record<string, unknown>;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  before = (await demoState()).demo;
  params = await demoParams();
});

test('the route manifest lists every page file of both apps', () => {
  expect(unlisted(webRoutes(join(ROOT, 'apps', 'web', 'app')), 'web')).toEqual([]);
  expect(unlisted(teacherRoutes(join(ROOT, 'apps', 'teacher-app', 'app')), 'teacher')).toEqual([]);
});

for (const lang of LANGS)
  for (const role of WEB_ROLES)
    test(`web (${lang}) as ${role}: every screen opens, no console error, no broken link`, async ({
      page,
    }) => {
      test.setTimeout(1_200_000);
      if (role !== 'anyone') await signIn(page, role as 'owner' | 'reception' | 'parent', lang);
      const errors = watch(page);
      const problems: string[] = [];
      const seen = new Set<string>();
      const found = new Set<string>();
      for (const s of SCREENS.filter(
        (x) => x.app === 'web' && x.modes.includes('demo') && x.roles.includes(role),
      )) {
        const path = fillPath(s.path, params);
        expect(path, `${s.id} has sample ids`).not.toBeNull();
        const url = `/${lang}${path}`;
        seen.add(new URL(url, 'http://x').pathname);
        problems.push(...(await visit(page, url, ready, errors)));
        for (const l of await links(page)) found.add(l);
      }
      // Every same-origin link those pages show, once.
      for (const l of found) {
        const u = new URL(l);
        if (seen.has(u.pathname) || u.pathname.endsWith('/dev')) continue;
        seen.add(u.pathname);
        problems.push(...(await visit(page, u.pathname + u.search, ready, errors)));
      }
      expect(problems).toEqual([]);
    });

/** Signed in as the sample teacher, in `lang`, on the first load (the app keeps it after). */
async function teacher(page: Page, lang: Lang) {
  await page.addInitScript((l) => {
    if (sessionStorage.getItem('crawl.prepared')) return;
    sessionStorage.setItem('crawl.prepared', '1');
    localStorage.clear();
    localStorage.setItem(
      'link.teacher.session',
      JSON.stringify({ accessToken: 'mock.usr-salma', userId: 'usr-salma' }),
    );
    localStorage.setItem('link.locale', l);
  }, lang);
}

const teacherReady = async (page: Page) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(300);
};

for (const lang of LANGS)
  test(`teacher app (${lang}): every screen opens, no console error`, async ({ browser }) => {
    test.setTimeout(1_200_000);
    const ctx = await browser.newContext({
      baseURL: TEACHER_APP,
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    await teacher(page, lang);
    const errors = watch(page);
    const problems: string[] = [];
    const p = { ...params, recordId: params.draftRecordId, studentId: 'chd-mariam' };
    // T-TRY resets the shared scenario, so it has its own test below.
    for (const s of SCREENS.filter(
      (x) => x.app === 'teacher' && x.modes.includes('demo') && x.id !== 'T-TRY',
    )) {
      const path = fillPath(s.path, p);
      expect(path, `${s.id} has sample ids`).not.toBeNull();
      problems.push(...(await visit(page, path!, teacherReady, errors)));
    }
    expect(problems).toEqual([]);
    await ctx.close();
  });

test('teacher app /try (path A as a teacher): Today under my centre name, with the demo banner', async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    baseURL: TEACHER_APP,
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  const errors = watch(page);
  const path = fillPath(SCREENS.find((x) => x.id === 'T-TRY')!.path, params)!;
  await page.goto(path);
  await expect(page.getByTestId('screen-today')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('try-banner')).toContainText(DEMO_PARAMS.centreName!);
  await page.getByTestId('try-reset').click();
  await page.waitForURL(/localhost:3000\/ar$/);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('website path A as a centre, on the shared mock server: "List your centre" → try → Today under my centre name', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const errors = watch(page);
  const failed: string[] = [];
  page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));
  await page.goto('/ar');
  await page.locator('#pricing a[href="/ar/try?role=centre"]').click();
  await page.getByLabel('اسم مركزك').fill('مركز الأمل');
  await page.getByRole('radio', { name: /المالك/ }).click();
  await page.getByTestId('try-submit').click();
  // The website pages load no app providers: the try flow must still reach the mock server (it
  // once called the web app instead: HTTP 404).
  await expect(page).toHaveURL(/\/ar\/centre\/cen-nour\/today$/, { timeout: 60_000 });
  await expect(page.getByTestId('try-centre')).toHaveText('مركز الأمل');
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
  // Put the shared sample scenario back for the other tests and for the people using the demo.
  const back = await request.post('http://localhost:4010/__demo/reset', {
    data: { scenario: 'demo-followup' },
  });
  expect(back.ok()).toBe(true);
});

test('links without the centre id and unknown pages', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, 'owner');
  // The 404 that started this: /ar/centre/today (no centre id) → sign-in → the owner's Today.
  await page.goto('/ar/centre/today');
  await expect(page).toHaveURL(/\/ar\/centre\/cen-nour\/today$/);
  await page.goto(`/en/centre/follow-ups/${params.caseId}`);
  await expect(page).toHaveURL(new RegExp(`/en/centre/cen-nour/follow-ups/${params.caseId}$`));
  await page.goto('/ar/centre/cen-nour');
  await expect(page).toHaveURL(/\/ar\/centre\/cen-nour\/today$/);
  // An unknown centre: a real "not found" with a way back, in the page's language.
  await page.goto('/en/centre/cen-unknown/today');
  await expect(page.getByTestId('centre-not-found')).toContainText("We couldn't find this centre");
  await page.getByRole('link', { name: 'Go to my centre' }).click();
  await expect(page).toHaveURL(/\/en\/centre\/cen-nour\/today$/);
  // Any other unknown path: the app's not-found page, not the bare Next.js 404.
  const res = await page.goto('/ar/no-such-page');
  expect(res?.status()).toBe(404);
  await expect(page.getByTestId('not-found')).toContainText('لم نجد هذه الصفحة');
  await page.getByRole('link', { name: 'اذهب إلى البداية' }).click();
  await expect(page).toHaveURL(/\/ar$/); // the landing page
});

test('teacher app: an unknown path shows "not found" with a way back', async ({ browser }) => {
  const ctx = await browser.newContext({
    baseURL: TEACHER_APP,
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  await teacher(page, 'en');
  await page.goto('/no-such-screen');
  await expect(page.getByTestId('screen-not-found')).toBeVisible();
  await page.getByTestId('not-found-home').click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
  await ctx.close();
});

test('dev index: every screen listed, one-click sign-in works', async ({ page }) => {
  await page.goto('/en/dev');
  for (const s of SCREENS) await expect(page.getByTestId(`dev-screen-${s.id}`)).toBeVisible();
  await page.getByTestId('dev-sign-in-owner').click();
  await expect(page.getByTestId('dev-signed-in')).toHaveText('Signed in as Owner (Tamer).');
  await page.getByRole('link', { name: '/en/centre/cen-nour/today' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await page.goto('/en/dev');
  await page.getByTestId('dev-open-demo-controls').click();
  await expect(page.getByRole('dialog', { name: 'Demo controls' })).toBeVisible();
  expect(await page.getByTestId('dev-sign-in-teacher').getAttribute('href')).toMatch(
    /:8081\/sign-in\?sample=1$/,
  );
});

test.afterAll(async () => {
  await resetScenario(before); // a fresh scenario, with the demo switches as they were
});
