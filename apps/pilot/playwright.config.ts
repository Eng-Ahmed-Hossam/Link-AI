import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Pilot mode end to end (docs/pilot): the real pilot builds and the pilot server with a fresh,
 * synthetic pilot (e2e/serve.mjs). Owner web on 9443, teacher app on 9444. `pnpm pilot:build` first.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    viewport: { width: 1440, height: 1000 },
    permissions: ['microphone', 'clipboard-read', 'clipboard-write'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        // The "microphone" plays a synthetic teacher note (local TTS, bench audio): voice.spec.ts.
        `--use-file-for-fake-audio-capture=${join(HERE, '..', 'ai-service', 'bench', 'audio', 'b01.wav')}`,
      ],
    },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/serve.mjs',
    // A page through the proxy: /v1/pilot/info answers before Next.js (3101) is up, and the first
    // test then met "The owner web is not running" (502 until Next.js serves).
    url: 'http://127.0.0.1:9443/ar/centre',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
