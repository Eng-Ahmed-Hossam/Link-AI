import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { dirOf, locales } from '@link/i18n';
import { LinkProvider } from '@link/ui';
import { Providers } from '@/providers';
import { getT, parseLocale } from '@/i18n';
import '../globals.css';

export const generateStaticParams = () => locales.map((lang) => ({ lang }));

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const locale = parseLocale((await params).lang);
  return { title: getT(locale)('common.appName') };
}

/** `<html lang dir>` is set on the server from the URL (RTL-01). */
export default async function RootLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const locale = parseLocale((await params).lang);
  const t = getT(locale);
  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:rounded-12 focus:bg-white focus:p-3"
        >
          {t('common.skipToContent')}
        </a>
        <LinkProvider locale={locale}>
          <Providers locale={locale}>{children}</Providers>
        </LinkProvider>
      </body>
    </html>
  );
}
