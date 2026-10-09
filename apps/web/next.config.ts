import type { NextConfig } from 'next';

const PILOT = process.env.NEXT_PUBLIC_LINK_MODE === 'pilot';

const config: NextConfig = {
  // The concierge pilot builds into its own folder so it never mixes with `pnpm demo` (apps/pilot).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['@link/ui', '@link/i18n', '@link/tokens', '@link/api-client', '@link/mocks'],
  devIndicators: false,
  agentRules: false,
  // Live mode (docs/07 §1): the web calls core-api on its own origin, so the httpOnly session
  // cookies are first-party and no cross-origin credentials are needed.
  // Never in the pilot build (the pilot server serves /v1 itself), and the dev-only /__demo
  // routes only in development, so no production bundle names them (pilot start-up check).
  async rewrites() {
    if (PILOT || process.env.NEXT_PUBLIC_API_MODE !== 'live') return [];
    const coreApi = (process.env.CORE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
    return [
      { source: '/v1/:path*', destination: `${coreApi}/v1/:path*` },
      ...(process.env.NODE_ENV === 'production'
        ? []
        : [{ source: '/__demo/:path*', destination: `${coreApi}/__demo/:path*` }]),
    ];
  },
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
