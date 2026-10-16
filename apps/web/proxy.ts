import { NextResponse, type NextRequest } from 'next/server';
import { defaultLocale, isLocale } from '@link/i18n';
import { isCentreSection } from './src/centre-routes';

/**
 * URLs carry the language: `/{lang}/…`, with `ar` as the default (RTL-01).
 * `NEXT_PUBLIC_DEFAULT_LOCALE=en` opens the public site in English (the Vercel trial); empty keeps Arabic.
 * An owner link without the centre id (`/ar/centre/today`) goes to the centre entry, which signs
 * the person in and opens that page of their own centre (`?next=/today`).
 */
const startLocale = isLocale(process.env.NEXT_PUBLIC_DEFAULT_LOCALE)
  ? process.env.NEXT_PUBLIC_DEFAULT_LOCALE
  : defaultLocale;

/**
 * /v1 on a hosted live web (the staging): forwarded to core-api with the visitor's real address
 * (Vercel sets x-real-ip; a browser can't), signed with LINK_PROXY_SECRET so core-api believes it
 * (apps/core-api/src/platform/client-ip.ts). Without the secret, next.config's rewrite proxies.
 */
function proxyApi(req: NextRequest) {
  const secret = process.env.LINK_PROXY_SECRET;
  const core = process.env.CORE_API_URL;
  if (!secret || !core) return NextResponse.next();
  const headers = new Headers(req.headers);
  headers.set('x-link-proxy-secret', secret);
  const ip =
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (ip) headers.set('x-link-client-ip', ip);
  else headers.delete('x-link-client-ip');
  const url = new URL(`${req.nextUrl.pathname}${req.nextUrl.search}`, core);
  return NextResponse.rewrite(url, { request: { headers } });
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/v1/')) return proxyApi(req);
  const parts = pathname.split('/');
  const first = parts[1];
  if (!isLocale(first)) {
    const url = req.nextUrl.clone();
    url.pathname = `/${startLocale}${pathname === '/' ? '' : pathname}`;
    return NextResponse.redirect(url);
  }
  if (parts[2] === 'centre' && isCentreSection(parts[3])) {
    const url = req.nextUrl.clone();
    url.pathname = `/${first}/centre`;
    url.search = '';
    url.searchParams.set('next', `/${parts.slice(3).filter(Boolean).join('/')}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// `/v1/*` goes to core-api (proxyApi above, or next.config's rewrite); `/__demo/*` belongs to
// core-api too: neither is localised.
export const config = { matcher: ['/((?!_next|api|health$|__demo/|.*\\..*).*)'] };
