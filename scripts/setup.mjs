// pnpm run setup [--dry-run] [--skip-ai] [--reset-data] — everything from a clean clone to a machine
// ready for `pnpm dev`. Safe to run again: each step only does what is missing (install, the
// .env.local names it lacks, services, migrations, sample data only into an empty database).
//   --dry-run     check the machine and print the steps; change nothing
//   --skip-ai     do not install the ai-service Python packages (voice notes stay off)
//   --reset-data  wipe and re-seed the sample data (asks you to type "reset")
// Sample data only. The plan is in scripts/lib/setup-plan.mjs (unit-tested).
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { failed, formatTable, runChecks } from './lib/checks.mjs';
import { ROOT } from './lib/env.mjs';
import { localEnv, realProbe, wantedPnpm } from './lib/probe.mjs';
import { NEXT_STEPS, formatPlan, setupPlan } from './lib/setup-plan.mjs';

const argv = process.argv.slice(2);
const known = ['--dry-run', '--skip-ai', '--reset-data'];
const unknown = argv.filter((a) => !known.includes(a));
if (unknown.length) {
  console.error(`Unknown option(s): ${unknown.join(' ')}. Use ${known.join(', ')}.`);
  process.exit(2);
}
const flags = {
  dryRun: argv.includes('--dry-run'),
  skipAi: argv.includes('--skip-ai'),
  resetData: argv.includes('--reset-data'),
};
const probe = realProbe();
const plan = setupPlan(flags, {
  platform: process.platform,
  node: process.execPath,
  uv: probe.exec('uv', ['--version']).status === 0,
});
const started = Date.now();

console.log('\nLink setup — sample data only\n');
const checks = await runChecks(probe, { wantedPnpm: wantedPnpm(), env: localEnv() });
// Before setup, a missing .env.local or stopped containers are expected: setup creates them.
console.log(formatTable(checks), '\n');

if (flags.dryRun) {
  console.log('Dry run: these steps would run (nothing was changed):\n');
  console.log(formatPlan(plan));
  console.log(failed(checks) ? '\n✗ Fix the ✗ lines above first.\n' : '');
  process.exit(failed(checks) ? 1 : 0);
}
if (failed(checks)) {
  console.error('✗ Fix the ✗ lines above, then run pnpm run setup again (docs/setup-windows.md).');
  process.exit(1);
}

for (const [i, step] of plan.entries()) {
  if (step.id === 'doctor') continue;
  const head = `── ${i + 1}/${plan.length} ${step.title}`;
  console.log(`\n${head}`);
  if (!step.cmd) {
    console.log(`   ${step.note}`);
    continue;
  }
  if (step.confirm) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `   This deletes ALL local sample data and seeds it again. Type "${step.confirm}" to continue: `,
    );
    rl.close();
    if (answer.trim() !== step.confirm) {
      console.error('   Cancelled; nothing was deleted.');
      process.exit(1);
    }
  }
  const t = Date.now();
  const r = spawnSync(step.cmd, step.args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: /\.cmd$/i.test(step.cmd),
  });
  if (r.status !== 0) {
    console.error(`\n✗ Step failed: ${step.title} (exit ${r.status ?? r.error?.message}).`);
    console.error(
      '  Fix it and run pnpm run setup again: finished steps are skipped or repeat safely.',
    );
    process.exit(1);
  }
  console.log(`   ✓ ${((Date.now() - t) / 1000).toFixed(0)} s`);
}

console.log(`\n✓ Setup finished in ${((Date.now() - started) / 1000).toFixed(0)} s.\n`);
console.log(NEXT_STEPS, '\n');
