import { NextResponse, type NextRequest } from 'next/server';
import { isLocale } from '@link/i18n';
import { isCentreSection } from './src/centre-routes';

/**
 * URLs carry the language: `/{lang}/…`; the public website opens in English by default.
 * An owner link without the centre id (`/ar/centre/today`) goes to the centre entry, which signs
 * the person in and opens that page of their own centre (`?next=/today`).
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const parts = pathname.split('/');
  const first = parts[1];
  if (!isLocale(first)) {
    const url = req.nextUrl.clone();
    url.pathname = `/en${pathname === '/' ? '' : pathname}`;
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

// `/v1/*` and `/__demo/*` belong to core-api (proxied by next.config in live mode): never localised.
export const config = { matcher: ['/((?!_next|api|v1/|__demo/|.*\\..*).*)'] };
