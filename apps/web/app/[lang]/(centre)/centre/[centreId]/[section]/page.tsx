import { notFound } from 'next/navigation';
import { Card } from '@link/ui';
import { getT, parseLocale } from '@/i18n';

const SECTIONS = {
  profile: 'centre.nav.publicProfile',
  schedule: 'centre.nav.roomSchedule',
  reviews: 'centre.nav.reviews',
  rooms: 'centre.nav.roomsRequests',
  requests: 'centre.nav.roomsRequests',
  'rent-income': 'centre.nav.rentIncome',
  staff: 'centre.nav.staff',
} as const;

/** Placeholder for C02–C07 and A16 until Batch 2. */
export default async function CentreSectionPage({ params }: { params: Promise<{ lang: string; section: string }> }) {
  const { lang, section } = await params;
  if (!(section in SECTIONS)) notFound();
  const t = getT(parseLocale(lang));
  return (
    <Card padding="lg">
      <h2 className="text-title">{t(SECTIONS[section as keyof typeof SECTIONS])}</h2>
      <p className="mt-2 text-body text-muted">{t('centre.shell.placeholder')}</p>
    </Card>
  );
}
