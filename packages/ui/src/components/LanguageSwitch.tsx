import type { ReactNode } from 'react';
import type { Locale } from '@link/i18n';
import { cn } from '../cn';

export interface LanguageSwitchProps {
  locale: Locale;
  /** Accessible name of the group, e.g. "Language". */
  label: string;
  /** "العربية" and "EN": each is written in its own language and script. */
  options: { locale: Locale; label: string; href: string }[];
  renderLink?: (
    o: { locale: Locale; label: string; href: string },
    props: {
      className: string;
      lang: string;
      hrefLang: string;
      'aria-current'?: 'true';
      children: ReactNode;
    },
  ) => ReactNode;
  tone?: 'light' | 'dark';
}

/** Language switch ("العربية / EN"). Each option is a real link, so it works without JS. */
export function LanguageSwitch({
  locale,
  label,
  options,
  renderLink,
  tone = 'light',
}: LanguageSwitchProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-12 border border-border bg-white p-1"
    >
      {options.map((o) => {
        const active = o.locale === locale;
        const props = {
          className: cn(
            'inline-flex min-h-9 min-w-11 items-center justify-center rounded-8 px-3 text-label',
            active
              ? 'bg-navy text-white'
              : tone === 'dark'
                ? 'text-navy hover:bg-soft'
                : 'text-muted hover:bg-soft',
          ),
          lang: o.locale,
          hrefLang: o.locale,
          'aria-current': active ? ('true' as const) : undefined,
          children: o.label,
        };
        return renderLink ? (
          <span key={o.locale}>{renderLink(o, props)}</span>
        ) : (
          <a key={o.locale} href={o.href} {...props} />
        );
      })}
    </div>
  );
}
