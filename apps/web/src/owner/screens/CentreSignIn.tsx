'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Callout, Card, Logo } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { useSession } from '../../session';
import { useFlag } from '../../flags';
import { API_MODE } from '../../api-mode';
import { isStaff } from '../common';

const CENTRE = 'cen-nour';

/**
 * Centre workspace entry. Phone sign-in for owners (A18) is a Phase 1 screen (Batch 2, parked);
 * in mock modes this page offers the sample owner and Reception accounts (dev shortcut).
 */
export function CentreSignIn() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const { session, ready, signIn } = useSession();
  const followUp = useFlag('followup.owner_nav');
  const landing = `/${locale}/centre/${CENTRE}/${followUp ? 'today' : 'staff'}`;

  useEffect(() => {
    if (ready && isStaff(session?.roles)) router.replace(landing);
  }, [ready, session, landing, router]);

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <Card padding="lg" className="flex w-full max-w-md flex-col gap-4">
        <Logo variant="lockup-light" size={32} label={t('common.appName')} />
        <h1 className="text-title text-navy">{t('owner.signIn.title')}</h1>
        <Callout tone="info">{t('owner.signIn.pending')}</Callout>
        {API_MODE !== 'live' ? (
          <>
            <Button
              data-testid="sign-in-owner"
              onClick={() => {
                signIn({
                  accessToken: 'mock.usr-owner',
                  userId: 'usr-owner',
                  roles: ['centre_owner'],
                });
                router.replace(landing);
              }}
            >
              {t('owner.signIn.owner')}
            </Button>
            <Button
              variant="secondary"
              data-testid="sign-in-reception"
              onClick={() => {
                signIn({
                  accessToken: 'mock.usr-reception',
                  userId: 'usr-reception',
                  roles: ['centre_staff'],
                });
                router.replace(landing);
              }}
            >
              {t('owner.signIn.reception')}
            </Button>
          </>
        ) : (
          <p className="text-body text-muted">{t('owner.signIn.liveUnavailable')}</p>
        )}
      </Card>
    </main>
  );
}
