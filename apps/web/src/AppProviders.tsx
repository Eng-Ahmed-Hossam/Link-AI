import type { ReactNode } from 'react';
import type { Locale } from '@link/i18n';
import { I18nProvider } from './i18n-client';
import { Providers } from './providers';

/** Everything the app screens need on the client: translations, data, session, the mock worker. */
export function AppProviders({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <I18nProvider locale={locale}>
      <Providers locale={locale}>{children}</Providers>
    </I18nProvider>
  );
}
