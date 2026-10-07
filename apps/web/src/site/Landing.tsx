import type { Locale } from '@link/i18n';
import { getT } from '../i18n';
import { whatsappUrl } from './contact';
import { heroAr, heroEn } from './fonts';
import { Faq, Join, Pricing } from './landing/Closing';
import { Hero } from './landing/Hero';
import { Features, Marketplace, TrustControl } from './landing/Platform';
import { ProductShowcase } from './landing/Product';
import { Heading, Icon, pad, wrap } from './landing/parts';
import { HowItWorks, Principles, Problem } from './landing/Story';

/**
 * The landing page: a copy of Figma frame 68:616 (desktop 1440), marketplace first with
 * Follow-up as a paid extra (PRODUCT_BRIEF, OD-48). Sections in Figma's order; on phones they
 * stack in the same order. The UI pictures are Figma's own renders (public/landing/figma).
 */
export function Landing({ locale }: { locale: Locale }) {
  const t = getT(locale);
  return (
    <div
      className="site-root"
      style={{ ['--site-heading' as string]: (locale === 'ar' ? heroAr : heroEn).style.fontFamily }}
    >
      <Hero locale={locale} />
      <Principles t={t} />
      <Problem t={t} />
      <HowItWorks t={t} locale={locale} />
      <section aria-labelledby="product-title" className={`site-lazy lp-product-bg ${pad}`}>
        <div className={`${wrap} flex flex-col items-center gap-10`}>
          <Heading
            id="product-title"
            eyebrow={t('site.product.eyebrow')}
            title={t('site.product.title')}
            lead={t('site.product.lead')}
            titleClass="max-w-[760px]"
            leadClass="max-w-[680px]"
          />
          <ProductShowcase
            icons={{
              rule: <Icon name="product-rules.svg" size={16} />,
              check: <Icon name="product-check.svg" size={16} />,
            }}
            w={{
              label: t('site.product.title'),
              tabOwner: t('site.product.tabOwner'),
              tabTeacher: t('site.product.tabTeacher'),
              tabParent: t('site.product.tabParent'),
              calloutRule: t('site.product.calloutRule'),
              calloutConfirm: t('site.product.calloutConfirm'),
              altOwner: t('site.product.altOwner'),
              altTeacher: t('site.product.altTeacher'),
              altParent: t('site.hero.altWhatsApp'),
            }}
          />
          <p className="text-[12px] font-medium text-muted">{t('site.product.note')}</p>
        </div>
      </section>
      <Features t={t} />
      <Marketplace t={t} />
      <TrustControl t={t} />
      <Pricing t={t} locale={locale} />
      <Faq t={t} />
      <Join t={t} locale={locale} whatsapp={whatsappUrl()} />
    </div>
  );
}
