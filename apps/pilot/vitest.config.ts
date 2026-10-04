import { defineConfig } from 'vitest/config';

// Unit and integration tests only; the Playwright suite in e2e/ runs with `pnpm test:e2e`.
export default defineConfig({ test: { include: ['test/**/*.test.ts'], testTimeout: 60_000 } });
