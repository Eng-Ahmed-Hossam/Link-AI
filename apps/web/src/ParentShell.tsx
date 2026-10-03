'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Baby, Search, UserRound } from 'lucide-react';
import { BottomNav } from '@link/ui';
import { createTranslator, type Locale } from '@link/i18n';
import { LangSwitch } from './LangSwitch';

/** Mobile-first PWA shell: bottom tabs Search · My children · Account (11 §3). */
export function ParentShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = createTranslator(locale);
  const pathname = usePathname() ?? '';
  const items = [
    { id: 'search', label: t('parent.nav.search'), icon: <Search />, href: `/${locale}/search` },
    { id: 'children', label: t('parent.nav.children'), icon: <Baby />, href: `/${locale}/children` },
    { id: 'account', label: t('parent.nav.account'), icon: <UserRound />, href: `/${locale}/account` },
  ];
  const activeId = items.find((i) => pathname.startsWith(i.href))?.id ?? 'search';
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg">
      <header className="flex items-center justify-between border-b border-border bg-white p-3">
        <span className="text-heading" dir="ltr">
          Link
        </span>
        <LangSwitch locale={locale} />
      </header>
      <main id="main" className="flex-1 p-4">
        {children}
      </main>
      <BottomNav
        label={t('parent.nav.label')}
        items={items}
        activeId={activeId}
        renderLink={(item, props) => <Link href={item.href} {...props} />}
      />
    </div>
  );
}
