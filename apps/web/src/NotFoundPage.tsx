'use client';

import Link from 'next/link';
import { Card, ErrorState, Logo } from '@link/ui';
import { useI18n } from './i18n-client';

/**
 * The app's "not found" page, in the URL's language, with a way back (instead of the bare
 * Next.js 404). `/{lang}` sends people on to the right start: the centre in the pilot, else welcome.
 */
export function NotFoundPage() {
  const { locale, t } = useI18n();
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <Card padding="lg" className="flex w-full max-w-md flex-col items-center gap-2">
        <Logo variant="lockup-light" size={32} label={t('common.appName')} />
        <div data-testid="not-found">
          <ErrorState
            title={t('states.notFound.title')}
            body={t('states.notFound.body')}
            action={
              <Link
                href={`/${locale}`}
                className="inline-flex min-h-11 items-center justify-center rounded-12 bg-blue px-5 text-label text-navy shadow-glow hover:brightness-95"
              >
                {t('states.notFound.home')}
              </Link>
            }
          />
        </div>
      </Card>
    </main>
  );
}
