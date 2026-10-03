import type { ReactNode } from 'react';
import { parseLocale } from '@/i18n';
import { LangSwitch } from '@/LangSwitch';

export default async function PublicLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const locale = parseLocale((await params).lang);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center justify-between p-4">
        {/* Wordmark placeholder: the Figma logo SVG (65:385) is exported in Batch 1. */}
        <span className="text-heading" dir="ltr">
          Link
        </span>
        <LangSwitch locale={locale} />
      </header>
      <main id="main" className="flex-1 p-4">
        {children}
      </main>
    </div>
  );
}
