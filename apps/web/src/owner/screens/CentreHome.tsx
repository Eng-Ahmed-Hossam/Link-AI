'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingState } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { useFlag } from '../../flags';
import { useCentre } from '../common';

/**
 * `/{lang}/centre/{centreId}`: one home per role — the Room schedule (with a Follow-up "Today" card
 * when the centre has the extra). The pilot has no marketplace: Today, or Staff while Phase 2 is off.
 */
export function CentreHome() {
  const { t } = useI18n();
  const router = useRouter();
  const { base } = useCentre();
  const followUp = useFlag('followup.owner_nav');
  const marketplace = useFlag('marketplace.enabled');
  useEffect(() => {
    router.replace(`${base}/${marketplace ? 'schedule' : followUp ? 'today' : 'staff'}`);
  }, [base, followUp, marketplace, router]);
  return <LoadingState label={t('states.loading.label')} rows={3} />;
}
