import { notFound } from 'next/navigation';
import { parseLocale } from '@/i18n';
import { SectionView } from '@/SectionView';
import { SECTIONS, type Section } from '@/sections';

/** L01 centres, teachers, L02 reviews, L03 refunds, PDPL data requests. */
export default async function OpsSectionPage({
  params,
}: {
  params: Promise<{ lang: string; section: string }>;
}) {
  const { lang, section } = await params;
  if (!(section in SECTIONS)) notFound();
  return <SectionView locale={parseLocale(lang)} section={section as Section} />;
}
