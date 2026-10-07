import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getT, parseLocale } from '@/i18n';
import { PILOT } from '@/api-mode';
import { TryForm } from '@/site/TryForm';
import { TRY_FORM_KEYS, pick } from '@/site/strings';
import { siteMetadata } from '@/site/meta';
import { SitePage } from '../SitePage';

type Props = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ centre?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = parseLocale((await params).lang);
  return siteMetadata(lang, '/try', getT(lang)('landing.try.title'));
}

/** Path A: try Link under your centre's name (demo in the browser; not in the pilot). */
export default async function TryPage({ params, searchParams }: Props) {
  const lang = parseLocale((await params).lang);
  if (PILOT) notFound();
  const t = getT(lang);
  const { centre } = await searchParams;
  return (
    <SitePage locale={lang} title={t('landing.try.title')} lead={t('landing.try.lead')}>
      <TryForm
        locale={lang}
        s={pick(t, TRY_FORM_KEYS)}
        centre={typeof centre === 'string' ? centre.slice(0, 60) : ''}
      />
    </SitePage>
  );
}
