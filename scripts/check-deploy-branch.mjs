// pnpm check:deploy-branch — fails when a Vercel or Railway config in the repo points at a branch
// other than main (CI, job checks). Lists each file and setting; prints no values but branch names.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/env.mjs';
import { DEPLOY_CONFIG, deployBranchProblems } from './lib/deploy-branch.mjs';

const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter((f) => DEPLOY_CONFIG.test(f));
let bad = 0;
for (const f of files) {
  const problems = deployBranchProblems(f, readFileSync(join(ROOT, f), 'utf8'));
  for (const p of problems) console.error(`✗ ${f}: ${p}`);
  bad += problems.length;
}
if (bad) {
  console.error(`check:deploy-branch failed: every deployment builds from main only.`);
  process.exit(1);
}
console.log(`check:deploy-branch: ${files.length} deploy config file(s), all on main.`);
