import type { NextConfig } from 'next';

const PILOT = process.env.NEXT_PUBLIC_LINK_MODE === 'pilot';

const config: NextConfig = {
  // The concierge pilot builds into its own folder so it never mixes with `pnpm demo` (apps/pilot).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['@link/ui', '@link/i18n', '@link/tokens', '@link/api-client', '@link/mocks'],
  devIndicators: false,
  agentRules: false,
  turbopack: {
    // msw 3 blocks `msw/browser` under the `node` condition, which the SSR pass of a client
    // component uses. The worker only ever starts in the browser, so SSR gets a stub.
    resolveAlias: {
      'msw/browser': { browser: 'msw/browser', default: './src/msw-browser-stub.ts' },
      // Demo- and dev-only code (Demo controls, dev panel, MSW, sample sign-in) is one module;
      // the concierge pilot build swaps it for a stub so none of it ships (apps/pilot check).
      '@demo': PILOT ? './src/demo/pilot.ts' : './src/demo/index.ts',
    },
  },
};

export default config;
