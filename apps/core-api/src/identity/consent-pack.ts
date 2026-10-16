import type { Database } from '../platform/db';

/**
 * The consent pack (OD-60): the version label of each text people agree to. Every consent event
 * stores the label of the text the person saw (BR-DAT-03), so an approved text gets its own label
 * and a changed text can be asked again. Until the lawyer-reviewed pack is approved the labels are
 * drafts, and production refuses to start with a draft (no real data before approval, docs/13).
 *
 * Set the approved labels with CONSENT_VERSIONS, e.g. `terms=2026-11-v1,privacy=2026-11-v1,...`;
 * a kind not listed keeps its draft label. The texts: docs/legal/ (drafts for the lawyer).
 */
export const CONSENT_TEXTS = [
  'terms',
  'privacy',
  'child_data_processing',
  'share_phone_with_teacher',
  'whatsapp_updates',
  'sms_updates',
  'focus_plans',
  'ai_training_use',
  /** The guardian agrees that this child gets a student account (database v2, migration 0023). */
  'student_account',
  /** C01 "Link may contact me about joining" (stored on the lead). */
  'contact',
] as const;
export type ConsentText = (typeof CONSENT_TEXTS)[number];

const DRAFTS: Record<ConsentText, string> = {
  terms: 'draft-2026-10',
  privacy: 'draft-2026-10',
  child_data_processing: 'draft-2026-10',
  share_phone_with_teacher: 'draft-2026-10',
  whatsapp_updates: 'draft-2026-10',
  sms_updates: 'draft-2026-10',
  focus_plans: 'draft-2026-10',
  ai_training_use: 'draft-2026-10',
  student_account: 'draft-2026-10',
  contact: 'c01-draft-2026-10',
};

/** The texts real users meet in Phase 1 and the Follow-up extra: these must be approved. */
export const REQUIRED_FOR_PRODUCTION: ConsentText[] = [
  'terms',
  'privacy',
  'child_data_processing',
  'share_phone_with_teacher',
  'whatsapp_updates',
  'sms_updates',
  'contact',
];

export const isDraftVersion = (v: string) => /(^|-)draft(-|$)/i.test(v);

/** Parse CONSENT_VERSIONS; throws naming the bad entry (never a secret, these are labels). */
export function parseConsentVersions(raw = ''): Record<ConsentText, string> {
  const out = { ...DRAFTS };
  for (const part of raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)) {
    const [kind, label] = part.split('=').map((x) => x?.trim());
    if (!kind || !(CONSENT_TEXTS as readonly string[]).includes(kind))
      throw new Error(`CONSENT_VERSIONS: unknown text "${kind}" (${CONSENT_TEXTS.join(', ')}).`);
    if (!label || !/^[A-Za-z0-9._-]{1,40}$/.test(label))
      throw new Error(`CONSENT_VERSIONS: "${kind}" needs a label of 1–40 letters, digits, . _ -`);
    out[kind as ConsentText] = label;
  }
  return out;
}

let cached: { raw: string; versions: Record<ConsentText, string> } | null = null;
/** The current label of one text (from CONSENT_VERSIONS, else its draft). */
export function consentVersion(kind: ConsentText, env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.CONSENT_VERSIONS ?? '';
  if (!cached || cached.raw !== raw) cached = { raw, versions: parseConsentVersions(raw) };
  return cached.versions[kind];
}

/** For the production guard: the required texts still on a draft label. */
export function draftConsentTexts(env: NodeJS.ProcessEnv = process.env): ConsentText[] {
  const v = parseConsentVersions(env.CONSENT_VERSIONS ?? '');
  return REQUIRED_FOR_PRODUCTION.filter((k) => isDraftVersion(v[k]));
}

/**
 * The register of consent texts (org.consent_versions, migration 0022): every label this pack
 * uses is listed, with whether it is approved (a draft label is not). Run at API start-up; a
 * label already registered is kept as it is (ops may have recorded its text hash).
 */
export async function registerConsentVersions(
  db: Pick<Database, 'system'>,
  env: NodeJS.ProcessEnv = process.env,
) {
  const versions = parseConsentVersions(env.CONSENT_VERSIONS ?? '');
  const rows = CONSENT_TEXTS.map((kind) => ({
    kind,
    version: versions[kind],
    approved: !isDraftVersion(versions[kind]),
  }));
  await db.system
    .insertInto('org.consent_versions')
    .values(rows)
    .onConflict((oc) => oc.columns(['kind', 'version']).doNothing())
    .execute();
}
