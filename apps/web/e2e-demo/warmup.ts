import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Before the demo suites: wait until the mock server, the web app and the teacher app all answer
 * (Playwright's webServer only waits for the mock server), then compile every demo page once
 * (`pnpm demo:warm`), so no test spends its time on a cold Turbopack or Metro build.
 */
export default function warmup() {
  execFileSync(process.execPath, [join(__dirname, '..', '..', '..', 'scripts', 'demo-warm.mjs')], {
    env: { ...process.env, DEMO_WARM_WAIT_S: '300' },
    stdio: 'inherit',
    timeout: 900_000,
  });
}
