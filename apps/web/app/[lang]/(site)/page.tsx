import { existsSync } from 'node:fs';
import { join } from 'node:path';
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

/** The video slot stays hidden until the promo file is added (public/landing/promo.mp4). */
const promo = () =>
  existsSync(join(process.cwd(), 'public', 'landing', 'promo.mp4')) ? '/landing/promo.mp4' : null;

/** `/{lang}`: the landing page; in the pilot, the centre workspace (the only app it serves). */
export default async function LandingPage({ params }: Props) {
  const lang = parseLocale((await params).lang);
  if (PILOT) redirect(`/${lang}/centre`);
  return (
    <div className="bg-navy">
      <SiteHeader locale={lang} home />
      <Landing locale={lang} video={promo()} />
    </div>
  );
}
