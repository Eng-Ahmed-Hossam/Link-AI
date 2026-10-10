'use client';

import { useRouter } from 'next/navigation';
import { useMe } from '@link/api-client';
import { Button, Card, PageTitle } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { useSession } from '../../session';
import { LangSwitch } from '../../LangSwitch';
import { DataRights } from '../DataRights';

/**
 * Account tab (11 §3). Phase 1: language (MKT-ACC-03), "My data" (PDPL, MKT-OPS-09) and sign out
 * (MKT-ACC-04). No Figma frame.
 */
export function Account() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const { session, signOut } = useSession();
  const me = useMe({ enabled: !!session });
  return (
    <>
      <PageTitle title={t('parent.nav.account')} subtitle={me.data?.name ?? undefined} />
      <Card className="flex flex-col gap-3">
        <h2 className="text-label text-navy">{t('common.languageSwitch.label')}</h2>
        <LangSwitch locale={locale} />
      </Card>
      {session ? <DataRights /> : null}
      {session ? (
        <Button
          variant="secondary"
          onClick={() => {
            signOut();
            router.push(`/${locale}/welcome?mode=sign-in`);
          }}
        >
          {t('parent.account.signOut')}
        </Button>
      ) : (
        <Button onClick={() => router.push(`/${locale}/welcome?mode=sign-in`)}>
          {t('parent.welcome.signIn')}
        </Button>
      )}
    </>
  );
}
