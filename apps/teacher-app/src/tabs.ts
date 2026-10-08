/**
 * Teacher tabs (2A.6; CF-29 and OD-58, decided):
 * - With the marketplace: My groups · Rooms · Earnings, plus Follow-up when a centre the teacher
 *   works at has the Follow-up extra (its home is the follow-up Today screen; Records are reached
 *   from it and from My groups)
 * - The concierge pilot (follow-up only, no marketplace): Today · My groups · Records
 * - Neither: My groups
 * A flagged-off tab is not rendered at all (plan §1.5).
 */
export function tabsFor(followup: boolean, marketplace: boolean): string[] {
  if (marketplace)
    return followup ? ['groups', 'rooms', 'earnings', 'today'] : ['groups', 'rooms', 'earnings'];
  if (followup) return ['today', 'groups', 'records'];
  return ['groups'];
}
