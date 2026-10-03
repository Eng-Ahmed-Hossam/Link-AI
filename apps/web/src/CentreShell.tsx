'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, Building2, DoorOpen, Star, UserCog, Wallet } from 'lucide-react';
import { SideNav, type SideNavSection } from '@link/ui';
import { createTranslator, type Locale } from '@link/i18n';
import { flags } from './flags';
import { LangSwitch } from './LangSwitch';

/** Desktop owner shell. Phase 1: Marketplace items + Staff. Follow-up items stay behind `flags.followUpNav`. */
export function CentreShell({ locale, centreId, children }: { locale: Locale; centreId: string; children: ReactNode }) {
  const t = createTranslator(locale);
  const base = `/${locale}/centre/${centreId}`;
  const pathname = usePathname() ?? '';

  const sections: SideNavSection[] = [
    {
      id: 'marketplace',
      label: t('centre.nav.marketplace'),
      items: [
        { id: 'profile', label: t('centre.nav.publicProfile'), icon: <Building2 />, href: `${base}/profile` },
        { id: 'schedule', label: t('centre.nav.roomSchedule'), icon: <CalendarDays />, href: `${base}/schedule` },
        { id: 'reviews', label: t('centre.nav.reviews'), icon: <Star />, href: `${base}/reviews` },
        { id: 'rooms', label: t('centre.nav.roomsRequests'), icon: <DoorOpen />, href: `${base}/rooms` },
        { id: 'rent-income', label: t('centre.nav.rentIncome'), icon: <Wallet />, href: `${base}/rent-income` },
      ],
    },
    {
      id: 'workspace',
      label: t('centre.nav.workspace'),
      items: [{ id: 'staff', label: t('centre.nav.staff'), icon: <UserCog />, href: `${base}/staff` }],
    },
  ];
  // Phase 2 follow-up navigation is deliberately absent unless the flag is on.
  void flags.followUpNav;

  const activeId = sections.flatMap((s) => s.items).find((i) => pathname.startsWith(i.href))?.id ?? 'profile';

  return (
    <div className="flex min-h-dvh bg-bg">
      <SideNav
        label={t('centre.nav.label')}
        sections={sections}
        activeId={activeId}
        header={
          <span className="px-3 text-heading" dir="ltr">
            Link
          </span>
        }
        renderLink={(item, props) => <Link href={item.href} {...props} />}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-white px-8 py-3">
          <h1 className="text-heading">{t('centre.shell.title')}</h1>
          <LangSwitch locale={locale} />
        </header>
        <main id="main" className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
