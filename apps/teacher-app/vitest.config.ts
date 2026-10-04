import { defineConfig } from 'vitest/config';

// Pure logic only (no React Native imports); screens are tested with Playwright on Expo web (e2e/).
export default defineConfig({ test: { include: ['src/**/*.test.ts'], environment: 'node' } });
