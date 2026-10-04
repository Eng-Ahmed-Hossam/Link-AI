/**
 * Pilot mode (LINK_MODE=pilot, docs/13 "Concierge pilot"): the follow-up handlers the pilot server
 * mounts, and the checks it runs before it starts. Nothing here is used in demo mode.
 *
 * Mounted: teacher records, cases, messages (approve + "sent by hand"), owner pages, rules, activity.
 * Never mounted: `/__demo/*` and `/__mock/*`, the marketplace and sign-in mocks, Ask Link (its answers
 * are fixtures), the parent feed, seat checks and phone invites.
 */
import type { RequestHandler } from 'msw';
import * as mfx from './data';
import { followupHandlers } from './followup/handlers';
import { ownerHandlers } from './followup/owner-handlers';
import * as fx from './followup/data';
import type { WorldData } from './followup/world';

const pathOf = (h: RequestHandler) => String((h.info as { path?: unknown }).path ?? '');

/** Paths that must never answer in the pilot (checked at start-up and in tests). */
export const FORBIDDEN_IN_PILOT = [
  '/__demo',
  '/__mock',
  '/v1/assistant',
  '/v1/me/updates',
  '/v1/me/centre-groups',
  '/seat-check',
  '/staff/invites',
  '/v1/auth/otp',
];
const forbidden = (path: string) => FORBIDDEN_IN_PILOT.some((f) => path.includes(f));

export const pilotHandlers: RequestHandler[] = [...followupHandlers, ...ownerHandlers].filter(
  (h) => !forbidden(pathOf(h)),
);

/** Every route a handler list answers (for the start-up check). */
export const handlerPaths = (hs: RequestHandler[]) => hs.map(pathOf);

/** Ids that only the demo fixtures use: none may appear in pilot data. */
export function fixtureIds(): Set<string> {
  return new Set<string>([
    ...mfx.staff.map((u) => u.id),
    ...fx.roster.map((s) => s.id),
    ...fx.guardians.map((g) => g.id),
    fx.genericGuardian.id,
    fx.DEMO_GROUP_ID,
    fx.DEMO_CENTRE_ID,
    'usr-parent',
  ]);
}

/**
 * Start-up check (A1): the server refuses to start in pilot mode when any demo route, fixture
 * flag or demo user is present. Returns the problems found (empty = safe to start).
 */
export function pilotStartupProblems(input: {
  mode: string | undefined;
  handlers: RequestHandler[];
  world: WorldData | null;
  env: Record<string, string | undefined>;
}): string[] {
  const out: string[] = [];
  if (input.mode !== 'pilot') out.push(`LINK_MODE is "${input.mode ?? ''}", not "pilot".`);
  for (const p of handlerPaths(input.handlers))
    if (forbidden(p)) out.push(`Demo or mock route mounted: ${p}`);
  for (const k of [
    'DEMO_DEFAULT_FLAGS',
    'NEXT_PUBLIC_DEMO_CONTROLS',
    'EXPO_PUBLIC_DEMO_CONTROLS',
    'DEMO_CONTROLS',
  ])
    if (input.env[k]) out.push(`Demo setting present: ${k}`);
  if (input.world) {
    if (input.world.kind !== 'pilot') out.push('The stored world is the demo scenario.');
    const ids = fixtureIds();
    const used = [
      input.world.centre.id,
      ...input.world.users.map((u) => u.id),
      ...input.world.students.map((s) => s.id),
      ...input.world.guardians.map((g) => g.id),
      ...input.world.groups.map((g) => g.id),
    ].filter((id) => ids.has(id));
    for (const id of used) out.push(`Demo fixture or demo user present: ${id}`);
    if (input.world.guardians.some((g) => g.phone))
      out.push('A guardian phone number is stored (the pilot keeps none).');
  }
  return out;
}
