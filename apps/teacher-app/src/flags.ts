import { useDemoState } from '@/demo';
import { DEMO_CONTROLS, PILOT } from './api-mode';

/**
 * Phase 2 (follow-up) is off by default and renders nothing when off (plan §1.5). Until core-api
 * serves flags (E0-09), the only way to turn it on is the dev-only Demo controls switch, which
 * every app reads from the mock backend. `undefined` while that switch is still loading.
 */
export function usePhase2(): boolean | undefined {
  const demo = useDemoState();
  if (PILOT) return true; // the concierge pilot is the follow-up loop
  if (!DEMO_CONTROLS) return false;
  return demo ? demo.demo.phase2 : undefined;
}

/** Phase 1 marketplace (Rooms, Earnings, fees and seats). On unless the demo switch turns it off. */
export function useMarketplace(): boolean | undefined {
  const demo = useDemoState();
  if (PILOT) return false;
  if (!DEMO_CONTROLS) return true;
  return demo ? demo.demo.marketplace !== false : undefined;
}

/**
 * Voice notes need real speech-to-text. The pilot shows "Type the note instead" until the local
 * speech-to-text service lands (Part B); demo and mock modes use the fixture pipeline.
 */
export const useVoiceNotes = () => !PILOT;
