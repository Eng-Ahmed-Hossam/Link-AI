/**
 * Tabs follow the flags (CF-29, decided):
 * - Phase 2 only (the MVP pilot): Today · My groups · Records
 * - Phase 1 only: My groups · Rooms · Earnings
 * - Both: Today · My groups · Rooms · Earnings — Records reached from My groups and Today
 * A flagged-off tab is not rendered at all (plan §1.5).
 */
export function tabsFor(phase2: boolean, marketplace: boolean): string[] {
  if (phase2 && marketplace) return ['today', 'groups', 'rooms', 'earnings'];
  if (phase2) return ['today', 'groups', 'records'];
  if (marketplace) return ['groups', 'rooms', 'earnings'];
  return ['groups'];
}
