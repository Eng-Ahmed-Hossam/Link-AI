import { expect, test } from '@playwright/test';
import { COMBOS, URLS, checkPage, newPage } from './check';

/**
 * The public trial (link-ai-web + the teacher demo app on the Railway demo API): an anonymous
 * visitor, through the role chooser, in each role. Every visit gets its own sandbox (ADR-0010):
 * nothing here touches another visitor's data or the shared seed.
 */
const T = URLS.publicTrial;
const env = 'public trial' as const;

test('public trial: landing and the role chooser', async ({ browser }) => {
  const problems: string[] = [];
  for (const c of COMBOS) {
    const { ctx, page } = await newPage(browser, c);
    problems.push(
      ...(await checkPage(
        page,
        { env, app: 'web', role: 'visitor', page: 'W00 landing', action: 'hero visible', ...c },
        async () => {
          await page.goto(`${T.web}/${c.lang}`);
          await expect(page.locator('h1').first()).toBeVisible();
        },
      )),
      ...(await checkPage(
        page,
        {
          env,
          app: 'web',
          role: 'visitor',
          page: 'role chooser',
          action: 'three roles offered',
          ...c,
        },
        async () => {
          await page.goto(`${T.web}/${c.lang}/try`);
          for (const r of ['parent', 'owner', 'teacher'])
            await expect(page.getByTestId(`role-${r}`)).toBeVisible();
        },
      )),
    );
    await ctx.close();
  }
  expect(problems).toEqual([]);
});

test('public trial: parent — search, map and a centre page', async ({ browser }) => {
  const problems: string[] = [];
  for (const c of COMBOS) {
    const { ctx, page } = await newPage(browser, c);
    problems.push(
      ...(await checkPage(
        page,
        {
          env,
          app: 'web',
          role: 'parent',
          page: 'P02 search (via Try)',
          action: 'Try → parent lands on search',
          ...c,
        },
        async () => {
          await page.goto(`${T.web}/${c.lang}/try`);
          await page.getByTestId('role-parent').click();
          await page.waitForURL(/\/search$/, { timeout: 60_000 });
        },
      )),
      ...(await checkPage(
        page,
        {
          env,
          app: 'web',
          role: 'parent',
          page: 'P03 map & results',
          action: 'results listed, map drawn',
          ...c,
        },
        async () => {
          await page.goto(`${T.web}/${c.lang}/search/results?radiusKm=50`);
          await expect(page.locator('a[href*="/centres/"]').first()).toBeVisible();
          return { map: 'main' };
        },
      )),
      ...(await checkPage(
        page,
        {
          env,
          app: 'web',
          role: 'parent',
          page: 'P04 centre',
          action: 'centre map + Google Maps link',
          ...c,
        },
        async () => {
          await page.goto(`${T.web}/${c.lang}/centres/al-nour-maadi`);
          await expect(page.getByTestId('open-in-maps')).toBeVisible();
          return { map: '[data-testid=centre-map]' };
        },
      )),
    );
    await ctx.close();
  }
  expect(problems).toEqual([]);
});

test('public trial: owner — schedule and the location picker', async ({ browser }) => {
  const problems: string[] = [];
  for (const c of COMBOS) {
    const { ctx, page } = await newPage(browser, c);
    let base = '';
    problems.push(
      ...(await checkPage(
        page,
        {
          env,
          app: 'web',
          role: 'owner',
          page: 'C03 schedule (via Try)',
          action: 'Try → owner lands on the schedule',
          ...c,
        },
        async () => {
          await page.goto(`${T.web}/${c.lang}/try`);
          await page.getByTestId('role-owner').click();
          await page.waitForURL(/\/schedule$/, { timeout: 60_000 });
          base = page.url().replace(/\/schedule$/, '');
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
          await page.goto(`${base || `${T.web}/${c.lang}/centre/cen-nour`}/profile`);
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

test('public trial: teacher — role entry, tabs and J01 map', async ({ browser }) => {
  const problems: string[] = [];
  for (const c of COMBOS) {
    const { ctx, page } = await newPage(browser, c);
    problems.push(
      ...(await checkPage(
        page,
        {
          env,
          app: 'teacher',
          role: 'teacher',
          page: 'T09 groups (via Try)',
          action: 'Try → teacher lands on My groups',
          ...c,
        },
        async () => {
          await page.goto(`${T.web}/${c.lang}/try`);
          await page.getByTestId('role-teacher').click();
          await expect(page.getByTestId('screen-t09')).toBeVisible({ timeout: 90_000 });
        },
      )),
    );
    for (const [path, id, name] of [
      ['/rooms', 'screen-j01', 'J01 rooms'],
      ['/earnings', 'screen-j07', 'J07 earnings'],
      ['/today', 'screen-today', 'T01 follow-up'],
    ] as const)
      problems.push(
        ...(await checkPage(
          page,
          { env, app: 'teacher', role: 'teacher', page: name, action: `${path} tab loads`, ...c },
          async () => {
            await page.goto(`${T.teacher}${path}`);
            await expect(page.getByTestId(id)).toBeVisible({ timeout: 60_000 });
            if (path === '/rooms') return { map: '[data-testid=j01-map]' };
          },
        )),
      );
    await ctx.close();
  }
  expect(problems).toEqual([]);
});
