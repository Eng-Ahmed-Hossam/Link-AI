import { join } from 'node:path';
import type { NextConfig } from 'next';

const PILOT = process.env.NEXT_PUBLIC_LINK_MODE === 'pilot';
/** The production web for real users (deploy/, ship job S1): live mode, no demo code shipped. */
const PRODUCTION = process.env.NEXT_PUBLIC_APP_ENV === 'production';

// Build-time production guard: a production build of the web refuses mock mode and Demo tools.
if (PRODUCTION) {
  const wrong = [
    process.env.NEXT_PUBLIC_API_MODE !== 'live' &&
      `NEXT_PUBLIC_API_MODE=${process.env.NEXT_PUBLIC_API_MODE ?? '(unset)'}: production is live mode`,
    process.env.NEXT_PUBLIC_DEMO_CONTROLS &&
      'NEXT_PUBLIC_DEMO_CONTROLS: Demo tools are not allowed',
    PILOT && 'NEXT_PUBLIC_LINK_MODE=pilot: the pilot is a separate build',
  ].filter(Boolean);
  if (wrong.length)
    throw new Error(`Refusing a production web build:\n${wrong.map((w) => `  ✗ ${w}`).join('\n')}`);
}

/**
 * Security headers on every page (docs/security-checklist.md). The content security policy is for
 * production builds only (the dev server needs eval for fast refresh): scripts and styles from
 * this origin (Next inlines its boot script, hence 'unsafe-inline'), no framing, no plugins,
 * analytics only when its key is set.
 */
// The real map (docs/plan/map-provider.md): tiles, style, glyphs and sprites from the map host;
// the Arabic text plugin (served from here) compiles WebAssembly in the map's worker.
const realMap =
  !PILOT && /^(openfreemap|maplibre)$/.test(process.env.NEXT_PUBLIC_MAP_PROVIDER ?? '');
const mapHost = realMap
  ? ` ${new URL(process.env.NEXT_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty').origin}`
  : '';

/**
 * The public trial calls the hosted demo API on its own origin (mock-server mode, ADR-0010).
 */
const demoApi =
  process.env.NEXT_PUBLIC_API_MODE === 'mock-server' && process.env.NEXT_PUBLIC_API_BASE_URL
    ? ` ${new URL(process.env.NEXT_PUBLIC_API_BASE_URL).origin}`
    : '';

/**
 * MapLibre's worker (public/maplibre/) gets its own, narrower policy: it loads the Arabic text
 * plugin — our own vendored file — with fetch + eval, which the page's policy refuses. The worker
 * has no DOM; scripts only from this origin; connections only here and to the map host. The
 * page's policy is unchanged (no 'unsafe-eval' there).
 */
function mapWorkerHeaders() {
  return [
    {
      key: 'Content-Security-Policy',
      value: [
        "default-src 'none'",
        "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
        `connect-src 'self'${mapHost}`,
        "img-src 'self' data: blob:",
      ].join('; '),
    },
  ];
}

function securityHeaders() {
  const headers = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    // The parent's "use my location" (P02) is the only device feature the web asks for.
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(self), payment=()',
    },
  ];
  if (process.env.NODE_ENV === 'production') {
    const analytics = process.env.NEXT_PUBLIC_POSTHOG_KEY
      ? ` ${process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com'}`
      : '';
    headers.push({
      key: 'Content-Security-Policy',
      value: [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline'${realMap ? " 'wasm-unsafe-eval'" : ''}`,
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob:${mapHost}`,
        "font-src 'self' data:",
        `connect-src 'self'${analytics}${mapHost}${demoApi}`,
        "worker-src 'self' blob:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join('; '),
    });
  }
  return headers;
}

const config: NextConfig = {
  // deploy/: a self-contained server (node server.js) for the production image.
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? { output: 'standalone' as const, outputFileTracingRoot: join(process.cwd(), '..', '..') }
    : {}),
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders() },
      // Last match wins for the same header key: the worker files get their own policy.
      ...(process.env.NODE_ENV === 'production' && realMap
        ? [
            {
              source: '/maplibre/:file(maplibre-gl-worker.mjs|maplibre-gl-shared.mjs)',
              headers: mapWorkerHeaders(),
            },
          ]
        : []),
    ];
  },
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
      // A production build ships the same empty stub (no Try bar, no sample sign-in).
      '@demo': PILOT || PRODUCTION ? './src/demo/pilot.ts' : './src/demo/index.ts',
    },
  },
};

export default config;
