// Part B, end to end on the real stack (opt-in: PILOT_E2E_VOICE=1, needs `pnpm ai:models` and Ollama
// with qwen3:8b): the owner records the teacher's voice consent; the teacher records a note (Chromium's
// fake microphone plays a SYNTHETIC note: "مريم غابت النهارده، ويوسف اتأخر عشر دقايق…"); local Whisper
// + the extraction run on this laptop; the proposal is reviewed and the record confirmed.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const WEB = 'http://127.0.0.1:9443';
const TEACHER = 'http://127.0.0.1:9444';
const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '..', '..', '..', 'docs', 'pilot', 'screenshots');
const ownerPin = () =>
  readFileSync(join(HERE, '..', '.e2e-data', 'owner-pin.e2e.txt'), 'utf8').trim();

test.skip(
  process.env.PILOT_E2E_VOICE !== '1',
  'opt-in: PILOT_E2E_VOICE=1 (models + Ollama needed)',
);
test.setTimeout(300_000);

async function holdToRecord(page: Page, ms: number) {
  const box = (await page.getByTestId('record-button').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test('a voice note on the real local pipeline becomes a confirmed record', async ({ browser }) => {
  // Owner: set the teacher's PIN and record the signed voice consent.
  const ownerCtx = await browser.newContext({ baseURL: WEB });
  const owner = await ownerCtx.newPage();
  await owner.goto('/ar/centre');
  await owner.getByText('هالة', { exact: true }).click();
  await owner.getByTestId('pilot-pin').fill(ownerPin());
  await owner.getByTestId('pilot-sign-in').click();
  await owner.goto('/ar/centre/cen-pilot/staff');
  const salwa = owner.locator('tr', { hasText: 'سلوى' });
  await salwa.getByRole('button', { name: 'حدّد الرمز' }).click();
  await expect(owner.getByText('رمز سلوى')).toBeVisible();
  const pin = (await owner.getByTestId('shown-pin').textContent())!.trim();
  await salwa.getByRole('button', { name: 'الموافقة موقّعة' }).click();
  await expect(salwa).toContainText('موقّعة');
  await ownerCtx.close();

  // Teacher: record by voice.
  const ctx = await browser.newContext({ baseURL: TEACHER, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('/');
  const people = await (await page.request.get('/v1/pilot/people')).json();
  const id = people.find((p: { displayName: string }) => p.displayName === 'سلوى').id;
  await page.getByTestId(`pilot-person-${id}`).click();
  await page.getByTestId('pilot-pin').fill(pin);
  await page.getByTestId('pilot-sign-in').click();
  await page.getByTestId('complete-record').click();
  await page.getByTestId('to-scores').click();
  await page.getByTestId('no-assessment').click();
  await page.getByTestId('record-voice').click();
  await expect(page.getByTestId('screen-v01')).toBeVisible();
  const t0 = Date.now();
  await holdToRecord(page, 9000);
  await expect(page.getByTestId('screen-v02')).toBeVisible({ timeout: 180_000 });
  const seconds = Math.round((Date.now() - t0) / 1000) - 9;
  await expect(page.getByTestId('transcript')).toContainText('مريم');
  await page.screenshot({ path: join(SHOTS, 'V02-real-stt.ar.png'), fullPage: true });
  // The proposal: مريم absent (matched, from the roster), يوسف late.
  const items = page.locator('[data-testid^="item-vi-"]');
  await expect(items.filter({ hasText: 'مريم' }).first()).toBeVisible();
  // Accept each proposal in turn (the list re-renders after every click).
  const accept = page.getByRole('button', { name: 'قبول' });
  for (let i = 0; i < 20 && (await accept.count()) > 0; i++) await accept.first().click();
  await page.getByTestId('unmentioned-present').click();
  await page.getByTestId('apply-voice').click();
  await expect(page.getByTestId('screen-t05')).toBeVisible();
  await page.getByTestId('confirm-record').click();
  await expect(page.getByTestId('screen-t06')).toBeVisible();
  const rec = (await (await page.request.get('/v1/groups/grp-p-M3/session-records')).json())[0];
  expect(rec.status).toBe('confirmed');
  expect(rec.source === 'voice' || rec.source === 'mixed').toBe(true);
  const mariam = rec.entries.find((e: { student: { id: string } }) => e.student.id === 'stu-p-S01');
  expect(mariam.attendance).toBe('absent');
  console.log(`voice note processed in about ${seconds} s (CPU Whisper + LLM, upload included)`);
  await ctx.close();
});
