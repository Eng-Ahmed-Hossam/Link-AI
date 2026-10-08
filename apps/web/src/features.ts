'use client';

import { useQuery } from '@tanstack/react-query';
import { marketApi } from '@link/api-client';
import { PILOT } from './api-mode';
import { useSession } from './session';

/**
 * Follow-up is a paid extra per centre (OD-58, `followupExtra`; on for the demo centre). When it is
 * off, every Follow-up item disappears. The concierge pilot is the follow-up product, so it is on.
 * `undefined` while loading.
 */
export function useFollowupExtra(centreId: string | undefined): boolean | undefined {
  const { session } = useSession();
  const q = useQuery({
    queryKey: ['centre-features', centreId, session?.userId],
    queryFn: () => marketApi.centreFeatures(centreId!),
    enabled: !!centreId && !!session && !PILOT,
    staleTime: 5_000,
  });
  if (PILOT) return true;
  if (q.isError) return false;
  return q.data?.followupExtra;
}
