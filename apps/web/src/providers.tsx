'use client';

import { useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setApiBaseUrl, setApiLocale } from '@link/api-client';
import { MockBadge, ToastProvider } from '@link/ui';
import type { Locale } from '@link/i18n';
import { createTranslator } from '@link/i18n';
import { SessionProvider } from './session';
import { API_BASE_URL, API_MODE } from './api-mode';

// Demo-only panels load on demand: they pull the mock data in, which the website never needs.
// The presenter's Demo controls exist only in the local demo. The condition is written out so the
// bundler replaces it at build time: production builds (the public demo, the pilot) carry no trace
// of them — `pnpm check:public-demo` and the pilot start-up check prove it.
const DemoControls =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_APP_ENV === 'local' &&
  process.env.NEXT_PUBLIC_DEMO_CONTROLS === '1'
    ? dynamic(() => import('./demo/DemoControls').then((m) => m.DemoControls), { ssr: false })
    : // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (_: { showButton?: boolean }) => null;
const DevPanel = dynamic(() => import('@demo').then((m) => m.DevPanel), { ssr: false });
const TryBar = dynamic(() => import('@demo').then((m) => m.TryBar), { ssr: false });

const USE_MSW = API_MODE === 'mock';
// `mock-server` and `live` talk to a URL; `mock` stays same-origin for the MSW worker.
setApiBaseUrl(API_BASE_URL);

// One worker per page load: React strict mode runs effects twice in dev.
let started: Promise<unknown> | null = null;
const startOnce = () => (started ??= import('@demo').then((m) => m.startMocks()));

/** TanStack Query, session, toasts and the MSW browser worker. The badge shows whenever mock data is on. */
export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  );
  const [ready, setReady] = useState(!USE_MSW);
  const t = createTranslator(locale);
  // Developer tools only on /dev (2A.6); public pages show the demo banner and "Reset demo" only.
  const devPage = /^\/(ar|en)\/dev(\/|$)/.test(usePathname() ?? '');
  // API calls carry the page language (Accept-Language, 07 §1).
  setApiLocale(locale);

  useEffect(() => {
    if (ready) return;
    let alive = true;
    startOnce()
      .catch((e) => console.warn('Mock worker failed to start', e))
      .then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [ready]);

  return (
    <QueryClientProvider client={client}>
      <SessionProvider>
        <ToastProvider label={t('common.notifications')}>
          <TryBar locale={locale} />
          {ready ? children : null}
          {API_MODE !== 'live' ? <MockBadge label={t('common.mockBadge')} /> : null}
          {USE_MSW && devPage ? <DevPanel /> : null}
          {/* The floating button only on /dev (2A.6); the banner's "Demo tools" opens the panel anywhere. */}
          <DemoControls showButton={devPage} />
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
