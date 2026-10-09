import type { StoredRentRule } from '../market/model';
import { fee } from './postings';

/**
 * Rent maths (BR-RNT-03, BR-RNT-06, BR-RNT-09, docs/08 §6, examples A, B, F, H, I). Pure functions:
 * the monthly invoice job, the C07/J07 reports and the golden tests all use them.
 */

/**
 * BR-RNT-09: a payment's gross fee spread evenly over the sessions of its paid period, in whole
 * piasters, the remainder piasters going to the earliest sessions (Example H: 6,112 + 8 × 6,111).
 * `sessionIds` must be in date order.
 */
export function spread(amountPt: number, sessionIds: string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (!sessionIds.length) return out;
  const each = Math.floor(amountPt / sessionIds.length);
  const rest = amountPt - each * sessionIds.length;
  sessionIds.forEach((id, i) => out.set(id, each + (i < rest ? 1 : 0)));
  return out;
}

export interface RentInputs {
  rule: StoredRentRule;
  /** Link's rent-fee rate (OD-01), snapshotted on the invoice. */
  feePct: string | number;
  /** Sessions that took place in the period (BR-RNT-04, BR-RNT-10). */
  heldSessions: number;
  /** Σ counted students over those sessions (per-student rule, OD-13). */
  studentSessions: number;
  /** % of fees: Σ fee shares of the held sessions (BR-RNT-09). */
  feesBasePt: number;
  /** Refunded shares earlier invoices already counted (≤ 0), plus the carry from the last invoice. */
  adjustmentPt: number;
}

export interface RentResult {
  feesBasePt: number;
  adjustmentPt: number;
  /** `min(0, base + adjustment)`: carried to the next invoice, or reversed with P12 (OD-43). */
  carriedPt: number;
  grossPt: number;
  linkFeePt: number;
  netToCentrePt: number;
}

/** One rent invoice (08 §6 steps 1–2). Rent is floored at 0; Link's fee is rounded down. */
export function rentInvoice(i: RentInputs): RentResult {
  let gross: number;
  let base = 0;
  let adjustment = 0;
  let carried = 0;
  if (i.rule.type === 'fixed_per_session') gross = i.rule.amountPt * i.heldSessions;
  else if (i.rule.type === 'per_student_per_session') gross = i.rule.amountPt * i.studentSessions;
  else {
    base = i.feesBasePt;
    adjustment = i.adjustmentPt;
    carried = Math.min(0, base + adjustment);
    gross = fee(Math.max(0, base + adjustment), i.rule.pct);
  }
  const linkFee = fee(gross, i.feePct);
  return {
    feesBasePt: base,
    adjustmentPt: adjustment,
    carriedPt: carried,
    grossPt: gross,
    linkFeePt: linkFee,
    netToCentrePt: gross - linkFee,
  };
}

/**
 * P12 amounts (Example I case 2): the rent share on refunded fees no later invoice can absorb.
 * rent = floor(pct × unabsorbed), Link fee = floor(rent × rate), centre share = the rest.
 */
export function rentReversal(a: {
  pct: string | number;
  feePct: string | number;
  unabsorbedPt: number;
}) {
  const rent = fee(a.unabsorbedPt, a.pct);
  const linkFee = fee(rent, a.feePct);
  return { rent, linkFee, centre: rent - linkFee };
}
