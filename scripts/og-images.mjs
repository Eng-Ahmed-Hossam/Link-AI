// pnpm og:images — the landing page's social cards (Open Graph / X), 1200×630, Arabic and English,
// rendered offline with Playwright from the i18n strings, the brand fonts and the logo orb.
// Output: apps/web/public/og/landing-{ar,en}.png. Re-run when the hero copy changes.
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT } from './lib/env.mjs';

const OUT = join(ROOT, 'apps', 'web', 'public', 'og');
mkdirSync(OUT, { recursive: true });
const require = createRequire(join(ROOT, 'apps', 'web', 'package.json'));
const { chromium } = require('@playwright/test');

const font = (pkg, file) =>
  readFileSync(
    join(ROOT, 'packages', 'ui', 'node_modules', '@fontsource', pkg, 'files', file),
  ).toString('base64');
const faces = `
  @font-face { font-family: Cairo; font-weight: 800; src: url(data:font/woff2;base64,${font('cairo', 'cairo-arabic-800-normal.woff2')}) format('woff2'); }
  @font-face { font-family: Cairo; font-weight: 600; src: url(data:font/woff2;base64,${font('cairo', 'cairo-arabic-600-normal.woff2')}) format('woff2'); }
  @font-face { font-family: Jakarta; font-weight: 800; src: url(data:font/woff2;base64,${font('plus-jakarta-sans', 'plus-jakarta-sans-latin-800-normal.woff2')}) format('woff2'); }
  @font-face { font-family: Jakarta; font-weight: 500; src: url(data:font/woff2;base64,${font('plus-jakarta-sans', 'plus-jakarta-sans-latin-500-normal.woff2')}) format('woff2'); }`;
const orb = readFileSync(
  join(ROOT, 'packages', 'ui', 'src', 'brand', 'logo-mark-halo@3x.png'),
).toString('base64');
const msgs = (l) =>
  JSON.parse(readFileSync(join(ROOT, 'packages', 'i18n', 'messages', `${l}.json`), 'utf8'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const lang of ['ar', 'en']) {
  const m = msgs(lang);
  const ar = lang === 'ar';
  const family = ar ? 'Cairo, Jakarta' : 'Jakarta, Cairo';
  await page.setContent(`<!doctype html><html lang="${lang}" dir="${ar ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
    ${faces}
    * { margin: 0; box-sizing: border-box; }
    body { width: 1200px; height: 630px; font-family: ${family}; color: #fff; overflow: hidden;
      background: radial-gradient(ellipse at ${ar ? '20%' : '80%'} 30%, #0b4a73 0%, #0a1824 60%); }
    .wrap { position: absolute; inset: 0; padding: 72px 80px; display: flex; flex-direction: column; justify-content: space-between; }
    .eyebrow { font-weight: ${ar ? 600 : 500}; font-size: 26px; color: #7fd8ff; }
    h1 { font-weight: 800; font-size: ${ar ? 74 : 76}px; line-height: ${ar ? 1.3 : 1.04}; letter-spacing: ${ar ? 0 : '-0.03em'}; max-width: 760px; }
    h1 span { color: #00adf7; }
    .brand { display: flex; align-items: center; gap: 16px; font-family: Jakarta; font-weight: 800; font-size: 44px; }
    .orb { position: absolute; ${ar ? 'left' : 'right'}: 70px; top: 50%; transform: translateY(-50%); width: 300px; height: 300px; }
  </style></head><body><img class="orb" src="data:image/png;base64,${orb}" alt="">
    <div class="wrap"><p class="eyebrow">${m['site.hero.eyebrow']}</p>
    <h1>${m['site.hero.title1']}<br>${m['site.hero.title2']} <span>${m['site.hero.titleAccent']}</span>.</h1>
    <p class="brand" dir="ltr">link.</p></div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT, `landing-${lang}.png`) });
  console.log(`✔ og/landing-${lang}.png`);
}
await browser.close();
