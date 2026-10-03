'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createTranslator, type Locale, type Translate } from '@link/i18n';

const Ctx = createContext<{ locale: Locale; t: Translate }>({
  locale: 'ar',
  t: createTranslator('ar'),
});

/** Client-side access to the route's locale and translator. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: createTranslator(locale) }), [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
