'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LoadingState } from '@link/ui';
import { useI18n } from '../i18n-client';
import { useSession } from '../session';

/** Reserving, My children and feedback need a signed-in parent; others are sent to P01 and back. */
export function RequireParent({ children }: { children: ReactNode }) {
  const { session, ready } = useSession();
  const { locale, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const ok = !!session?.roles.includes('parent');

  useEffect(() => {
    if (ready && !ok) router.replace(`/${locale}/welcome?next=${encodeURIComponent(pathname)}`);
  }, [ready, ok, locale, pathname, router]);

  if (!ready || !ok) return <LoadingState label={t('states.loading.label')} />;
  return <>{children}</>;
}
