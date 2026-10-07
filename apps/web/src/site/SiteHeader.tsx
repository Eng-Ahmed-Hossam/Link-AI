import Link from 'next/link';
import { Logo, webButtonClass, WebArrow } from '@link/ui';
import type { Locale } from '@link/i18n';
import { getT } from '../i18n';
import { TrackedLink } from './Tracked';

/**
 * Website nav (Figma 68:617): logo; How it works, Features, Marketplace, Pricing, FAQ; the other
 * language; Log in; Join Link. Section links show on wide screens.
 */
export function SiteHeader({ locale, home = false }: { locale: Locale; home?: boolean }) {
  const t = getT(locale);
  const other: Locale = locale === 'ar' ? 'en' : 'ar';
  const anchor = (id: string) => (home ? `#${id}` : `/${locale}#${id}`);
  const links = [
    ['how-it-works', 'site.nav.how'],
    ['features', 'site.nav.features'],
    ['marketplace', 'site.nav.marketplace'],
    ['pricing', 'site.nav.pricing'],
    ['faq', 'site.nav.faq'],
  ] as const;
  return (
    <header className="relative z-10 border-b border-white/8 bg-navy px-4 py-5 sm:px-6 lg:px-8 xl:px-0">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-6">
        <Link
          prefetch={false}
          href={`/${locale}`}
          className="shrink-0 rounded-12"
          aria-label={t('common.appName')}
        >
          <Logo variant="lockup-dark" size={40} label={t('common.appName')} />
        </Link>
        <nav aria-label={t('site.nav.label')} className="hidden lg:block">
          <ul className="flex items-center gap-9">
            {links.map(([id, key]) => (
              <li key={id}>
                <a
                  href={anchor(id)}
                  className="text-[14px] leading-[1.5] font-medium text-white/78 hover:text-white"
                >
                  {t(key)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2.5 sm:gap-5">
          <Link
            prefetch={false}
            href={`/${other}`}
            hrefLang={other}
            lang={other}
            className="inline-flex min-h-11 items-center rounded-full border border-white/16 bg-white/8 px-3.5 text-[14px] font-semibold text-white hover:bg-white/14 sm:min-h-0 sm:py-1"
          >
            {t(other === 'ar' ? 'site.lang.ar' : 'site.lang.en')}
          </Link>
          <Link
            prefetch={false}
            href={`/${locale}/sign-in`}
            className="inline-flex min-h-11 items-center text-[14px] leading-[1.5] font-semibold whitespace-nowrap text-white"
          >
            {t('site.nav.logIn')}
          </Link>
          <TrackedLink
            prefetch={false}
            href={`/${locale}/try`}
            event="landing_try_click"
            lang={locale}
            placement="header"
            className={webButtonClass('primary', 'px-5! py-3! whitespace-nowrap')}
            data-testid="cta-try-header"
          >
            {t('site.nav.join')}
            <WebArrow />
          </TrackedLink>
        </div>
      </div>
    </header>
  );
}
