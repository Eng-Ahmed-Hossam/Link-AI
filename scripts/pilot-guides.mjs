// pnpm pilot:guides — the staff quick guides and the day-one training script as printable A4 PDFs
// (docs/pilot/guides/*.pdf), rendered offline with Playwright's Chromium. The Markdown subset the
// guides use is converted here (headings, paragraphs, bold, lists, tables, code, links, the RTL div).
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT } from './lib/env.mjs';

const GUIDES = [
  'quick-guide-teacher',
  'quick-guide-reception',
  'quick-guide-owner',
  'day-one-training',
];
const SRC = join(ROOT, 'docs', 'pilot');
const OUT = join(SRC, 'guides');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
}

export function markdownToHtml(md) {
  const out = [];
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let list = null;
  let table = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  const closeTable = () => {
    if (!table) return;
    const [head, ...rows] = table.filter((r) => !/^\|\s*-/.test(r));
    const cells = (r) =>
      r
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => inline(c.trim()));
    out.push(
      '<table><thead><tr>' +
        cells(head)
          .map((c) => `<th>${c}</th>`)
          .join('') +
        '</tr></thead><tbody>' +
        rows
          .map(
            (r) =>
              '<tr>' +
              cells(r)
                .map((c) => `<td>${c}</td>`)
                .join('') +
              '</tr>',
          )
          .join('') +
        '</tbody></table>',
    );
    table = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^<\/?div/.test(line)) {
      closeList();
      closeTable();
      out.push(line);
      continue;
    }
    if (line.startsWith('|')) {
      closeList();
      (table ??= []).push(line);
      continue;
    }
    closeTable();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      // Each language prints on its own page: Arabic first, English from a new page.
      const cls = h[2].startsWith('In English') ? ' class="en"' : '';
      out.push(`<h${h[1].length}${cls}>${inline(h[2])}</h${h[1].length}>`);
    } else if (ol || ul) {
      const kind = ol ? 'ol' : 'ul';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((ol ?? ul)[1])}</li>`);
    } else if (!line.trim()) {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  closeTable();
  return out.join('\n');
}

const CSS = `
  @page { size: A4; margin: 14mm 14mm; }
  body { font-family: "Cairo", "Segoe UI", "Tahoma", "Arial", sans-serif; font-size: 10pt;
         line-height: 1.45; color: #12213f; }
  h1 { font-size: 16pt; margin: 0 0 6pt; color: #0b2f6b; }
  h2 { font-size: 12pt; margin: 8pt 0 3pt; color: #0b2f6b; border-bottom: 1px solid #d5dde8; }
  h2.en { break-before: page; }
  p, li { margin: 2pt 0; }
  ol, ul { margin: 2pt 0; padding-inline-start: 18pt; }
  table { border-collapse: collapse; width: 100%; font-size: 9pt; margin: 4pt 0; }
  th, td { border: 1px solid #d5dde8; padding: 3pt 5pt; vertical-align: top; text-align: start; }
  th { background: #eef3fa; }
  code { font-family: Consolas, monospace; font-size: 9pt; background: #f2f4f8; padding: 0 2pt; }
  [dir=rtl] { text-align: right; }
`;

const require = createRequire(join(ROOT, 'apps', 'pilot', 'package.json'));
const { chromium } = require('@playwright/test');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const name of GUIDES) {
  const md = readFileSync(join(SRC, `${name}.md`), 'utf8');
  const html = `<!doctype html><html lang="ar"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${markdownToHtml(md)}</body></html>`;
  await page.setContent(html, { waitUntil: 'load' });
  const pdf = join(OUT, `${name}.pdf`);
  await page.pdf({ path: pdf, format: 'A4', printBackground: true });
  console.log(`✔ ${pdf}`);
}
await browser.close();
