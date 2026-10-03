'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BottomNav, Logo, MobileShell } from '@link/ui';
import { useI18n } from '../i18n-client';
import { LangSwitch } from '../LangSwitch';

/** Pages that show the parent tab bar (Figma P02, P03, P09). Detail and checkout pages do not. */
const TAB_ROOTS = ['/search', '/children', '/account'];

/**
 * Parent PWA frame: lockup + "PARENT" eyebrow + language switch (MKT-ACC-03 AC2: on every screen),
 * header wash, and the floating tab bar Search · My children · Account (11 §3).
 */
export function ParentShell({ children, eyebrow }: { children: ReactNode; eyebrow?: string }) {
  const { locale, t } = useI18n();
  const pathname = usePathname() ?? '';
  const rest = pathname.replace(/^\/(ar|en)/, '');
  const items = [
    { id: 'search', label: t('parent.nav.search'), href: `/${locale}/search` },
    { id: 'children', label: t('parent.nav.children'), href: `/${locale}/children` },
    { id: 'account', label: t('parent.nav.account'), href: `/${locale}/account` },
  ];
  const showTabs = TAB_ROOTS.some((r) => rest === r || rest.startsWith(`${r}/`));
  const activeId =
    items.find((i) => rest.startsWith(i.href.replace(/^\/(ar|en)/, '')))?.id ?? 'search';

  return (
    <MobileShell
      logo={
        <Link href={`/${locale}/search`} aria-label={t('common.home')}>
          <Logo variant="lockup-light" size={25} label={t('common.appName')} />
        </Link>
      }
      eyebrow={eyebrow ?? t('parent.shell.eyebrow')}
      trailing={<LangSwitch locale={locale} />}
      footer={
        showTabs ? (
          <BottomNav
            label={t('parent.nav.label')}
            items={items}
            activeId={activeId}
            renderLink={(item, props) => <Link href={item.href} {...props} />}
          />
        ) : undefined
      }
    >
      {children}
    </MobileShell>
  );
}
