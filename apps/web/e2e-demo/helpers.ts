import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MOCK = 'http://localhost:4010';
export const TEACHER_APP = 'http://localhost:8081';
export type Lang = 'ar' | 'en';
const ROOT = join(__dirname, '..', '..', '..');
export const SHOTS = join(ROOT, 'docs', 'frontend', 'screenshots', 'batch-6');
export const WALK = join(ROOT, 'docs', 'frontend', 'walkthroughs', 'batch-6');
mkdirSync(SHOTS, { recursive: true });
mkdirSync(WALK, { recursive: true });

const post = (path: string, body: unknown = {}) =>
  fetch(`${MOCK}${path}`, { method: 'POST', body: JSON.stringify(body) });

/** Fresh demo-followup scenario; the MVP pilot flags (Phase 2 on, marketplace off) unless told otherwise. */
export async function resetScenario(settings: Record<string, unknown> = {}) {
  await post('/__demo/reset');
  await post('/__demo/settings', {
    phase2: true,
    marketplace: false,
    offline: false,
    sttDown: false,
    confirmFault: null,
    ...settings,
  });
}
export const setDemo = (s: Record<string, unknown>) => post('/__demo/settings', s);
export const provider = (outcome: 'advance' | 'fail') => post('/__demo/provider', { outcome });
export const reply = (body?: string) => post('/__demo/reply', body ? { body } : {});
export const demoState = async (lang: Lang = 'en') =>
  (await fetch(`${MOCK}/__demo/state/${lang}`)).json();

const api = async (
  method: string,
  path: string,
  token: string,
  body?: unknown,
  extra: Record<string, string> = {},
) => {
  const res = await fetch(`${MOCK}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'accept-language': 'ar',
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json();
};

/** What the teacher app does in Batch 5, over the API: confirm today's record with Mariam absent. */
export async function teacherConfirmsMariamAbsent() {
  const t = 'mock.usr-salma';
  const today = await api('GET', '/v1/teachers/me/today', t);
  const due = today.recordDue;
  const rec = await api('POST', `/v1/groups/${due.groupId}/session-records`, t, {
    groupSessionId: due.sessionId,
  });
  await api('PATCH', `/v1/session-records/${rec.id}`, t, {
    entries: rec.entries.map((e: { student: { id: string } }) => ({
      studentId: e.student.id,
      attendance: e.student.id === 'chd-mariam' ? 'absent' : 'present',
    })),
  });
  return api('POST', `/v1/session-records/${rec.id}/confirm`, t, undefined, {
    'idempotency-key': `e2e-${Date.now()}`,
  });
}

/** Signed-in owner, Reception or parent on the first load of a test (localStorage session). */
export async function signIn(page: Page, who: 'owner' | 'reception' | 'parent', lang: Lang = 'ar') {
  const s = {
    owner: { accessToken: 'mock.usr-owner', userId: 'usr-owner', roles: ['centre_owner'] },
    reception: {
      accessToken: 'mock.usr-reception',
      userId: 'usr-reception',
      roles: ['centre_staff'],
    },
    parent: { accessToken: 'mock.usr-parent', userId: 'usr-parent', roles: ['parent'] },
  }[who];
  await page.addInitScript(
    ({ s, lang }) => {
      if (sessionStorage.getItem('e2e.prepared')) return;
      sessionStorage.setItem('e2e.prepared', '1');
      localStorage.clear();
      localStorage.setItem('link.session', JSON.stringify(s));
      localStorage.setItem('link.search.childId', 'chd-mariam');
      void lang;
    },
    { s, lang },
  );
}

export const C = (lang: Lang) => `/${lang}/centre/cen-nour`;

export async function ready(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page
    .locator('[aria-busy="true"]')
    .first()
    .waitFor({ state: 'detached', timeout: 15_000 })
    .catch(() => {});
}

/** WCAG 2.1 AA: zero serious or critical violations (NFR-05). Dev-only badges are excluded. */
export async function axe(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('[role="note"].fixed')
    .analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    bad.map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`,
    ),
  ).toEqual([]);
}

export async function shot(page: Page, name: string, dir = SHOTS) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content: '[role="note"].fixed, button.fixed { visibility: hidden !important; }',
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
}

export function writeProof(name: string, data: unknown) {
  writeFileSync(join(WALK, name), JSON.stringify(data, null, 2) + '\n');
}
