import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request } from 'express';

/**
 * The caller's real address behind the web's /v1 proxy (Vercel). The web's proxy (apps/web
 * proxy.ts) sends the visitor's address in `x-link-client-ip`, signed by `x-link-proxy-secret`
 * (LINK_PROXY_SECRET, the same on both sides). core-api believes that header ONLY with the right
 * secret; anyone else gets the address Express' trust proxy gives (Railway's edge), as before. So
 * testers behind one Vercel edge no longer share one rate limit, and nobody can fake an address.
 */
export const PROXY_SECRET_HEADER = 'x-link-proxy-secret';
export const CLIENT_IP_HEADER = 'x-link-client-ip';

const digest = (v: string) => createHash('sha256').update(v).digest();

export function clientIp(req: Request, proxySecret: string | undefined): string {
  const fallback = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  if (!proxySecret) return fallback;
  const sent = req.header(PROXY_SECRET_HEADER);
  if (!sent || !timingSafeEqual(digest(sent), digest(proxySecret))) return fallback;
  const claimed = req.header(CLIENT_IP_HEADER)?.split(',')[0]?.trim();
  return claimed && isIP(claimed) ? claimed : fallback;
}
