import { defineConfig, devices } from '@playwright/test';

/**
 * Web e2e: business-rule tests, axe (WCAG 2.1 AA, NFR-05) and screenshots in Arabic and English.
 * Runs the Next dev server on its own port with mocks on (NEXT_PUBLIC_USE_MOCKS default).
 */
// Next 16 allows one dev server per app folder, so tests reuse the normal one on 3000 when it is up.
const PORT = 3000;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Pixel 7'],
    // Figma parent frames are 390 px wide.
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/ar/search`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
