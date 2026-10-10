import { NextResponse, type NextRequest } from 'next/server';
import { defaultLocale, isLocale } from '@link/i18n';

/** URLs carry the language: `/{lang}/…`, with `ar` as the default (RTL-01). */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const first = pathname.split('/')[1];
  if (isLocale(first)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next|api|v1/|.*\\..*).*)'] };
