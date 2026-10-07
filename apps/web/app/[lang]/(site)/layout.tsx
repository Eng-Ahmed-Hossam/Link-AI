import type { ReactNode } from 'react';
import { parseLocale } from '@/i18n';
import { SiteFooter } from '@/site/SiteFooter';
import { PageView } from '@/site/Tracked';

/** The public website (landing, try it, request a pilot, pilot sign-in): one footer, page views. */
export default async function SiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const locale = parseLocale((await params).lang);
  return (
    <>
      <PageView lang={locale} />
      <main id="main" className="site-page bg-white">
        {children}
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
