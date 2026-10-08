/**
 * Owner workspace paths. Every owner page lives under `/{lang}/centre/{centreId}/…`; a link that
 * leaves the centre id out (`/ar/centre/today`) is sent to the centre entry with `?next=`, which
 * signs the person in and lands them on that page of *their* centre (proxy.ts, CentreSignIn).
 */
export const CENTRE_SECTIONS = [
  'today',
  'follow-ups',
  'students',
  'sessions',
  'communication',
  'messages',
  'rules',
  'activity',
  'staff',
  'profile',
  'schedule',
  'reviews',
  'rooms',
  'requests',
  'rent-income',
  'followup-extra',
] as const;

/** The Follow-up paid extra's pages (OD-58): without the extra they lead to "What's included". */
export const FOLLOWUP_SECTIONS = new Set<string>([
  'today',
  'follow-ups',
  'students',
  'sessions',
  'communication',
  'messages',
  'rules',
  'activity',
]);

const SECTIONS = new Set<string>(CENTRE_SECTIONS);

export const isCentreSection = (segment: string | undefined) => !!segment && SECTIONS.has(segment);

/**
 * The `next` page after sign-in, kept only when it is a path inside the centre workspace
 * (`/today`, `/follow-ups/case-110`); anything else (another site, `//host`, `..`) is dropped.
 */
export function centreNext(next: string | null | undefined): string | null {
  if (!next || !/^\/[a-z-]+(\/[A-Za-z0-9_-]+)*$/.test(next)) return null;
  return isCentreSection(next.split('/')[1]) ? next : null;
}
