'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingState } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { useFlag } from '../../flags';
import { useCentre } from '../common';

/** `/{lang}/centre/{centreId}`: the centre's first page — Today, or Staff while Phase 2 is off. */
export function CentreHome() {
  const { t } = useI18n();
  const router = useRouter();
  const { base } = useCentre();
  const followUp = useFlag('followup.owner_nav');
  useEffect(() => {
    router.replace(`${base}/${followUp ? 'today' : 'staff'}`);
  }, [base, followUp, router]);
  return <LoadingState label={t('states.loading.label')} rows={3} />;
}
