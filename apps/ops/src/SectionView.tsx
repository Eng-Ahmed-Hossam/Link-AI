'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createTranslator, type Locale } from '@link/i18n';
import { Callout } from '@link/ui';
import { useOpsMe } from './OpsGate';
import { SECTIONS, type Section } from './sections';
import { CentresScreen } from './screens/Centres';
import { DataRequestsScreen } from './screens/DataRequests';
import { PayoutsScreen } from './screens/Payouts';
import { RefundsScreen } from './screens/Refunds';
import { ReviewsScreen } from './screens/Reviews';
import { TeachersScreen } from './screens/Teachers';

const SCREENS = {
  centres: CentresScreen,
  teachers: TeachersScreen,
  reviews: ReviewsScreen,
  refunds: RefundsScreen,
  payouts: PayoutsScreen,
  'data-requests': DataRequestsScreen,
};

/** A section opens only with its permission; the API refuses it anyway (MKT-OPS-08). */
export function SectionView({ locale, section }: { locale: Locale; section: Section }) {
  const me = useOpsMe();
  const t = createTranslator(locale);
  const router = useRouter();
  const allowed = me.permissions.includes(SECTIONS[section]);
  // The first section this user may open (finance lands on refunds, not on centres).
  const first = (Object.keys(SECTIONS) as Section[]).find((s) =>
    me.permissions.includes(SECTIONS[s]),
  );
  useEffect(() => {
    if (!allowed && first) router.replace(`/${locale}/${first}`);
  }, [allowed, first, router, locale]);
  if (!allowed)
    return (
      <Callout tone="warning" role="alert">
        {t('ops.gate.noPermission')}
      </Callout>
    );
  const Screen = SCREENS[section];
  return <Screen locale={locale} />;
}
