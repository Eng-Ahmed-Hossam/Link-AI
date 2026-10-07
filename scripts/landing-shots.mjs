// pnpm landing:shots — the real app screens for the landing page's "How it works" (Arabic, sample
// data), captured from the running `pnpm demo`: the teacher app at phone size and the owner web at
// laptop size, with dev-only buttons hidden. Output: apps/web/public/landing/*.png (next/image
// serves them as WebP/AVIF). Re-run after a visible change to these screens.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT } from './lib/env.mjs';

const WEB = process.env.DEMO_WEB_URL ?? 'http://localhost:3000';
const TEACHER = process.env.DEMO_TEACHER_URL ?? 'http://localhost:8081';
const MOCK = process.env.MOCK_SERVER_URL ?? 'http://localhost:4010';
const OUT = join(ROOT, 'apps', 'web', 'public', 'landing');
mkdirSync(OUT, { recursive: true });

const require = createRequire(join(ROOT, 'apps', 'web', 'package.json'));
const { chromium } = require('@playwright/test');

const post = (path, body = {}) =>
  fetch(`${MOCK}${path}`, { method: 'POST', body: JSON.stringify(body) });
const HIDE = `[data-testid="demo-controls"], [role="note"].fixed, button.fixed { visibility: hidden !important; }`;

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: HIDE });
  await page.waitForTimeout(600);
}
const save = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) });

await post('/__demo/reset');
await post('/__demo/settings', {
  phase2: true,
  marketplace: false,
  realStt: false,
  offline: false,
  sttDown: false,
  confirmFault: null,
});

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

// 1–2. Teacher (phone): recording, then what Link understood; confirm so the flag is raised.
const tctx = await browser.newContext({
  baseURL: TEACHER,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  permissions: ['microphone'],
});
const t = await tctx.newPage();
await t.addInitScript(() => {
  localStorage.setItem(
    'link.teacher.session',
    JSON.stringify({ accessToken: 'mock.usr-salma', userId: 'usr-salma' }),
  );
  localStorage.setItem('link.locale', 'ar');
});
await t.goto('/today');
await t.getByTestId('complete-record').click();
await t.getByTestId('to-scores').click();
await t.getByTestId('to-observation').click();
await t.getByTestId('record-voice').click();
await t.getByTestId('screen-v01').waitFor();
await settle(t);
const box = await t.getByTestId('record-button').boundingBox();
await t.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await t.mouse.down();
await t.waitForTimeout(3200);
await save(t, 'step1-voice');
await t.mouse.up();
await t.getByTestId('screen-v02').waitFor({ timeout: 30_000 });
await settle(t);
await save(t, 'step2-understood');
await t.getByTestId('item-vi-1').getByRole('button', { name: 'قبول' }).click();
await t.getByTestId('identity-vi-2').click();
await t.getByTestId('candidate-stu-ahmed-samir').click();
await t.getByTestId('use-candidate').click();
await t.getByTestId('item-vi-2').getByRole('button', { name: 'قبول' }).click();
await t.getByTestId('edit-vi-3').fill('نراجع قواعد الإشارات الحصة الجاية');
await t.getByTestId('use-vi-3').click();
await t.getByTestId('unmentioned-present').click();
await t.getByTestId('apply-voice').click();
await t.getByTestId('confirm-record').click();
await t.getByTestId('screen-t06').waitFor();
await tctx.close();

// 3–6. Reception (laptop): why the flag appeared, the follow-ups, the message, the outcome.
const octx = await browser.newContext({
  baseURL: WEB,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});
const o = await octx.newPage();
await o.addInitScript(() =>
  localStorage.setItem(
    'link.session',
    JSON.stringify({
      accessToken: 'mock.usr-reception',
      userId: 'usr-reception',
      roles: ['centre_staff'],
    }),
  ),
);
const state = await (await fetch(`${MOCK}/__demo/state/en`)).json();
const caseId = state.cases.find((c) => c.student === 'Mariam Hassan').id;
const C = '/ar/centre/cen-nour';
await o.goto(`${C}/follow-ups/${caseId}`);
await o.getByTestId('case-assignee').waitFor();
await settle(o);
await save(o, 'step3-why');
await o.goto(`${C}/follow-ups`);
await o.getByTestId(`case-row-${caseId}`).waitFor();
await settle(o);
await save(o, 'step4-follow-ups');
await o.goto(`${C}/follow-ups/${caseId}`);
await o.getByTestId('draft-message').click();
await o.getByTestId('grounded').waitFor();
await o.locator('#checked-facts').click();
await settle(o);
await save(o, 'step5-message');
await o.getByTestId('approve').click();
await o.getByTestId('final-text').waitFor();
await post('/__demo/provider', { outcome: 'advance' });
await post('/__demo/provider', { outcome: 'advance' });
await o.goto(`${C}/follow-ups/${caseId}/outcome`);
await o.getByTestId('outcome-method').selectOption('phone');
await o.getByTestId('outcome-result').selectOption('reached');
await o.getByTestId('outcome-learned').fill('سترجع الحصة القادمة');
await o.getByTestId('save-outcome').click();
await o.getByTestId('outcome-history').waitFor();
await settle(o);
await save(o, 'step6-outcome');
await octx.close();
await browser.close();
await post('/__demo/reset');
console.log(`✔ 6 screens in ${OUT}`);
