import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@link/ui', '@link/i18n', '@link/tokens', '@link/api-client', '@link/mocks'],
  turbopack: {
    // msw 3 blocks `msw/browser` under the `node` condition, which the SSR pass of a client
    // component uses. The worker only ever starts in the browser, so SSR gets a stub.
    resolveAlias: {
      'msw/browser': { browser: 'msw/browser', default: './src/msw-browser-stub.ts' },
    },
  },
};

export default config;
