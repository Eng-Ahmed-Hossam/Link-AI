import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { WebArrow, webButtonClass } from '@link/ui';
import { getT, parseLocale } from '@/i18n';
import { PILOT } from '@/api-mode';
import { siteMetadata } from '@/site/meta';
import { SitePage } from '../SitePage';

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = parseLocale((await params).lang);
  return siteMetadata(lang, '/sign-in', getT(lang)('landing.signIn.title'));
}

/**
 * "Sign in (pilot centres)": until the hosted pilot (Stage 5), pilots are being set up, so this
 * points to the pilot request. Each pilot centre signs in on its own laptop for now.
 */
export default async function PilotSignInPage({ params }: Props) {
  const lang = parseLocale((await params).lang);
  if (PILOT) notFound();
  const t = getT(lang);
  return (
    <SitePage locale={lang} title={t('landing.signIn.title')} lead={t('landing.signIn.body')}>
      <div className="flex flex-col gap-3">
        <Link prefetch={false} href={`/${lang}/pilot`} className={webButtonClass('primary')}>
          {t('landing.signIn.cta')}
          <WebArrow />
        </Link>
        <Link prefetch={false} href={`/${lang}`} className={webButtonClass('outline')}>
          {t('landing.signIn.back')}
        </Link>
      </div>
    </SitePage>
  );
}
