// RTL-02: fail on physical left/right in Tailwind classes, CSS and React Native styles.
// Escape hatch for a deliberate exception: add `rtl-ignore` in a comment on the same line.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const ROOTS = ['apps', 'packages'];
const SKIP = new Set([
  'node_modules',
  '.next',
  '.next-pilot',
  '.next-lh',
  '.venv',
  '.models',
  'evals-runs',
  'dist-pilot',
  '.e2e-data',
  'test-results',
  '.turbo',
  'dist',
  'storybook-static',
  '.expo',
  'public',
]);
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.mdx']);

const RULES = [
  [
    // `(?!to-)` skips prose such as "right-to-left".
    /(?<![\w-])-?(?:ml|mr|pl|pr|left|right|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-(?!to-)[\w[\]./%-]+/,
    'Tailwind physical utility (use ms/me/ps/pe/start/end)',
  ],
  [
    /(?<![\w-])(?:text-left|text-right|float-left|float-right|clear-left|clear-right)(?![\w-])/,
    'Tailwind physical utility (use text-start/text-end)',
  ],
  [
    /(?<![\w-])rounded-(?:l|r|tl|tr|bl|br)(?:-[\w[\]./]+)?(?![\w-])/,
    'Tailwind physical radius (use rounded-s/e/ss/se/es/ee)',
  ],
  [
    /(?<![\w-])border-(?:l|r)(?:-[\w[\]./#]+)?(?![\w-])/,
    'Tailwind physical border (use border-s/e)',
  ],
  [
    /(?<![\w-])(?:margin|padding)-(?:left|right)\b|\bborder-(?:left|right)(?:-\w+)?\s*:|\b(?:left|right)\s*:\s*[-\w.]/,
    'physical CSS property (use logical property)',
  ],
  [
    /\b(?:margin|padding)(?:Left|Right)\b|\bborder(?:Left|Right)\w*\b|\b(?:left|right)\s*:\s*[-\d]/,
    'physical React Native style key (use start/end)',
  ],
  [/\btext-?[Aa]lign\s*:\s*['"]?(?:left|right)/, 'text-align left/right (use start/end)'],
];

const bad = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (EXT.has(extname(p))) scan(p);
  }
};
const scan = (file) => {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (line.includes('rtl-ignore')) return;
      for (const [re, msg] of RULES) {
        if (re.test(line)) bad.push(`${relative('.', file)}:${i + 1}  ${msg}\n    ${line.trim()}`);
      }
    });
};
ROOTS.forEach((r) => walk(r));
if (bad.length) {
  console.error(`RTL-02 violations (${bad.length}):\n` + bad.join('\n'));
  process.exit(1);
}
console.log('RTL-02: no physical left/right found.');
