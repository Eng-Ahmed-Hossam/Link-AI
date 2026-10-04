/** `pnpm pilot:check` — run the start-up check without starting the server (runbook step). */
import { join } from 'node:path';
import { bundleProblems, startupProblems } from '../check';
import { REPO_ROOT } from '../config';
import { PilotStore } from '../store';
import { args, config } from './common';

const { opts } = args();
// Run for the pilot, like `pnpm pilot:start` (which sets LINK_MODE=pilot for the server).
process.env.LINK_MODE ||= 'pilot';
const cfg = config();
if (opts.bundles) {
  // `pnpm pilot:build` runs this: only the app bundles, before any pilot data exists.
  const p = bundleProblems([
    join(REPO_ROOT, 'apps', 'web', '.next-pilot', 'static'),
    cfg.teacherDist,
  ]);
  if (p.length) {
    console.error('✖ Demo code in the pilot bundles:');
    for (const x of p) console.error(`  - ${x}`);
    process.exit(1);
  }
  console.log('✔ Pilot bundles: no demo route, demo user or mock code.');
  process.exit(0);
}
const store = new PilotStore(cfg.dataDir);
const world = store.exists ? (store.open().fu.world ?? null) : null;
store.close();
const problems = startupProblems({
  world,
  env: process.env,
  bundleDirs: [join(REPO_ROOT, 'apps', 'web', '.next-pilot', 'static'), cfg.teacherDist],
});
if (!store.exists) problems.unshift(`No pilot data in ${cfg.dataDir} (run pnpm pilot:init).`);
if (problems.length) {
  console.error(`✖ Not ready:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('✔ Pilot check passed: no demo route, demo data, demo setting or demo code.');
