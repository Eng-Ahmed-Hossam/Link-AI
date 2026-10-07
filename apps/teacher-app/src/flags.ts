import { useQuery } from '@tanstack/react-query';
import { pilotApi } from '@link/api-client';
import { teacherTryOn, useDemoState } from '@/demo';
import { DEMO_CONTROLS, PILOT } from './api-mode';

/**
 * Phase 2 (follow-up) is off by default and renders nothing when off (plan §1.5). Until core-api
 * serves flags (E0-09), the only way to turn it on is the dev-only Demo controls switch, which
 * every app reads from the mock backend. `undefined` while that switch is still loading.
 */
export function usePhase2(): boolean | undefined {
  const demo = useDemoState();
  if (PILOT) return true; // the concierge pilot is the follow-up loop
  if (teacherTryOn()) return true; // "Try Link with your centre" shows the follow-up product
  if (!DEMO_CONTROLS) return false;
  return demo ? demo.demo.phase2 : undefined;
}

/** Phase 1 marketplace (Rooms, Earnings, fees and seats). On unless the demo switch turns it off. */
export function useMarketplace(): boolean | undefined {
  const demo = useDemoState();
  if (PILOT) return false;
  if (teacherTryOn()) return false;
  if (!DEMO_CONTROLS) return true;
  return demo ? demo.demo.marketplace !== false : undefined;
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
