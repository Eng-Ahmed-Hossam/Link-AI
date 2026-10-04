// Side-by-side Figma vs build comparisons: docs/frontend/compare/<ID>.png
// Left: Figma frame (docs/frontend/compare/figma/<ID>.png, fetched with the Figma MCP get_screenshot).
// Middle: our English build. Right: our Arabic build (both from the Playwright screenshots).
// Usage: node scripts/compare-figma.mjs <batch-folder> [--col=<px>] <ID=shot-name> …
//   e.g. node scripts/compare-figma.mjs batch-1 P01=P01-welcome P02=P02-search
//        node scripts/compare-figma.mjs batch-6 --col=600 A01=A01   (desktop owner frames)
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT } from './lib/env.mjs';

const [batch, ...rest] = process.argv.slice(2);
const colArg = rest.find((a) => a.startsWith('--col='));
const COL = colArg ? Number(colArg.slice(6)) : 390;
const pairs = rest.filter((a) => a !== colArg);
if (!batch || !pairs.length) {
  console.error('Usage: node scripts/compare-figma.mjs <batch-folder> <ID=shot-name> …');
  process.exit(1);
}
const COMPARE = join(ROOT, 'docs', 'frontend', 'compare');
const SHOTS = join(ROOT, 'docs', 'frontend', 'screenshots', batch);
const b64 = (p) =>
  existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : '';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 3 * COL + 80, height: 800 } });
for (const pair of pairs) {
  const [id, shot] = pair.split('=');
  const cols = [
    ['Figma', b64(join(COMPARE, 'figma', `${id}.png`))],
    ['Build · EN', b64(join(SHOTS, `${shot}.en.png`))],
    ['Build · AR', b64(join(SHOTS, `${shot}.ar.png`))],
  ];
  await page.setContent(`<!doctype html><html><body style="margin:0;font:600 14px system-ui;background:#F1F6FB">
    <div style="display:flex;gap:20px;padding:20px;align-items:flex-start">
    ${cols
      .map(
        ([label, src]) => `<figure style="margin:0;width:${COL}px">
          <figcaption style="padding:0 0 8px">${id} · ${label}</figcaption>
          ${src ? `<img src="${src}" style="width:${COL}px;display:block;border:1px solid #DCE5EC">` : '<p>(missing)</p>'}
        </figure>`,
      )
      .join('')}
    </div></body></html>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(COMPARE, `${id}.png`), fullPage: true });
  console.log(`compare/${id}.png`);
}
await browser.close();
