'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, FileLock2, GraduationCap, Receipt, ShieldCheck } from 'lucide-react';
import { api } from '@link/api-client';
import { SideNav } from '@link/ui';
import { createTranslator, type Locale, type MessageKey } from '@link/i18n';
import { LangSwitch } from './LangSwitch';
import { OpsGate, useOpsMe } from './OpsGate';
import { SECTIONS, type Section } from './sections';

/** Ops console shell: dark side navigation, desktop-first. L01–L03 plus teachers and PDPL. */
export function OpsShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <OpsGate locale={locale}>
      <Shell locale={locale}>{children}</Shell>
    </OpsGate>
  );
}

function Shell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = createTranslator(locale);
  const me = useOpsMe();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const icon = {
    centres: <Building2 />,
    teachers: <GraduationCap />,
    reviews: <ShieldCheck />,
    refunds: <Receipt />,
    'data-requests': <FileLock2 />,
  };
  const items = (Object.keys(SECTIONS) as Section[])
    .filter((s) => me.permissions.includes(SECTIONS[s]))
    .map((s) => ({
      id: s,
      label: t(`ops.nav.${s === 'data-requests' ? 'dataRequests' : s}` as MessageKey),
      icon: icon[s],
      href: `/${locale}/${s}`,
    }));
  const activeId = items.find((i) => pathname.startsWith(i.href))?.id ?? items[0]?.id ?? '';
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
        footer={
          <div className="flex flex-col gap-3 px-3">
            <span className="text-caption" data-testid="ops-user">
              {me.name}
            </span>
            <button
              type="button"
              className="min-h-11 text-start text-label underline"
              onClick={() => void api.logout().finally(() => router.replace(`/${locale}/sign-in`))}
            >
              {t('ops.shell.signOut')}
            </button>
            <LangSwitch locale={locale} />
          </div>
        }
        renderLink={(item, props) => <Link href={item.href} {...props} />}
      />
      <main id="main" className="min-w-0 flex-1 p-8">
        {children}
      </main>
    </div>
  );
}
