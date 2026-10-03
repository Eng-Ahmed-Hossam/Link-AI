import { MOCK_SERVER_URL, resolveApiMode } from '@link/api-client';

/** `mock` (MSW in the browser) | `mock-server` (shared state over HTTP) | `live` (core-api). */
export const API_MODE = resolveApiMode(
  process.env.NEXT_PUBLIC_API_MODE,
  process.env.NEXT_PUBLIC_USE_MOCKS,
);
export const API_BASE_URL =
  API_MODE === 'mock'
    ? ''
    : (process.env.NEXT_PUBLIC_API_BASE_URL ?? (API_MODE === 'mock-server' ? MOCK_SERVER_URL : ''));

/**
 * Demo controls: dev only, APP_ENV=local plus the demo flag, never with live data and never in a
 * production build (the NODE_ENV check lets the bundler drop the panel entirely).
 */
export const DEMO_CONTROLS =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_APP_ENV === 'local' &&
  process.env.NEXT_PUBLIC_DEMO_CONTROLS === '1' &&
  API_MODE !== 'live';
