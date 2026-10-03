'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setApiLocale } from '@link/api-client';
import { MockBadge, ToastProvider } from '@link/ui';
import type { Locale } from '@link/i18n';
import { createTranslator } from '@link/i18n';
import { SessionProvider } from './session';
import { DevPanel } from './DevPanel';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== 'false';

// One worker per page load: React strict mode runs effects twice in dev.
let started: Promise<unknown> | null = null;
const startOnce = () =>
  (started ??= import('@link/mocks/browser').then(({ startMocks }) => startMocks()));

/** TanStack Query, session, toasts and the MSW browser worker. The badge shows whenever mocks are on. */
export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  );
  const [ready, setReady] = useState(!USE_MOCKS);
  const t = createTranslator(locale);
  // API calls carry the page language (Accept-Language, 07 §1).
  setApiLocale(locale);

  useEffect(() => {
    if (!USE_MOCKS) return;
    let alive = true;
    startOnce()
      .catch((e) => console.warn('Mock worker failed to start', e))
      .then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <QueryClientProvider client={client}>
      <SessionProvider>
        <ToastProvider label={t('common.notifications')}>
          {ready ? children : null}
          {USE_MOCKS ? (
            <>
              <MockBadge label={t('common.mockBadge')} />
              <DevPanel />
            </>
          ) : null}
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
