import type { ReactNode } from 'react';
import { dirOf } from '@link/i18n';
import { LinkProvider } from '@link/ui';
import { getT, parseLocale } from '@/i18n';
import '../globals.css';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return { title: getT(parseLocale((await params).lang))('ops.signIn.title') };
}

export default async function RootLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const locale = parseLocale((await params).lang);
  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body>
        <LinkProvider locale={locale}>{children}</LinkProvider>
      </body>
    </html>
  );
}
