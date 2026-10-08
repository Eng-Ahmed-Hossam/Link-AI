import type { Tx } from './db';

/**
 * Feature flags (E0-09, OD-58): `platform.feature_flags` rows per key and scope — `global`,
 * `centre` or `teacher`. A scoped row wins over the global one. Read per request, never cached
 * across requests, so a switch takes effect at once.
 */
export const FLAG = {
  marketplace: 'marketplace.enabled',
  /** The Follow-up paid extra, switched on per centre (OD-58). */
  followupExtra: 'followup.extra',
} as const;

export async function flagsFor(
  tx: Tx,
  scopes: { centreIds?: string[]; teacherId?: string | null },
) {
  const rows = await tx
    .selectFrom('platform.feature_flags')
    .select(['key', 'scope_type', 'scope_id', 'enabled'])
    .execute();
  const out: Record<string, boolean> = {};
  for (const r of rows) if (r.scope_type === 'global') out[r.key] = r.enabled;
  // Rows for the caller's own scopes win over the global row; with several (a teacher at two
  // centres), the flag is on when any of them is on.
  const scoped = new Map<string, boolean>();
  for (const r of rows) {
    const mine =
      (r.scope_type === 'centre' && scopes.centreIds?.includes(r.scope_id)) ||
      (r.scope_type === 'teacher' && r.scope_id === scopes.teacherId);
    if (mine) scoped.set(r.key, (scoped.get(r.key) ?? false) || r.enabled);
  }
  for (const [k, v] of scoped) out[k] = v;
  return out;
}

/** Is a flag on for one centre (centre row, else the global row)? */
export async function centreFlag(tx: Tx, key: string, centreId: string) {
  const rows = await tx
    .selectFrom('platform.feature_flags')
    .select(['scope_type', 'enabled'])
    .where('key', '=', key)
    .where((w) =>
      w.or([
        w('scope_type', '=', 'global'),
        w.and([w('scope_type', '=', 'centre'), w('scope_id', '=', centreId)]),
      ]),
    )
    .execute();
  return (
    (rows.find((r) => r.scope_type === 'centre') ?? rows.find((r) => r.scope_type === 'global'))
      ?.enabled ?? false
  );
}
