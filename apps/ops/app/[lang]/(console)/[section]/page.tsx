import { notFound } from 'next/navigation';
import { Card } from '@link/ui';
import { getT, parseLocale } from '@/i18n';

const SECTIONS = { centres: 'ops.nav.centres', reviews: 'ops.nav.reviews', refunds: 'ops.nav.refunds' } as const;

/** Placeholder for L01–L03 until Batch 4. */
export default async function OpsSectionPage({ params }: { params: Promise<{ lang: string; section: string }> }) {
  const { lang, section } = await params;
  if (!(section in SECTIONS)) notFound();
  const t = getT(parseLocale(lang));
  return (
    <Card padding="lg">
      <h1 className="text-title">{t(SECTIONS[section as keyof typeof SECTIONS])}</h1>
      <p className="mt-2 text-body text-muted">{t('ops.shell.placeholder')}</p>
    </Card>
  );
}
