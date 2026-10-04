import { defineConfig } from '@playwright/test';

/**
 * Owner web (Batch 6) and cross-app tests on the shared mock server — the `pnpm demo` stack
 * (web on 3000 in `mock-server` mode, teacher app on 8081, mock server on 4010). The parent PWA
 * suite (playwright.config.ts) needs the in-browser mock instead, so the two never share a run.
 */
export default defineConfig({
  testDir: './e2e-demo',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    // Figma owner frames are 1440 × 1060.
    viewport: { width: 1440, height: 1060 },
    permissions: ['microphone'],
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node ../../scripts/demo.mjs',
    env: { DEMO_AI: '0' }, // the suites use the fixtures: no speech-to-text service needed
    url: 'http://localhost:4010/__demo/state',
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
