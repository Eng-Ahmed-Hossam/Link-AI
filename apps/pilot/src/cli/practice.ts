/**
 * The practice centre for day-one training (4.3; docs/pilot/day-one-training.md).
 *
 *   pnpm pilot:practice          create it the first time (synthetic sample roster), then start the
 *                                 server on it — same addresses and certificate, voice always off
 *   pnpm pilot:practice-wipe     delete it after the training (only a folder marked as practice)
 *
 * The real pilot server must be stopped first (they share the ports). The real data is never read
 * or written; the practice folder is never measured.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { addDays, cairoToday } from '@link/mocks/time';
import { REPO_ROOT } from '../config';
import { assertSeparate, markPractice, practiceDirFor, wipePractice } from '../practice';
import { PilotStore, runningServer } from '../store';
import { args, config, fail } from './common';

const { opts } = args();
const cfg = config(); // the REAL pilot settings (apps/pilot/.env.pilot)
const dir = practiceDirFor(cfg.dataDir, process.env.PILOT_PRACTICE_DIR);
try {
  assertSeparate(cfg.dataDir, dir);
} catch (e) {
  fail((e as Error).message);
}
if (runningServer(cfg.dataDir) || runningServer(dir))
  fail('A pilot server is running. Stop it first (Ctrl+C in its window), then run this again.');

if (opts.wipe) {
  try {
    const gone = wipePractice(dir);
    console.log(gone ? `✔ Practice centre deleted: ${dir}` : `Nothing to delete: ${dir}`);
    process.exit(0);
  } catch (e) {
    fail((e as Error).message);
  }
}

const env = { ...process.env, PILOT_DATA_DIR: dir, PILOT_VOICE: '0', PILOT_PRACTICE: '1' };
const tsx = join(REPO_ROOT, 'apps', 'pilot', 'node_modules', 'tsx', 'dist', 'cli.mjs');
const cli = (script: string, argv: string[]) => {
  const r = spawnSync(
    process.execPath,
    [tsx, join(REPO_ROOT, 'apps', 'pilot', 'src', 'cli', script), ...argv],
    {
      env,
      stdio: 'inherit',
    },
  );
  if (r.status !== 0) fail(`${script} failed.`);
};

if (!new PilotStore(dir).exists) {
  markPractice(dir);
  const today = cairoToday();
  console.log(`\nCreating the practice centre in ${dir} (synthetic sample roster)…\n`);
  cli('init.ts', [
    '--centre',
    'مركز تدريب',
    '--start',
    addDays(today, -7),
    '--end',
    addDays(today, 7),
    '--owner',
    'المالك',
  ]);
  const sample = join(REPO_ROOT, 'docs', 'pilot', 'sample');
  cli('import.ts', [
    join(sample, 'roster.sample.csv'),
    '--schedule',
    join(sample, 'schedule.sample.csv'),
    '--apply',
  ]);
  console.log(
    '\n↑ Write down the owner PIN above for the training. Teachers get theirs in Staff & access.\n',
  );
}

// Same addresses and HTTPS certificate as the real pilot (so the phones work), different data.
const start = spawnSync(
  process.execPath,
  [join(REPO_ROOT, 'apps', 'pilot', 'scripts', 'start.mjs')],
  {
    env: {
      ...env,
      PILOT_TLS_CERT: existsSync(cfg.tlsCert) ? cfg.tlsCert : (process.env.PILOT_TLS_CERT ?? ''),
      PILOT_TLS_KEY: existsSync(cfg.tlsKey) ? cfg.tlsKey : (process.env.PILOT_TLS_KEY ?? ''),
    },
    stdio: 'inherit',
  },
);
process.exit(start.status ?? 0);
