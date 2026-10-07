import type { ReactNode } from 'react';
import type { Locale } from '@link/i18n';
import { SiteHeader } from '@/site/SiteHeader';

/** Frame for the small website pages: the dark header, then a card on a soft background. */
export function SitePage({
  locale,
  title,
  lead,
  children,
}: {
  locale: Locale;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="bg-navy">
        <SiteHeader locale={locale} />
      </div>
      <div className="bg-[linear-gradient(180deg,#e8f7fe_0%,#fafdff_100%)] px-4 py-12 sm:py-16">
        <div className="mx-auto flex max-w-[560px] flex-col gap-6 rounded-24 border border-border bg-white p-6 shadow-card sm:p-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-web-h2 text-navy">{title}</h1>
            {lead ? <p className="text-web-body text-muted">{lead}</p> : null}
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
