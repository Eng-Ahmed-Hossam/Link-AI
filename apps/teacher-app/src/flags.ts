import { useQuery } from '@tanstack/react-query';
import { api, marketApi, pilotApi } from '@link/api-client';
import { teacherTryOn, useDemoState } from '@/demo';
import { CORE_API, DEMO_CONTROLS, PILOT } from './api-mode';
import { useSession } from './session';

/** core-api (live mode): the flags for the signed-in teacher (E0-09). `undefined` while loading. */
function useServerFlags(): Record<string, boolean> | undefined {
  const { session } = useSession();
  const q = useQuery({
    queryKey: ['feature-flags', session?.userId],
    queryFn: api.featureFlags,
    enabled: CORE_API && !!session,
    staleTime: 30_000,
  });
  return q.data?.flags;
}

/**
 * Phase 2 (follow-up) is off by default and renders nothing when off (plan §1.5). Until core-api
 * serves flags (E0-09), the only way to turn it on is the dev-only Demo controls switch, which
 * every app reads from the mock backend. `undefined` while that switch is still loading.
 */
export function usePhase2(): boolean | undefined {
  const demo = useDemoState();
  const server = useServerFlags();
  if (PILOT) return true; // the concierge pilot is the follow-up loop
  if (CORE_API) return server ? server['followup.records'] === true : undefined;
  if (teacherTryOn()) return true; // "Try Link" shows the whole product (OD-58)
  if (!DEMO_CONTROLS) return false;
  return demo ? demo.demo.phase2 : undefined;
}

/** Phase 1 marketplace (Rooms, Earnings, fees and seats). On unless the demo switch turns it off. */
export function useMarketplace(): boolean | undefined {
  const demo = useDemoState();
  const server = useServerFlags();
  if (PILOT) return false;
  if (CORE_API) return server ? server['marketplace.enabled'] !== false : undefined;
  if (teacherTryOn()) return true;
  if (!DEMO_CONTROLS) return true;
  return demo ? demo.demo.marketplace !== false : undefined;
}

/**
 * Follow-up is a paid extra per centre (OD-58): the teacher sees it when a centre they work at has
 * it. The concierge pilot is the follow-up product. `undefined` while loading.
 */
export function useFollowupExtra(): boolean | undefined {
  const { session } = useSession();
  const q = useQuery({
    queryKey: ['teacher-features', session?.userId],
    queryFn: marketApi.teacherFeatures,
    enabled: !!session && !PILOT,
    staleTime: 5_000,
  });
  if (PILOT) return true;
  if (q.isError) return false;
  return q.data?.followupExtra;
}

/** The Follow-up tab and screens: Phase 2 on and the extra on. `undefined` while loading. */
export function useFollowup(): boolean | undefined {
  const phase2 = usePhase2();
  const extra = useFollowupExtra();
  if (phase2 === false || extra === false) return false;
  if (phase2 === undefined || extra === undefined) return undefined;
  return true;
}

/**
 * Voice notes. Demo and mock modes: on (the fixture pipeline, or local Whisper when the presenter
 * turns real speech-to-text on). Pilot: only for a teacher whose signed consent the owner recorded,
 * with voice switched on for the pilot (`/v1/me` says so); otherwise "Type the note instead".
 */
export function useVoiceNotes(): boolean {
  const me = useQuery({
    queryKey: ['pilot-me'],
    queryFn: pilotApi.me,
    enabled: PILOT,
    staleTime: 60_000,
  });
  if (!PILOT) return true;
  return me.data?.voiceNotes === true;
}
