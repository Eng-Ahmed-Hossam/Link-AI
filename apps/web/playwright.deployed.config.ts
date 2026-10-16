import { defineConfig } from '@playwright/test';

/**
 * pnpm smoke:deployed — every deployed app (deploy/deployed-urls.json), read-mostly: no shared
 * data is reset; the public trial runs in its own sandbox. SMOKE_MATRIX=full (Arabic + English,
 * 390 + 1280 px) or quick (Arabic at 390, English at 1280; CI). Staging sign-in reads codes from
 * the private inbox with SMOKE_SMS_TOKEN (GitHub secret STAGING_SMS_SINK_TOKEN).
 */
export default defineConfig({
  testDir: './e2e-deployed',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: [['list']],
  use: { trace: 'off', screenshot: 'off' },
});
