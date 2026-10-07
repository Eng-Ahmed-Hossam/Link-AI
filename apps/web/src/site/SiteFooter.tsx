import Link from 'next/link';
import { Logo } from '@link/ui';
import type { Locale } from '@link/i18n';
import { getT } from '../i18n';

/**
 * Website footer: tagline, contact, the privacy note, language and "Sign in (pilot centres)".
 * No address or phone number yet (Ahmed: leave the email blank for now): contact is the pilot form.
 */
export function SiteFooter({ locale }: { locale: Locale }) {
  const t = getT(locale);
  return (
    <footer className="bg-navy text-white">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_1fr_1.4fr]">
        <div className="flex flex-col gap-4">
          <Logo variant="lockup-dark" size={36} label={t('common.appName')} />
          <p className="max-w-sm text-web-small text-white/70">{t('landing.footer.tagline')}</p>
          <div
            role="group"
            aria-label={t('landing.footer.language')}
            className="flex w-fit gap-1 rounded-full border border-white/20 p-1"
          >
            {(['ar', 'en'] as const).map((l) => (
              <Link
                prefetch={false}
                key={l}
                href={`/${l}`}
                hrefLang={l}
                lang={l}
                aria-current={l === locale ? 'true' : undefined}
                className={
                  l === locale
                    ? 'inline-flex min-h-11 items-center rounded-full bg-white px-4 text-web-small font-bold text-navy'
                    : 'inline-flex min-h-11 items-center rounded-full px-4 text-web-small text-white/80 hover:text-white'
                }
              >
                {t(l === 'ar' ? 'common.languageSwitch.ar' : 'common.languageSwitch.en')}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-web-eyebrow text-white/60">{t('landing.footer.contact')}</h2>
          <p className="text-web-small text-white/80">{t('landing.footer.contactBody')}</p>
          <Link
            prefetch={false}
            href={`/${locale}/pilot`}
            className="inline-flex min-h-11 w-fit items-center text-web-small font-bold text-[#7fd8ff] underline underline-offset-4"
          >
            {t('landing.cta.pilot')}
          </Link>
          <Link
            prefetch={false}
            href={`/${locale}/sign-in`}
            className="inline-flex min-h-11 w-fit items-center text-web-small text-white/80 underline underline-offset-4 hover:text-white"
          >
            {t('landing.nav.signIn')}
          </Link>
        </div>
        <div id="privacy" className="flex flex-col gap-3">
          <h2 className="text-web-eyebrow text-white/60">{t('landing.footer.privacy')}</h2>
          <p className="text-web-small text-white/80">{t('landing.footer.privacyBody')}</p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-[1200px] px-4 py-6 text-web-small text-white/60 sm:px-6">
          {t('landing.footer.rights')}
        </p>
      </div>
    </footer>
  );
}
