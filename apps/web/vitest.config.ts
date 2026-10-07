import { defineConfig } from 'vitest/config';

// Unit tests only; Playwright owns e2e/ and e2e-demo/ (*.spec.ts).
export default defineConfig({
  test: { include: ['src/**/*.test.ts', 'app/**/*.test.ts'], environment: 'node' },
});
