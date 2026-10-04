import { DEMO_CONTROLS } from './api-mode';
import { useDemoState } from './demo';

/**
 * Phase 2 (follow-up) is off by default and renders nothing when off (plan §1.5). Until core-api
 * serves flags (E0-09), the only way to turn it on is the dev-only Demo controls switch, which
 * every app reads from the mock backend. `undefined` while that switch is still loading.
 */
export function usePhase2(): boolean | undefined {
  const demo = useDemoState();
  if (!DEMO_CONTROLS) return false;
  return demo ? demo.demo.phase2 : undefined;
}

/** Phase 1 marketplace (Rooms, Earnings, fees and seats). On unless the demo switch turns it off. */
export function useMarketplace(): boolean | undefined {
  const demo = useDemoState();
  if (!DEMO_CONTROLS) return true;
  return demo ? demo.demo.marketplace !== false : undefined;
}
