import Link from 'next/link';
import { Logo } from '@link/ui';
import type { Locale } from '@link/i18n';
import { getT } from '../i18n';
import { contactEmail, whatsappUrl } from './contact';

const linkCls = 'inline-flex min-h-6 text-[14px] font-medium text-white/82 hover:text-white';
const textCls = 'text-[14px] font-medium text-white/82';

/**
 * Website footer (Figma 68:629): brand and language, the Product / Company / Legal columns, the
 * copyright and the social links. "About Link", the legal pages and LinkedIn / Instagram have no
 * page or address yet (Figma note 80:691, items 5 and 6), so they are shown as text, as in Figma.
 */
export function SiteFooter({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const home = `/${locale}`;
  const wa = whatsappUrl();
  const email = contactEmail();
  return (
    <footer className="site-lazy [contain-intrinsic-size:auto_400px] bg-navy px-4 pt-[72px] pb-10 text-white sm:px-6 lg:px-8 xl:px-0">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-12">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col items-start gap-[18px] lg:w-[340px]">
            <Logo variant="lockup-dark" size={40} label={t('common.appName')} />
            <p className="max-w-[320px] text-[14px] text-white/62">{t('site.footer.tagline')}</p>
            <div
              role="group"
              aria-label={t('site.footer.language')}
              className="flex gap-1.5 rounded-full border border-white/12 bg-white/6 p-1"
            >
              {(['en', 'ar'] as const).map((l) => (
                <Link
                  prefetch={false}
                  key={l}
                  href={`/${l}`}
                  hrefLang={l}
                  lang={l}
                  aria-current={l === locale ? 'true' : undefined}
                  className={
                    l === locale
                      ? 'inline-flex min-h-8 items-center rounded-full bg-white px-3 py-[5px] text-[12px] font-bold text-navy'
                      : 'inline-flex min-h-8 items-center rounded-full px-3 py-[5px] text-[12px] font-bold text-white hover:bg-white/10'
                  }
                >
                  {t(l === 'ar' ? 'site.lang.ar' : 'site.lang.en')}
                </Link>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-[72px] gap-y-10 sm:flex sm:gap-[72px]">
            <nav aria-labelledby="footer-product" className="flex flex-col items-start gap-3.5">
              <h2 id="footer-product" className="text-[12px] font-bold text-white/50">
                {t('site.footer.product')}
              </h2>
              <a href={`${home}#how-it-works`} className={linkCls}>
                {t('site.nav.how')}
              </a>
              <a href={`${home}#features`} className={linkCls}>
                {t('site.nav.features')}
              </a>
              <a href={`${home}#marketplace`} className={linkCls}>
                {t('site.nav.marketplace')}
              </a>
              <a href={`${home}#pricing`} className={linkCls}>
                {t('site.nav.pricing')}
              </a>
            </nav>
            <nav aria-labelledby="footer-company" className="flex flex-col items-start gap-3.5">
              <h2 id="footer-company" className="text-[12px] font-bold text-white/50">
                {t('site.footer.company')}
              </h2>
              <p className={textCls}>{t('site.footer.about')}</p>
              <a href={email ? `mailto:${email}` : `${home}#join`} className={linkCls}>
                {t('site.footer.contact')}
              </a>
              <Link prefetch={false} href={`${home}/try`} className={linkCls}>
                {t('site.nav.join')}
              </Link>
            </nav>
            <div className="flex flex-col items-start gap-3.5">
              <h2 className="text-[12px] font-bold text-white/50">{t('site.footer.legal')}</h2>
              <p className={textCls}>{t('site.footer.privacy')}</p>
              <p className={textCls}>{t('site.footer.terms')}</p>
              <p className={textCls}>{t('site.footer.data')}</p>
            </div>
          </div>
        </div>
        <hr className="m-0 h-px border-0 bg-white/10" />
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-white/50">{t('site.footer.rights')}</p>
          <ul aria-label={t('site.footer.social')} className="flex flex-wrap gap-2.5">
            <li>
              {wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener"
                  className="block rounded-full border border-white/16 px-3 py-[7px] text-[12px] font-semibold text-white/75 hover:text-white"
                >
                  {t('site.footer.whatsapp')}
                </a>
              ) : (
                <span className="block rounded-full border border-white/16 px-3 py-[7px] text-[12px] font-semibold text-white/75">
                  {t('site.footer.whatsapp')}
                </span>
              )}
            </li>
            <li>
              <span className="block rounded-full border border-white/16 px-3 py-[7px] text-[12px] font-semibold text-white/75">
                {t('site.footer.linkedin')}
              </span>
            </li>
            <li>
              <span className="block rounded-full border border-white/16 px-3 py-[7px] text-[12px] font-semibold text-white/75">
                {t('site.footer.instagram')}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
