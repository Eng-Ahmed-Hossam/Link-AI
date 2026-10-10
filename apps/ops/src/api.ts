'use client';

import { configureAuth, setApiLocale } from '@link/api-client';
import type { Locale } from '@link/i18n';

/**
 * The ops console is live only (S2): core-api on the same origin (`/v1`, Caddy on a server, the
 * Next rewrite locally), the session in httpOnly cookies with `X-Link-Auth: cookie` (07 §1).
 */
configureAuth({ transport: 'cookie' });

export function useApiLocale(locale: Locale) {
  setApiLocale(locale);
}
