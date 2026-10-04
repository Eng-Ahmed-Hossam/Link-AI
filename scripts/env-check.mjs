// pnpm env:check — fail if code reads an environment variable that `.env.example` does not list.
// Scans TS/JS (`process.env.X`, `process.env['X']`, `requireEnv('X', …)`), Python
// (`os.environ['X']`, `os.getenv('X')`, pydantic settings fields marked `# env`), and the
// `${X}` references in the local compose file. Container-internal variables that compose sets
// itself (e.g. PORT inside a fake) are not app configuration and are not scanned.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, COMPOSE_FILE } from './lib/env.mjs';

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.next-pilot',
  '.turbo',
  'dist',
  'dist-pilot',
  '.e2e-data',
  'test-results',
  '.expo',
  'storybook-static',
  '.venv',
  '__pycache__',
  'fakes',
  'aws',
]);
const EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.py']);
const SELF = fileURLToPath(import.meta.url);
const BUILTIN = new Set(['NODE_ENV', 'CI', 'TURBO_HASH']);

const listed = new Set(
  readFileSync(join(ROOT, '.env.example'), 'utf8')
    .split('\n')
    .map((l) => l.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
    .filter(Boolean),
);

const PATTERNS = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,
  /os\.environ(?:\.get)?[[(]\s*['"]([A-Z][A-Z0-9_]*)['"]/g,
  /os\.getenv\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g,
  /alias\s*=\s*['"]([A-Z][A-Z0-9_]*)['"]/g, // pydantic Field(alias="X")
];
const REQUIRE_ENV = /requireEnv\(([^)]*)\)/g;

const used = new Map(); // name -> first location
const note = (name, file, line) => {
  if (!used.has(name)) used.set(name, `${relative(ROOT, file)}:${line}`);
};

function scanFile(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((text, i) => {
    for (const re of PATTERNS) for (const m of text.matchAll(re)) note(m[1], file, i + 1);
    for (const m of text.matchAll(REQUIRE_ENV))
      for (const n of m[1].matchAll(/['"]([A-Z][A-Z0-9_]*)['"]/g)) note(n[1], file, i + 1);
  });
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (EXT.has(extname(p)) && p !== SELF) scanFile(p);
  }
}

for (const d of ['apps', 'packages', 'scripts']) walk(join(ROOT, d));
readFileSync(COMPOSE_FILE, 'utf8')
  .split('\n')
  .forEach((text, i) => {
    for (const m of text.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)) note(m[1], COMPOSE_FILE, i + 1);
  });

const missing = [...used].filter(([n]) => !listed.has(n) && !BUILTIN.has(n));
if (missing.length) {
  console.error(
    `env:check failed — ${missing.length} name(s) used in code but missing from .env.example:`,
  );
  for (const [n, at] of missing) console.error(`  ${n.padEnd(32)} ${at}`);
  process.exit(1);
}
console.log(
  `env:check: ${used.size} names used in code, all listed in .env.example (${listed.size} listed).`,
);
