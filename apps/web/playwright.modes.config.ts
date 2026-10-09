import { defineConfig } from '@playwright/test';

/**
 * Specs that must pass in BOTH API modes (docs/plan/real-backend.md): the same files, two stacks.
 *   E2E_MODE=mock (default) → `pnpm demo`  (mock server :4010)
 *   E2E_MODE=live           → `pnpm dev`   (core-api :4000, Postgres, sms-sink)
 * Both stacks use the web on 3000 and the teacher app on 8081, so only one runs at a time.
 */
const LIVE = process.env.E2E_MODE === 'live';

export default defineConfig({
  testDir: './e2e-modes',
  globalSetup: './e2e-modes/warmup.ts',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1440, height: 1060 },
    trace: 'retain-on-failure',
  },
  webServer: LIVE
    ? {
        command: 'node ../../scripts/dev.mjs',
        url: 'http://localhost:4000/ready',
        reuseExistingServer: true,
        timeout: 300_000,
      }
    : {
        command: 'node ../../scripts/demo.mjs',
        env: { DEMO_AI: '0' },
        url: 'http://localhost:4010/__demo/state',
        reuseExistingServer: true,
        timeout: 300_000,
      },
});
