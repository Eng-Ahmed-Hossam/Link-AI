'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Card, ErrorState, Logo, LoadingState } from '@link/ui';
import { isLocale } from '@link/i18n/locale';
import type { Translate } from '@link/i18n';

/**
 * The app's "not found" page, in the URL's language, with a way back (instead of the bare
 * Next.js 404). `/{lang}` sends people on to the right start: the centre in the pilot, else home.
 * Next loads this boundary with every page, so the translations are fetched only when it shows.
 */
export function NotFoundPage() {
  const first = (usePathname() ?? '').split('/')[1] ?? '';
  const locale = isLocale(first) ? first : 'ar';
  const [t, setT] = useState<Translate | null>(null);
  useEffect(() => {
    let alive = true;
    void import('@link/i18n').then((m) => alive && setT(() => m.createTranslator(locale)));
    return () => {
      alive = false;
    };
  }, [locale]);
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <Card padding="lg" className="flex w-full max-w-md flex-col items-center gap-2">
        {t ? (
          <>
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
          </>
        ) : (
          <LoadingState label="…" rows={2} />
        )}
      </Card>
    </main>
  );
}
