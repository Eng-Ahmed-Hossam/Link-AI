// Route crawler, pilot mode (the real pilot builds, e2e/serve.mjs): every pilot screen in the route
// manifest (apps/web/src/screens.ts) as the owner, Reception and the teacher, in Arabic and
// English — no HTTP error, no "not found", no console error, no broken link. Demo-only routes,
// the parent app and the dev index must not exist here. Runs after pilot.spec.ts (same server);
// on its own it raises the flag it needs itself. Twin of apps/web/e2e-demo/routes.spec.ts.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { SCREENS, fillPath, type ScreenRole } from '../../web/src/screens';
import { links, visit, watch } from '../../web/e2e-shared/crawl';

const WEB = 'http://127.0.0.1:9443';
const TEACHER = 'http://127.0.0.1:9444';
const HERE = dirname(fileURLToPath(import.meta.url));
const ownerPin = () =>
  readFileSync(join(HERE, '..', '.e2e-data', 'owner-pin.e2e.txt'), 'utf8').trim();
type Lang = 'ar' | 'en';
const LANGS: Lang[] = ['ar', 'en'];

const ready = async (page: Page) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page
    .locator('[aria-busy="true"]')
    .first()
    .waitFor({ state: 'detached', timeout: 15_000 })
    .catch(() => {});
};

async function webSignIn(browser: Browser, name: string, pin: string, lang: Lang) {
  const ctx = await browser.newContext({ baseURL: WEB });
  const page = await ctx.newPage();
  await page.goto(`/${lang}/centre`);
  await page.getByText(name, { exact: true }).click();
  await page.getByTestId('pilot-pin').fill(pin);
  await page.getByTestId('pilot-sign-in').click();
  await expect(page).toHaveURL(/\/centre\/cen-pilot\/today$/);
  return page;
}

const json = async (r: Promise<{ json(): Promise<unknown>; ok(): boolean; status(): number }>) => {
  const res = await r;
  if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
  return res.json() as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/** Two confirmed sessions with the first student absent (raises `consecutive_absences`). */
async function raiseFlag(req: APIRequestContext) {
  for (let i = 0; i < 2; i++) {
    const today = await json(req.get(`${TEACHER}/v1/teachers/me/today`));
    const due =
      today.needsYou.find((n: { kind: string }) => n.kind === 'missing') ?? today.recordDue;
    const rec = await json(
      req.post(`${TEACHER}/v1/groups/${due.groupId}/session-records`, {
        data: { groupSessionId: due.sessionId },
      }),
    );
    await req.patch(`${TEACHER}/v1/session-records/${rec.id}`, {
      data: {
        entries: rec.entries.map((e: { student: { id: string } }, n: number) => ({
          studentId: e.student.id,
          attendance: n === 0 ? 'absent' : 'present',
        })),
      },
    });
    await req.post(`${TEACHER}/v1/session-records/${rec.id}/confirm`, {
      headers: { 'idempotency-key': `crawl-${rec.id}` },
    });
  }
}

const people: Record<string, { name: string; pin: string }> = {};
let params: Record<string, string> = {};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  const owner = await webSignIn(browser, 'هالة', ownerPin(), 'ar');
  people.owner = { name: 'هالة', pin: ownerPin() };
  const added = await json(
    owner.request.post('/v1/pilot/users', { data: { name: 'جولة', role: 'reception' } }),
  );
  people.reception = { name: 'جولة', pin: added.pin };
  const list = await json(owner.request.get('/v1/pilot/people'));
  const salwa = list.find((p: { displayName: string }) => p.displayName === 'سلوى');
  people.teacher = {
    name: 'سلوى',
    pin: (await json(owner.request.post(`/v1/pilot/users/${salwa.id}/pin`))).pin,
  };
  // The teacher's cookie for the API set-up (a flag if pilot.spec has not raised one, a draft).
  const tctx = await browser.newContext({ baseURL: TEACHER });
  const tpage = await tctx.newPage();
  await tpage.goto('/');
  await tpage.getByTestId(`pilot-person-${salwa.id}`).click();
  await tpage.getByTestId('pilot-pin').fill(people.teacher.pin);
  await tpage.getByTestId('pilot-sign-in').click();
  await expect(tpage.getByTestId('screen-today')).toBeVisible();
  let cases = (await json(owner.request.get('/v1/cases'))).data;
  if (!cases.length) {
    await raiseFlag(tpage.request);
    cases = (await json(owner.request.get('/v1/cases'))).data;
  }
  const caseId = cases[0].id;
  let messages = (await json(owner.request.get('/v1/messages'))).data;
  if (!messages.length) {
    await owner.request.post('/v1/messages/drafts', { data: { caseId } });
    messages = (await json(owner.request.get('/v1/messages'))).data;
  }
  const sessions = (await json(owner.request.get('/v1/centres/cen-pilot/sessions'))).data;
  const students = (await json(owner.request.get('/v1/centres/cen-pilot/students'))).data;
  const groups = await json(tpage.request.get('/v1/teachers/me/groups'));
  const today = await json(tpage.request.get('/v1/teachers/me/today'));
  const open =
    today.needsYou.find((n: { kind: string }) => n.kind === 'missing') ?? today.recordDue;
  const draft = await json(
    tpage.request.post(`/v1/groups/${open.groupId}/session-records`, {
      data: { groupSessionId: open.sessionId },
    }),
  );
  params = {
    centreId: 'cen-pilot',
    caseId,
    messageId: messages[0].id,
    recordId: sessions.find((r: { recordId: string | null }) => r.recordId).recordId,
    studentId: students[0].id ?? students[0].student?.id,
    groupId: groups[0].id,
    draftRecordId: draft.id,
  };
  await owner.context().close();
  await tctx.close();
});

