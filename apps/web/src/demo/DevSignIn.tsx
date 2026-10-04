'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@link/ui';
import { useI18n } from '../i18n-client';
import { useSession } from '../session';

/** Mock modes only: sign in as the sample owner or Reception (dev shortcut; no real auth). */
export function DevSignIn({ landing }: { landing: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { signIn } = useSession();
  return (
    <>
      <Button
        data-testid="sign-in-owner"
        onClick={() => {
          signIn({ accessToken: 'mock.usr-owner', userId: 'usr-owner', roles: ['centre_owner'] });
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
  );
}
