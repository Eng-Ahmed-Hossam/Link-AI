import { MOCK_SERVER_URL, resolveApiMode } from '@link/api-client';

/**
 * Concierge pilot build (`pnpm pilot:build`, docs/13): the owner web served by the pilot server on
 * the centre laptop. A compile-time constant, so pilot-only and demo-only code drop out of bundles.
 */
export const PILOT = process.env.NEXT_PUBLIC_LINK_MODE === 'pilot';

/** `mock` (MSW in the browser) | `mock-server` (shared state over HTTP) | `live` (core-api). */
export const API_MODE = resolveApiMode(
  process.env.NEXT_PUBLIC_API_MODE,
  process.env.NEXT_PUBLIC_USE_MOCKS,
);
/**
 * core-api (real accounts, cookies, server flags): live mode outside the pilot. The pilot build is
 * also `live` (it talks to the pilot server), which has its own sessions and no core-api routes.
 */
export const CORE_API = API_MODE === 'live' && !PILOT;

/**
 * `mock` stays same-origin for the MSW worker; `live` is same-origin too (next.config proxies
 * /v1 to core-api, so the httpOnly session cookies are first-party, 07 §1).
 */
export const API_BASE_URL =
  API_MODE === 'mock' || API_MODE === 'live'
    ? ''
    : (process.env.NEXT_PUBLIC_API_BASE_URL ?? MOCK_SERVER_URL);

/**
 * Demo controls: dev only, APP_ENV=local plus the demo flag, never with live data and never in a
 * production build (the NODE_ENV check lets the bundler drop the panel entirely).
 */
export const DEMO_CONTROLS =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_APP_ENV === 'local' &&
  process.env.NEXT_PUBLIC_DEMO_CONTROLS === '1' &&
  API_MODE !== 'live';
