// Batch 0 screenshots: every Storybook story and every app shell, in Arabic (RTL) and English (LTR).
// Usage: start the dev servers (web :3000, ops :3001, storybook :6006, expo web :8081), then
//   node scripts/screenshots.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT = 'docs/frontend/screenshots/batch-0';
mkdirSync(OUT, { recursive: true });

const stories = await (await fetch('http://localhost:6006/index.json')).json();
const storyIds = Object.values(stories.entries)
  .filter((e) => e.type === 'story')
  .map((e) => e.id);

const shells = [
  {
    name: 'shell-parent',
    url: (l) => `http://localhost:3000/${l}/search`,
    width: 390,
    height: 844,
  },
  {
    name: 'shell-public',
    url: (l) => `http://localhost:3000/${l}/welcome`,
    width: 390,
    height: 844,
  },
  {
    name: 'shell-centre',
    url: (l) => `http://localhost:3000/${l}/centre/c_1/profile`,
    width: 1280,
    height: 800,
  },
  { name: 'shell-ops', url: (l) => `http://localhost:3001/${l}/centres`, width: 1280, height: 800 },
  {
    name: 'shell-ops-sign-in',
    url: (l) => `http://localhost:3001/${l}/sign-in`,
    width: 1280,
    height: 800,
  },
  {
    name: 'shell-teacher',
    url: () => 'http://localhost:8081/',
    width: 390,
    height: 844,
    teacher: true,
  },
];

const browser = await chromium.launch();

for (const lang of ['ar', 'en']) {
  const ctx = await browser.newContext({
    viewport: { width: 640, height: 360 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  for (const id of storyIds) {
    await page.goto(
      `http://localhost:6006/iframe.html?id=${id}&viewMode=story&globals=locale:${lang}`,
    );
    await page.waitForSelector('#storybook-root *');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${OUT}/story-${id}.${lang}.png`, fullPage: true });
  }
  await ctx.close();

  for (const s of shells) {
    const c = await browser.newContext({ viewport: { width: s.width, height: s.height } });
    const p = await c.newPage();
    if (s.teacher) {
      // Locale is stored on-device; seed it before load.
      await p.addInitScript((l) => localStorage.setItem('link.locale', l), lang);
    }
    await p.goto(s.url(lang), { waitUntil: 'networkidle', timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(s.teacher ? 3000 : 600);
    await p.screenshot({ path: `${OUT}/${s.name}.${lang}.png` });
    await c.close();
  }
}
await browser.close();
console.log(`Saved to ${OUT}`);
