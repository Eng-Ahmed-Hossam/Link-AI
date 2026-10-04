// Playwright webServer for the pilot e2e: a fresh pilot (init + synthetic sample roster) in
// apps/pilot/.e2e-data, then `pnpm pilot:start` on test ports (owner web 9443, teacher app 9444,
// Next.js 3101), plain HTTP on 127.0.0.1. Needs `pnpm pilot:build` first.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PILOT = resolve(HERE, '..');
const ROOT = resolve(PILOT, '..', '..');
const DATA = join(PILOT, '.e2e-data');
for (const p of [
  join(ROOT, 'apps', 'web', '.next-pilot'),
  join(ROOT, 'apps', 'teacher-app', 'dist-pilot'),
])
  if (!existsSync(p)) {
    console.error(`pilot e2e: ${p} is missing — run pnpm pilot:build first.`);
    process.exit(1);
  }

rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });
const env = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !/DEMO|^NEXT_PUBLIC_|^EXPO_PUBLIC_/.test(k)),
  ),
  PILOT_DATA_DIR: DATA,
  PILOT_BIND: '127.0.0.1',
  PILOT_WEB_PORT: '9443',
  PILOT_TEACHER_PORT: '9444',
  PILOT_WEB_UPSTREAM: 'http://127.0.0.1:3101',
};
const tsx = join(PILOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const cli = (script, args) =>
  execFileSync(process.execPath, [tsx, join(PILOT, 'src', 'cli', script), ...args], {
    env,
    encoding: 'utf8',
  });

const start = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
const out = cli('init.ts', ['--centre', 'مركز تجريبي', '--start', start, '--owner', 'هالة']);
const pin = /PIN:\s+(\d{6})/.exec(out)?.[1];
if (!pin) throw new Error(`no owner PIN in:\n${out}`);
writeFileSync(join(DATA, 'owner-pin.e2e.txt'), pin); // test only: the real init shows it once
const sample = join(ROOT, 'docs', 'pilot', 'sample');
cli('import.ts', [
  join(sample, 'roster.sample.csv'),
  '--schedule',
  join(sample, 'schedule.sample.csv'),
  '--apply',
]);

const p = spawn(process.execPath, [join(PILOT, 'scripts', 'start.mjs')], { env, stdio: 'inherit' });
const stop = () => p.kill('SIGINT');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
p.on('exit', (code) => process.exit(code ?? 0));
