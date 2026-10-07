import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getT, parseLocale } from '@/i18n';
import { PILOT } from '@/api-mode';
import { PilotForm } from '@/site/PilotForm';
import { PILOT_FORM_KEYS, pick } from '@/site/strings';
import { siteMetadata } from '@/site/meta';
import { SitePage } from '../SitePage';

type Props = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ centre?: string; teachers?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = parseLocale((await params).lang);
  return siteMetadata(lang, '/pilot', getT(lang)('landing.form.title'));
}

/** Path B: request a free pilot (emailed to the Link team, ADR-0009). Pre-filled from the demo. */
export default async function PilotPage({ params, searchParams }: Props) {
  const lang = parseLocale((await params).lang);
  if (PILOT) notFound();
  const t = getT(lang);
  const { centre, teachers } = await searchParams;
  return (
    <SitePage locale={lang} title={t('landing.form.title')} lead={t('landing.join.lead')}>
      <PilotForm
        locale={lang}
        s={pick(t, PILOT_FORM_KEYS)}
        centre={typeof centre === 'string' ? centre.slice(0, 80) : ''}
        teachers={typeof teachers === 'string' ? teachers.replace(/\D/g, '').slice(0, 3) : ''}
      />
    </SitePage>
  );
}
