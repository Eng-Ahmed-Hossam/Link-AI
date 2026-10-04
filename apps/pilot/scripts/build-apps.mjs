// pnpm pilot:build — the owner web and the teacher app, built for the concierge pilot:
//   apps/web/.next-pilot            (Next.js production build, NEXT_PUBLIC_LINK_MODE=pilot)
//   apps/teacher-app/dist-pilot     (Expo web export, EXPO_PUBLIC_LINK_MODE=pilot)
// Both talk to the pilot server on their own origin (API base ''), with no Demo controls, no mock
// handlers and no sample sign-in. The start-up check then scans both bundles for demo code.
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const clean = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k]) => !/DEMO|^NEXT_PUBLIC_|^EXPO_PUBLIC_|^APP_ENV$|^LINK_MODE$/.test(k),
  ),
);

function run(label, args, cwd, env) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync('pnpm', args, {
    cwd,
    env: { ...clean, ...env },
    stdio: 'inherit',
    shell: true,
  });
  if (r.status !== 0) {
    console.error(`\n✖ ${label} failed (exit ${r.status}).`);
    process.exit(r.status ?? 1);
  }
}

const web = join(ROOT, 'apps', 'web');
const teacher = join(ROOT, 'apps', 'teacher-app');
rmSync(join(web, '.next-pilot'), { recursive: true, force: true });
rmSync(join(teacher, 'dist-pilot'), { recursive: true, force: true });

run('Owner web (pilot build)', ['exec', 'next', 'build'], web, {
  NEXT_DIST_DIR: '.next-pilot',
  NEXT_PUBLIC_LINK_MODE: 'pilot',
  NEXT_PUBLIC_API_MODE: 'live',
  NEXT_PUBLIC_API_BASE_URL: '',
  NEXT_PUBLIC_APP_ENV: 'pilot',
  NEXT_TELEMETRY_DISABLED: '1',
});
run(
  'Teacher app (pilot web export)',
  ['exec', 'expo', 'export', '--platform', 'web', '--output-dir', 'dist-pilot', '--clear'],
  teacher,
  {
    EXPO_PUBLIC_LINK_MODE: 'pilot',
    EXPO_PUBLIC_API_MODE: 'live',
    EXPO_PUBLIC_API_BASE_URL: '',
    EXPO_PUBLIC_APP_ENV: 'pilot',
    EXPO_NO_TELEMETRY: '1',
  },
);
run('Start-up check (bundles)', ['--filter', '@link/pilot', 'run', 'check', '--bundles'], ROOT, {
  PILOT_DATA_DIR: process.env.PILOT_DATA_DIR ?? join(ROOT, 'apps', 'pilot', '.build-check'),
});
console.log('\n✔ Pilot builds ready. Start with: pnpm pilot:start\n');
