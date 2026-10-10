import { join } from 'node:path';
import type { NextConfig } from 'next';

/**
 * The ops console (S2): live only. Locally `/v1` is forwarded to core-api (CORE_API_URL) so the
 * session cookies stay first-party; on a server Caddy sends `/v1/*` straight to core-api for
 * ops.<domain>, so core-api sees the real client address for OPS_IP_ALLOWLIST (MKT-OPS-08).
 */
function securityHeaders() {
  const headers = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    // Ops pages show personal data: never stored by the browser or a proxy.
    { key: 'Cache-Control', value: 'no-store' },
    { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  ];
  if (process.env.NODE_ENV === 'production')
    headers.push({
      key: 'Content-Security-Policy',
      value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join('; '),
    });
  return headers;
}

const config: NextConfig = {
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? { output: 'standalone' as const, outputFileTracingRoot: join(process.cwd(), '..', '..') }
    : {}),
  transpilePackages: ['@link/ui', '@link/i18n', '@link/tokens', '@link/api-client'],
  devIndicators: false,
  agentRules: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders() }];
  },
  async rewrites() {
    const coreApi = (process.env.CORE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
    return [{ source: '/v1/:path*', destination: `${coreApi}/v1/:path*` }];
  },
};

export default config;
