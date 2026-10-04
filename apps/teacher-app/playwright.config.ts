import { defineConfig, devices } from '@playwright/test';

/**
 * Teacher app screen tests on Expo web (react-native-web) against the shared mock server — the
 * same stack as `pnpm demo`. A page reload stands in for an app restart (drafts and the voice
 * queue live in the offline store). Chromium gets a fake microphone so V01 records real audio.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8081',
    ...devices['Pixel 7'],
    // Figma teacher frames are 390 px wide.
    viewport: { width: 390, height: 844 },
    permissions: ['microphone'],
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node ../../scripts/demo.mjs',
    env: { DEMO_AI: '0' }, // the suites use the fixtures: no speech-to-text service needed
    url: 'http://localhost:8081',
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
