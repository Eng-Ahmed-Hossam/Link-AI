import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { COMBOS, URLS, checkPage, newPage, stagingCode } from './check';

/**
 * The live staging (the real core-api, sample data). Each role signs in ONCE per run through the
 * real sign-in screen (the code from the private inbox), then the session is reused for every
 * language and width — sample phones allow 3 codes per 10 minutes. Read-mostly: nothing is reset.
 */
const S = URLS.staging;
const env = 'staging' as const;
const PHONE = {
  parent: '1000000001',
  teacher: '1000000002',
  owner: '1000000003',
  agent: '1000000051',
};
const stateFile = (role: string) => join(tmpdir(), `link-smoke-${role}-${process.pid}.json`);

async function webSignIn(page: Page, role: 'owner' | 'parent') {
  const centre = role === 'owner';
  await page.goto(`${S.web}/ar/${centre ? 'centre' : 'welcome'}`);
  await page.locator('input[type=tel]').waitFor({ timeout: 60_000 });
  const since = Date.now();
  await page.locator('input[type=tel]').fill(PHONE[role]);
  await (
    centre ? page.getByTestId('owner-send-code') : page.locator('form button[type=submit]')
  ).click();
  await page
    .locator('input[autocomplete=one-time-code]')
    .fill(await stagingCode(PHONE[role], since));
  await page.waitForURL(centre ? /\/centre\/[^/]+\// : /\/search$/, { timeout: 60_000 });
}

test('staging: visitor pages and maps', async ({ browser }) => {
  const problems: string[] = [];
  for (const c of COMBOS) {
    const { ctx, page } = await newPage(browser, c);
    problems.push(
      ...(await checkPage(
        page,
        {
          env,
          app: 'web',
          role: 'visitor',
          page: 'W00 landing',
          action: 'hero + staging banner',
          ...c,
        },
        async () => {
          await page.goto(`${S.web}/${c.lang}`);
          await expect(page.locator('h1').first()).toBeVisible();
          await expect(page.getByTestId('env-banner')).toBeVisible();
        },
      )),
      ...(await checkPage(
        page,
        {
          env,
          app: 'web',
          role: 'visitor',
          page: 'P03 map & results',
          action: 'results listed, map drawn',
          ...c,
        },
        async () => {
          await page.goto(`${S.web}/${c.lang}/search/results?radiusKm=50`);
          await expect(page.locator('a[href*="/centres/"]').first()).toBeVisible();
          return { map: 'main' };
        },
      )),
      ...(await checkPage(
        page,
        {
          env,
          app: 'web',
          role: 'visitor',
          page: 'P04 centre',
          action: 'centre map + Google Maps link',
          ...c,
        },
        async () => {
          await page.goto(`${S.web}/${c.lang}/centres/al-nour-maadi`);
          await expect(page.getByTestId('open-in-maps')).toBeVisible();
          return { map: '[data-testid=centre-map]' };
        },
      )),
    );
    await ctx.close();
  }
  expect(problems).toEqual([]);
});

test('staging: owner signs in (real code) — schedule and the location picker', async ({
  browser,
}) => {
  const problems: string[] = [];
  let base = '';
  for (const [i, c] of COMBOS.entries()) {
    const { ctx, page } = await newPage(browser, c, i ? stateFile('owner') : undefined);
    if (!i)
      problems.push(
        ...(await checkPage(
          page,
          {
            env,
            app: 'web',
            role: 'owner',
            page: 'A18 sign-in',
            action: 'phone code from the inbox → own centre',
            ...c,
          },
          async () => {
            await webSignIn(page, 'owner');
            base = page
              .url()
              .match(/^.*\/centre\/[^/]+/)![0]
              .replace(/\/(ar|en)\//, '/');
            await ctx.storageState({ path: stateFile('owner') });
          },
        )),
      );
    const centre = base
      .replace(S.web, `${S.web}/${c.lang}`)
      .replace(`/${c.lang}/centre`, `/${c.lang}/centre`);
    problems.push(
      ...(await checkPage(
        page,
        { env, app: 'web', role: 'owner', page: 'C03 schedule', action: 'schedule loads', ...c },
        async () => {
          await page.goto(`${centre}/schedule`.replace(/\/centre\//, `/centre/`));
          await expect(page.locator('main')).toBeVisible();
        },
      )),
      ...(await checkPage(
        page,
        {
          env,
          app: 'web',
          role: 'owner',
          page: 'C02 location',
          action: 'map drawn, Edit pin opens search',
          ...c,
        },
        async () => {
          await page.goto(`${centre}/profile`);
          await page.getByTestId('edit-pin').click();
          await expect(page.getByTestId('location-search')).toBeVisible();
          return { map: '[data-testid=location-card]' };
        },
      )),
    );
    await ctx.close();
  }
  expect(problems).toEqual([]);
});

test('staging: parent signs in (real code) — children', async ({ browser }) => {
  const problems: string[] = [];
  for (const [i, c] of COMBOS.entries()) {
    const { ctx, page } = await newPage(browser, c, i ? stateFile('parent') : undefined);
    if (!i)
      problems.push(
        ...(await checkPage(
          page,
          {
            env,
            app: 'web',
            role: 'parent',
            page: 'P01 sign-in',
            action: 'phone code from the inbox → search',
            ...c,
          },
          async () => {
            await webSignIn(page, 'parent');
            await ctx.storageState({ path: stateFile('parent') });
          },
        )),
      );
    problems.push(
      ...(await checkPage(
        page,
        {
          env,
          app: 'web',
          role: 'parent',
          page: 'P09 my children',
          action: 'children list loads',
          ...c,
        },
        async () => {
          await page.goto(`${S.web}/${c.lang}/children`);
          await expect(page.locator('main h1, main h2').first()).toBeVisible();
        },
      )),
    );
    await ctx.close();
  }
  expect(problems).toEqual([]);
});

test('staging: teacher signs in (real code) — tabs and J01 map', async ({ browser }) => {
  const problems: string[] = [];
  for (const [i, c] of COMBOS.entries()) {
    const { ctx, page } = await newPage(browser, c, i ? stateFile('teacher') : undefined);
    await page.addInitScript((l) => localStorage.setItem('link.locale', l), c.lang);
    if (!i)
      problems.push(
        ...(await checkPage(
          page,
          {
            env,
            app: 'teacher',
            role: 'teacher',
            page: 'T14 sign-in',
            action: 'phone code from the inbox → My groups',
            ...c,
          },
          async () => {
            await page.goto(`${S.teacher}/sign-in`);
            const since = Date.now();
            await page.getByTestId('t14-phone').fill(PHONE.teacher);
            await page.getByTestId('t14-send').click();
            await page.getByTestId('t14-code').fill(await stagingCode(PHONE.teacher, since));
            await page.getByTestId('t14-verify').click();
            await expect(page.getByTestId('screen-t09')).toBeVisible({ timeout: 60_000 });
            await ctx.storageState({ path: stateFile('teacher') });
          },
        )),
      );
    for (const [path, id, name] of [
      ['/groups', 'screen-t09', 'T09 groups'],
      ['/rooms', 'screen-j01', 'J01 rooms'],
      ['/earnings', 'screen-j07', 'J07 earnings'],
      ['/today', 'screen-today', 'T01 follow-up'],
    ] as const)
      problems.push(
        ...(await checkPage(
          page,
          { env, app: 'teacher', role: 'teacher', page: name, action: `${path} tab loads`, ...c },
          async () => {
            await page.goto(`${S.teacher}${path}`);
            await expect(page.getByTestId(id)).toBeVisible({ timeout: 60_000 });
            if (path === '/rooms') return { map: '[data-testid=j01-map]' };
          },
        )),
      );
    await ctx.close();
  }
  expect(problems).toEqual([]);
});

test('staging: ops agent signs in (real code) — centre requests', async ({ browser }) => {
  const problems: string[] = [];
  for (const [i, c] of COMBOS.entries()) {
    const { ctx, page } = await newPage(browser, c, i ? stateFile('agent') : undefined);
    if (!i)
      problems.push(
        ...(await checkPage(
          page,
          {
            env,
            app: 'ops',
            role: 'ops agent',
            page: 'ops sign-in',
            action: 'phone code from the inbox → L01',
            ...c,
          },
          async () => {
            await page.goto(`${S.ops}/en/sign-in`);
            const since = Date.now();
            await page.locator('input[type=tel]').fill(PHONE.agent);
            await page.getByTestId('ops-send-code').click();
            await page
              .locator('input[autocomplete=one-time-code]')
              .fill(await stagingCode(PHONE.agent, since));
            await page.waitForURL(/\/en\/centres$/, { timeout: 60_000 });
            await ctx.storageState({ path: stateFile('agent') });
          },
        )),
      );
    problems.push(
      ...(await checkPage(
        page,
        {
          env,
          app: 'ops',
          role: 'ops agent',
          page: 'L01 centre requests',
          action: 'pipeline loads',
          ...c,
        },
        async () => {
          await page.goto(`${S.ops}/${c.lang}/centres`);
          await expect(page.locator('h1').first()).toBeVisible();
        },
      )),
    );
    await ctx.close();
  }
  expect(problems).toEqual([]);
});
