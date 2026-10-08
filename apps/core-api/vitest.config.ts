import { defineConfig } from 'vitest/config';

// Integration and RLS suites share one database (link_test), so files run one after another.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
