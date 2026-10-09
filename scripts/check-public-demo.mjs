// Public demo build check: builds the web app the way the public demo ships (production, API mode
// `mock`, no Demo controls) into its own folder and fails if any presenter tool is in what a
// visitor downloads — the banner's "Demo tools" link or the Demo controls panel (Step 2B).
// The pilot builds have their own check (apps/pilot start-up check, BUNDLE_MARKERS).
// Usage: node scripts/check-public-demo.mjs [--skip-build]
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { ROOT } from './lib/env.mjs';

const WEB = join(ROOT, 'apps', 'web');
const DIST = '.next-public';
/** Strings only the presenter tools contain. */
export const PRESENTER_MARKERS = [
  'data-demo-tools',
  'Demo tools',
  'Reset scenario',
  'Advance: Sent',
  'Jump to step',
  'Verify centre',
];

if (!process.argv.includes('--skip-build')) {
  const env = { ...process.env, NODE_ENV: 'production', NEXT_DIST_DIR: DIST };
  env.NEXT_PUBLIC_API_MODE = 'mock';
  env.NEXT_PUBLIC_APP_ENV = 'demo';
  delete env.NEXT_PUBLIC_DEMO_CONTROLS;
  delete env.NEXT_PUBLIC_LINK_MODE;
  const r = spawnSync('pnpm', ['exec', 'next', 'build'], {
    cwd: WEB,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    console.error('Public demo build failed.');
    process.exit(1);
  }
}

function* walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (['.js', '.html', '.mjs', '.json', '.rsc'].includes(extname(p))) yield p;
  }
}

// What a visitor downloads: the client bundles and the prerendered pages.
const dirs = [join(WEB, DIST, 'static'), join(WEB, DIST, 'server', 'app')];
const problems = [];
let files = 0;
for (const d of dirs) {
  if (!existsSync(d)) {
    problems.push(`Build output missing: ${d}`);
    continue;
  }
  for (const f of walk(d)) {
    files++;
    const text = readFileSync(f, 'utf8');
    for (const m of PRESENTER_MARKERS)
      if (text.includes(m)) problems.push(`"${m}" in ${f.slice(WEB.length + 1)}`);
  }
}
if (problems.length) {
  console.error(`Public demo build carries presenter tools (${problems.length}):`);
  for (const p of problems.slice(0, 30)) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  `check:public-demo: ${files} files, no presenter tools (${PRESENTER_MARKERS.join(', ')}).`,
);
