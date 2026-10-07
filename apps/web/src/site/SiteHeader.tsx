import Link from 'next/link';
import { Logo, webButtonClass, WebArrow } from '@link/ui';
import type { Locale } from '@link/i18n';
import { getT } from '../i18n';
import { TrackedLink } from './Tracked';

/** Website header (landing frame 68:616): dark, over the hero. Section links on wide screens. */
export function SiteHeader({ locale, home = false }: { locale: Locale; home?: boolean }) {
  const t = getT(locale);
  const other: Locale = locale === 'ar' ? 'en' : 'ar';
  const anchor = (id: string) => (home ? `#${id}` : `/${locale}#${id}`);
  return (
    <header className="relative z-10 border-b border-white/10">
      <div className="mx-auto flex max-w-[1200px] items-center gap-6 px-4 py-4 sm:px-6">
        <Link
          prefetch={false}
          href={`/${locale}`}
          className="shrink-0 rounded-12"
          aria-label={t('common.appName')}
        >
          <Logo variant="lockup-dark" size={36} label={t('common.appName')} />
        </Link>
        <nav aria-label={t('landing.nav.label')} className="hidden flex-1 justify-center lg:flex">
          <ul className="flex items-center gap-1">
            {(
              [
                ['how', 'landing.nav.how'],
                ['trust', 'landing.nav.trust'],
                ['pilot', 'landing.nav.pilot'],
                ['faq', 'landing.nav.faq'],
              ] as const
            ).map(([id, key]) => (
              <li key={id}>
                <a
                  href={anchor(id)}
                  className="inline-flex min-h-11 items-center rounded-full px-4 text-web-small text-white/80 hover:bg-white/10 hover:text-white"
                >
                  {t(key)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ms-auto flex items-center gap-2 lg:ms-0">
          <Link
            prefetch={false}
            href={`/${other}`}
            hrefLang={other}
            lang={other}
            className="inline-flex min-h-11 items-center rounded-full border border-white/25 px-4 text-web-small text-white hover:bg-white/10"
          >
            {t(other === 'ar' ? 'common.languageSwitch.ar' : 'common.languageSwitch.en')}
          </Link>
          <Link
            prefetch={false}
            href={`/${locale}/sign-in`}
            className="hidden min-h-11 items-center px-3 text-web-small text-white/90 hover:text-white md:inline-flex"
          >
            {t('landing.nav.signIn')}
          </Link>
          <span className="hidden sm:contents">
            <TrackedLink
              prefetch={false}
              href={`/${locale}/pilot`}
              event="landing_pilot_click"
              lang={locale}
              placement="header"
              className={webButtonClass('primary', '!py-3')}
            >
              {t('landing.cta.pilot')}
              <WebArrow />
            </TrackedLink>
          </span>
        </div>
      </div>
    </header>
  );
}
