import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getT, parseLocale } from '@/i18n';
import { PILOT } from '@/api-mode';
import { RoleChooser } from '@/site/RoleChooser';
import { ROLE_KEYS, pick } from '@/site/strings';
import { siteMetadata } from '@/site/meta';
import { SitePage } from '../SitePage';

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = parseLocale((await params).lang);
  return siteMetadata(lang, '/try', getT(lang)('site.try.title'));
}

/** `/{lang}/try`: the role chooser, the only way into the apps from the website (not in the pilot). */
export default async function TryPage({ params }: Props) {
  const lang = parseLocale((await params).lang);
  if (PILOT) notFound();
  const t = getT(lang);
  return (
    <SitePage locale={lang} title={t('site.try.title')} lead={t('site.try.lead')} wide>
      <RoleChooser locale={lang} s={pick(t, ROLE_KEYS)} />
    </SitePage>
  );
}
