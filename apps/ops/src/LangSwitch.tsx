'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LanguageSwitch } from '@link/ui';
import { createTranslator, type Locale } from '@link/i18n';

/** Swaps the first path segment, so the user stays on the same screen. */
export function LangSwitch({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? `/${locale}`;
  const rest = pathname.split('/').slice(2).join('/');
  const t = createTranslator(locale);
  const href = (l: Locale) => `/${l}${rest ? `/${rest}` : ''}`;
  return (
    <LanguageSwitch
      locale={locale}
      label={t('common.languageSwitch.label')}
      options={[
        { locale: 'ar', label: t('common.languageSwitch.ar'), href: href('ar') },
        { locale: 'en', label: t('common.languageSwitch.en'), href: href('en') },
      ]}
      renderLink={(o, props) => <Link href={o.href} {...props} />}
    />
  );
}
