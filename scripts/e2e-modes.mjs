// pnpm test:e2e:mock | test:e2e:live — the same specs (apps/web/e2e-modes) on either stack.
// Extra arguments go to Playwright, e.g. `pnpm test:e2e:live -g "A18"`.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './lib/env.mjs';

const [mode = 'mock', ...rest] = process.argv.slice(2);
if (!['mock', 'live'].includes(mode)) {
  console.error('Usage: node scripts/e2e-modes.mjs mock|live [playwright args]');
  process.exit(1);
}
const r = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', '-c', 'playwright.modes.config.ts', ...rest],
  {
    cwd: join(ROOT, 'apps', 'web'),
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, E2E_MODE: mode },
  },
);
process.exit(r.status ?? 1);