for (const lang of LANGS)
  for (const role of ['anyone', 'owner', 'reception'] as ScreenRole[])
    test(`owner web (${lang}) as ${role}: every pilot screen opens, no console error, no broken link`, async ({
      browser,
    }) => {
      test.setTimeout(600_000);
      const page =
        role === 'anyone'
          ? await (await browser.newContext({ baseURL: WEB })).newPage()
          : await webSignIn(browser, people[role]!.name, people[role]!.pin, lang);
      // Signed out, the sign-in page asks the server for a session first: that 401 is the answer.
      const errors = watch(page, role === 'anyone' ? [/status of 401 \(Unauthorized\)/] : []);
      const problems: string[] = [];
      const seen = new Set<string>();
      const found = new Set<string>();
      for (const s of SCREENS.filter(
        (x) => x.app === 'web' && x.modes.includes('pilot') && x.roles.includes(role),
      )) {
        const path = fillPath(s.path, params);
        expect(path, `${s.id} has sample ids`).not.toBeNull();
        seen.add(`/${lang}${path!.split('?')[0]}`);
        problems.push(...(await visit(page, `/${lang}${path}`, ready, errors)));
        for (const l of await links(page)) found.add(l);
      }
      for (const l of found) {
        const u = new URL(l);
        if (seen.has(u.pathname)) continue;
        seen.add(u.pathname);
        problems.push(...(await visit(page, u.pathname + u.search, ready, errors)));
      }
      expect(problems).toEqual([]);
      await page.context().close();
    });

for (const lang of LANGS)
  test(`teacher app (${lang}): every pilot screen opens, no console error`, async ({ browser }) => {
    test.setTimeout(600_000);
    const ctx = await browser.newContext({
      baseURL: TEACHER,
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    await page.addInitScript((l) => localStorage.setItem('link.locale', l), lang);
    const list = await json(page.request.get('/v1/pilot/people'));
    const salwa = list.find((p: { displayName: string }) => p.displayName === 'سلوى');
    await page.goto('/');
    await page.getByTestId(`pilot-person-${salwa.id}`).click();
    await page.getByTestId('pilot-pin').fill(people.teacher!.pin);
    await page.getByTestId('pilot-sign-in').click();
    await expect(page.getByTestId('screen-today')).toBeVisible();
    const errors = watch(page);
    const problems: string[] = [];
    const p = { ...params, recordId: params.draftRecordId };
    for (const s of SCREENS.filter((x) => x.app === 'teacher' && x.modes.includes('pilot'))) {
      const path = fillPath(s.path, p);
      expect(path, `${s.id} has sample ids`).not.toBeNull();
      problems.push(...(await visit(page, path!, ready, errors)));
    }
    expect(problems).toEqual([]);
    await ctx.close();
  });

test('not in the pilot: the parent app, public pages, the dev index, marketplace pages', async ({
  browser,
}) => {
  const page = await webSignIn(browser, people.owner!.name, people.owner!.pin, 'ar');
  for (const s of SCREENS.filter((x) => x.app === 'web' && !x.modes.includes('pilot'))) {
    const path = fillPath(s.path, {
      ...params,
      centreSlug: 'x',
      teacherSlug: 'x',
      enrolmentId: 'x',
      paymentId: 'x',
    })!;
    if (path.startsWith('/centre/')) {
      // Inside the workspace (C02–C07): the app's own not-found page. V06 is reached in the
      // demo only (the pilot logs a reply on the outcome), so it is not checked here.
      if (s.id === 'V06') continue;
      await page.goto(`/ar${path}`);
      await expect(page.getByTestId('not-found'), s.id).toBeVisible();
    } else {
      expect((await page.request.get(`/ar${path}`)).status(), `${s.id} ${path}`).toBe(404);
    }
  }
  // The 404 that started this, in the pilot too: no centre id → sign-in → the person's Today.
  await page.goto('/ar/centre/today');
  await expect(page).toHaveURL(/\/ar\/centre\/cen-pilot\/today$/);
  await page.goto('/en/centre/cen-unknown/today');
  await expect(page.getByTestId('centre-not-found')).toContainText("We couldn't find this centre");
  await page.context().close();
});
