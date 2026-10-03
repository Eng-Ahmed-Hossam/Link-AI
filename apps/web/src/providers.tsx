'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MockBadge } from '@link/ui';
import type { Locale } from '@link/i18n';
import { createTranslator } from '@link/i18n';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== 'false';

/** TanStack Query + the MSW browser worker. The badge shows whenever mocks are on. */
export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const [ready, setReady] = useState(!USE_MOCKS);

  useEffect(() => {
    if (!USE_MOCKS) return;
    let alive = true;
    import('@link/mocks/browser').then(({ startMocks }) => startMocks()).then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <QueryClientProvider client={client}>
      {ready ? children : null}
      {USE_MOCKS ? <MockBadge label={createTranslator(locale)('common.mockBadge')} /> : null}
    </QueryClientProvider>
  );
}
