import { sql } from 'kysely';
import type { Tx } from '../platform/db';
import { Problem } from '../platform/problem';
import { cairoToday } from '../platform/time';

export interface FeeRule {
  id: string;
  ratePct: string;
  minPt: number | null;
}

/**
 * The fee rule in force on a date (BR-FEE-03): a rule for the specific teacher or centre beats the
 * global default of the same kind; `valid_from ≤ date < valid_to`. Read from commission_rules every
 * time, never hard-coded, and snapshotted on the payment or invoice that uses it (BR-MNY-11).
 */
export async function feeRule(
  tx: Tx,
  kind: 'rent_fee' | 'booking_commission',
  scope: { centreId?: string | null; teacherId?: string | null },
  on: string = cairoToday(),
): Promise<FeeRule> {
  const rows = await tx
    .selectFrom('ledger.commission_rules')
    .select(['id', 'rate_pct', 'min_amount_pt', 'centre_id', 'teacher_id'])
    .where('kind', '=', kind)
    .where(sql<boolean>`validity @> ${on}::date`)
    .execute();
  const specific = rows.find(
    (r) =>
      (scope.centreId && r.centre_id === scope.centreId) ||
      (scope.teacherId && r.teacher_id === scope.teacherId),
  );
  const rule = specific ?? rows.find((r) => !r.centre_id && !r.teacher_id);
  if (!rule) throw new Problem(500, 'no_commission_rule', `No ${kind} rule is in force on ${on}.`);
  return {
    id: rule.id,
    ratePct: String(rule.rate_pct),
    minPt: rule.min_amount_pt === null ? null : Number(rule.min_amount_pt),
  };
}
