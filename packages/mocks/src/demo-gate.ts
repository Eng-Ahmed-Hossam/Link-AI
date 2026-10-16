import { createHash, timingSafeEqual } from 'node:crypto';

/** The header every `/__demo/*` call sends when the server has DEMO_ROUTES_SECRET. */
export const DEMO_SECRET_HEADER = 'x-link-demo-secret';

/**
 * Who may call the mock server's demo routes (`/__demo/*`: reset, settings, provider, story…).
 *   secret set → the call must send it in `x-link-demo-secret`, else 401;
 *   no secret on a hosted server → the routes are off (404);
 *   no secret on a developer machine → open, as before.
 * The handlers match `*\/__demo/…`, so any prefix reaches them (`/x/__demo/reset`, `/%5F%5Fdemo`):
 * the check looks for `/__demo` anywhere in the decoded path.
 */
export interface DemoGateOptions {
  secret: string;
  hosted: boolean;
}

export const isDemoPath = (pathname: string) => {
  let p = pathname;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    /* malformed escapes: check the raw path */
  }
  return /\/__demo(\/|$)/i.test(p.replaceAll('\\', '/'));
};

const digest = (v: string) => createHash('sha256').update(v).digest();

/** null = let the call through; 401 or 404 = answer that and run nothing. */
export function demoGate(
  pathname: string,
  header: string | null | undefined,
  o: DemoGateOptions,
): null | 401 | 404 {
  if (!isDemoPath(pathname)) return null;
  if (o.secret) return header && timingSafeEqual(digest(o.secret), digest(header)) ? null : 401;
  return o.hosted ? 404 : null;
}

/**
 * Hosted = reachable by other people: a Railway service (RAILWAY_PROJECT_ID is always set there),
 * browsers from other origins allowed (CORS_ALLOWED_ORIGINS), or MOCK_SERVER_PUBLIC=1.
 */
export const demoGateFromEnv = (env: NodeJS.ProcessEnv = process.env): DemoGateOptions => ({
  secret: env.DEMO_ROUTES_SECRET ?? '',
  hosted:
    !!env.RAILWAY_PROJECT_ID ||
    !!env.CORS_ALLOWED_ORIGINS?.trim() ||
    env.MOCK_SERVER_PUBLIC === '1',
});

/**
 * The demo routes a visitor's browser may call on the public trial (ADR-0010), always inside its
 * own sandbox: switch the trial's flags, start its own world over, read its own state. Everything
 * else under /__demo stays behind DEMO_ROUTES_SECRET.
 */
export const PUBLIC_DEMO_ROUTES: readonly (readonly [string, RegExp])[] = [
  ['POST', /^\/__demo\/settings$/],
  ['POST', /^\/__demo\/reset$/],
  ['GET', /^\/__demo\/state(\/(ar|en))?$/],
];
export const isPublicDemoRoute = (method: string, pathname: string) =>
  PUBLIC_DEMO_ROUTES.some(([m, re]) => m === method && re.test(pathname));

/** A visitor may switch only these trial flags (never real speech-to-text, never faults). */
export function publicSettings(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const k of ['phase2', 'marketplace'] as const) if (typeof b[k] === 'boolean') out[k] = b[k];
  return out;
}
