#!/usr/bin/env node
// Landing page vs Figma, section by section (Step 1 of the product-brief reset).
//
//   node scripts/landing-compare.mjs [figma-frame.png]
//
// Needs the web app running (pnpm demo, http://localhost:3000). Captures /en and /ar at 1440
// (reduced motion: the hero cards at rest), crops the 12 sections, and writes one image per
// section to docs/frontend/compare/landing/: Figma | build EN | build AR. The Figma side comes
// from docs/frontend/compare/landing/figma/NN.png; pass the full 1440 × 10747 render of frame
// 68:616 once to (re)cut those crops.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'apps/web/package.json'));
const { chromium } = require('@playwright/test');
const OUT = join(ROOT, 'docs/frontend/compare/landing');
const FIG = join(OUT, 'figma');
const BASE = process.env.LANDING_URL ?? 'http://localhost:3000';

/** The 12 sections of the brief and their y-range in Figma 68:616 (from the frame's layers). */
const SECTIONS = [
  ['01-nav-hero', 0, 884],
  ['02-proof-row', 884, 1044],
  ['03-problem', 1044, 1838],
  ['04-how-it-works', 1838, 2826],
  ['05-product', 2826, 4205],
  ['06-features', 4205, 5629],
  ['07-marketplace', 5629, 6707],
  ['08-trust', 6707, 7551],
  ['09-pricing', 7551, 8794],
  ['10-faq', 8794, 9635],
  ['11-join', 9635, 10353],
  ['12-footer', 10353, 10747],
];

mkdirSync(FIG, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
});

const toDataUrl = (buf) => `data:image/png;base64,${buf.toString('base64')}`;

// Cut the Figma crops from the full frame render (once).
const frame = process.argv[2];
if (frame) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const src = toDataUrl(readFileSync(frame));
  for (const [name, y0, y1] of SECTIONS) {
    await page.setContent(
      `<body style="margin:0"><div style="width:1440px;height:${y1 - y0}px;overflow:hidden">` +
        `<img src="${src}" style="display:block;margin-top:-${y0}px"></div></body>`,
    );
    await page.locator('div').screenshot({ path: join(FIG, `${name}.png`) });
  }
}

/** Section boxes on the built page: header + hero, the 10 sections, the footer. */
async function capture(lang) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/${lang}`, { waitUntil: 'networkidle', timeout: 300_000 });
  await page.addStyleTag({ content: '.site-lazy{content-visibility:visible!important}' });
  // Load every lazy part (the join form) and image, then come back to the top.
  for (let y = 0; y < 12_000; y += 700) await page.mouse.wheel(0, 700);
  await page.waitForSelector('[data-testid="pilot-form"]', { timeout: 60_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForLoadState('networkidle');
  const boxes = await page.evaluate(() => {
    const r = (el) => {
      const b = el.getBoundingClientRect();
      return [b.top + window.scrollY, b.bottom + window.scrollY];
    };
    const sections = [...document.querySelectorAll('.site-root > section')].map(r);
    const header = r(document.querySelector('header'));
    const footer = r(document.querySelector('footer'));
    return [[header[0], sections[0][1]], ...sections.slice(1), footer];
  });
  const shot = await page.screenshot({ fullPage: true });
  return { boxes, shot: toDataUrl(shot) };
}

const en = await capture('en');
const ar = await capture('ar');
if (en.boxes.length !== SECTIONS.length)
  throw new Error(`expected 12 sections, got ${en.boxes.length}`);

const W = 720; // each column, half of 1440
for (const [i, [name]] of SECTIONS.entries()) {
  const fig = join(FIG, `${name}.png`);
  if (!existsSync(fig)) throw new Error(`missing ${fig}: pass the Figma frame render once`);
  const col = (src, y0, y1, label) =>
    `<figure style="margin:0;width:${W}px"><figcaption style="font:600 14px system-ui;padding:6px 0">${label}</figcaption>` +
    `<div style="width:${W}px;height:${(y1 - y0) / 2}px;overflow:hidden;border:1px solid #ccd">` +
    `<img src="${src}" style="display:block;width:${W}px;margin-top:-${y0 / 2}px"></div></figure>`;
  const f = toDataUrl(readFileSync(fig));
  const figH = SECTIONS[i][2] - SECTIONS[i][1];
  const html =
    `<body style="margin:0;background:#fff"><div id="c" style="display:flex;gap:16px;padding:12px;align-items:flex-start">` +
    col(f, 0, figH, `Figma 68:616 · ${name}`) +
    col(en.shot, ...en.boxes[i], 'Build · English') +
    col(ar.shot, ...ar.boxes[i], 'Build · Arabic') +
    `</div></body>`;
  await page.setViewportSize({ width: W * 3 + 60, height: 900 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.locator('#c').screenshot({ path: join(OUT, `${name}.png`) });
  console.log(
    name,
    'figma',
    figH,
    'en',
    Math.round(en.boxes[i][1] - en.boxes[i][0]),
    'ar',
    Math.round(ar.boxes[i][1] - ar.boxes[i][0]),
  );
}
writeFileSync(
  join(OUT, 'README.md'),
  `# Landing page vs Figma\n\nOne image per section: Figma 68:616 | build English | build Arabic, at 1440 (shown at half size). Made by \`node scripts/landing-compare.mjs\` with the demo running.\n\n${SECTIONS.map(([n]) => `- [${n}](${n}.png)`).join('\n')}\n`,
);
await browser.close();
