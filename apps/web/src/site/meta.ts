import type { Metadata } from 'next';
import type { Locale } from '@link/i18n';
import { getT } from '../i18n';

/** The public address, for canonical links and social cards (Vercel sets it in Stage 3). */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

/**
 * Page metadata for the website, in the page's language: title, description, canonical and
 * hreflang alternates, Open Graph and the X/Twitter card (images: public/og/*, pnpm og:images).
 */
export function siteMetadata(locale: Locale, path = '', title?: string): Metadata {
  const t = getT(locale);
  const full = title ? `${title} · ${t('common.appName')}` : t('landing.meta.title');
  const description = t('landing.meta.description');
  const image = {
    url: `/og/landing-${locale}.png`,
    width: 1200,
    height: 630,
    alt: t('landing.meta.title'),
  };
  return {
    metadataBase: new URL(SITE_URL),
    title: full,
    description,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: { ar: `/ar${path}`, en: `/en${path}`, 'x-default': `/ar${path}` },
    },
    openGraph: {
      type: 'website',
      siteName: t('common.appName'),
      title: full,
      description,
      url: `/${locale}${path}`,
      locale: locale === 'ar' ? 'ar_EG' : 'en_GB',
      alternateLocale: locale === 'ar' ? ['en_GB'] : ['ar_EG'],
      images: [image],
    },
    twitter: { card: 'summary_large_image', title: full, description, images: [image.url] },
    robots: { index: true, follow: true },
  };
}
