/**
 * `pnpm pilot:import <roster.csv> --schedule <schedule.csv> [--apply]`
 *
 * Prints a dry-run summary first. Only `--apply` changes the data, and only when there are no
 * errors. A backup is taken before applying. The server must be stopped.
 */
import { readFileSync } from 'node:fs';
import { recordSystemEvent } from '@link/mocks/followup';
import { applyPlan, planImport } from '../roster';
import { backup } from '../store';
import { args, config, fail, openStore, requireStopped, userPath } from './common';

const { opts, pos } = args();
if (!pos[0] || typeof opts.schedule !== 'string')
  fail('Usage: pnpm pilot:import <roster.csv> --schedule <schedule.csv> [--apply]');
const cfg = config();
requireStopped(cfg);
const store = openStore(cfg);
const world = store.snap!.fu.world!;

let rosterCsv: string;
let scheduleCsv: string;
try {
  rosterCsv = readFileSync(userPath(pos[0]), 'utf8');
  scheduleCsv = readFileSync(userPath(opts.schedule), 'utf8');
} catch (e) {
  fail(`Cannot read the file: ${(e as Error).message}`);
}
const plan = planImport(rosterCsv, scheduleCsv, world);
const errors = plan.issues.filter((i) => i.level === 'error');
const warnings = plan.issues.filter((i) => i.level === 'warning');

console.log(`\nRoster import — ${opts.apply ? 'APPLY' : 'dry run (nothing is changed)'}\n`);
for (const g of plan.groups)
  console.log(
    `  ${g.code}  ${g.name}  • teacher ${g.teacher} • ${g.students} students • ${g.slots.join(', ') || 'no schedule'}`,
  );
console.log(
  `\n  ${plan.groups.length} groups, ${new Set(plan.roster.map((r) => r.studentCode)).size} students, ${plan.teachers.length} teachers.`,
);
const where = (i: (typeof plan.issues)[number]) => `${i.file}${i.row ? ` row ${i.row}` : ''}`;
if (warnings.length) {
  console.log(`\n  Warnings (${warnings.length}):`);
  for (const w of warnings) console.log(`   ! ${where(w)}: ${w.message}`);
}
if (errors.length) {
  console.log(`\n  Errors (${errors.length}) — fix them in the CSV and run again:`);
  for (const e of errors) console.log(`   ✖ ${where(e)}: ${e.message}`);
  store.close();
  process.exit(1);
}
if (!opts.apply) {
  console.log('\n  No errors. Run again with --apply to import.\n');
  store.close();
  process.exit(0);
}

const before = backup(cfg.dataDir, cfg.backupDir, 'before-import');
let n = world.users.length;
const added = applyPlan(world, plan, () => {
  let id: string;
  do id = `usr-p${String(++n).padStart(3, '0')}`;
  while (world.users.some((u) => u.id === id));
  return id;
});
recordSystemEvent(
  'pilot.roster_imported',
  { en: 'Roster imported', ar: 'تم استيراد قائمة الطلاب' },
  { groups: added.groups, students: added.students, memberships: added.memberships },
);
store.close();
console.log(`
✔ Imported: ${added.groups} new groups, ${added.students} new students, ${added.memberships} group places.
  ${added.teachers.length ? `New teacher accounts (no PIN yet): ${added.teachers.join(', ')}.\n  The owner sets their PINs in Staff & access before they sign in.` : 'No new teachers.'}
  Backup before import: ${before ?? '—'}
`);
