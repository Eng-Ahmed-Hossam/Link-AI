'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Receipt, ShieldCheck } from 'lucide-react';
import { SideNav } from '@link/ui';
import { createTranslator, type Locale } from '@link/i18n';
import { LangSwitch } from './LangSwitch';

/** Ops console shell: dark side navigation, desktop-first. Phase 1 screens L01–L03. */
export function OpsShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = createTranslator(locale);
  const pathname = usePathname() ?? '';
  const items = [
    { id: 'centres', label: t('ops.nav.centres'), icon: <Building2 />, href: `/${locale}/centres` },
    { id: 'reviews', label: t('ops.nav.reviews'), icon: <ShieldCheck />, href: `/${locale}/reviews` },
    { id: 'refunds', label: t('ops.nav.refunds'), icon: <Receipt />, href: `/${locale}/refunds` },
  ];
  const activeId = items.find((i) => pathname.startsWith(i.href))?.id ?? 'centres';
  return (
    <div className="flex min-h-dvh bg-bg">
      <SideNav
        tone="dark"
        label={t('ops.nav.label')}
        sections={[{ id: 'main', items }]}
        activeId={activeId}
        header={
          <span className="px-3 text-heading" dir="ltr">
            Link ops
          </span>
        }
        footer={<LangSwitch locale={locale} />}
        renderLink={(item, props) => <Link href={item.href} {...props} />}
      />
      <main id="main" className="min-w-0 flex-1 p-8">
        {children}
      </main>
    </div>
  );
}
