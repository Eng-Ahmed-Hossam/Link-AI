import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { parseLocale } from '@/i18n';
import { PILOT } from '@/api-mode';
import { Landing } from '@/site/Landing';
import { SiteHeader } from '@/site/SiteHeader';
import { siteMetadata } from '@/site/meta';

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return siteMetadata(parseLocale((await params).lang));
}

/** `/{lang}`: the landing page (Figma 68:616); in the pilot, the centre workspace (its only app). */
export default async function LandingPage({ params }: Props) {
  const lang = parseLocale((await params).lang);
  if (PILOT) redirect(`/${lang}/centre`);
  return (
    <>
      <SiteHeader locale={lang} home />
      <Landing locale={lang} />
    </>
  );
}
