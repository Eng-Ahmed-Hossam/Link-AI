import { ACCOUNT, type Line } from './ledger';

/**
 * The posting rules of docs/08 §2 as pure functions: amounts in, balanced lines out. The money
 * paths (webhooks, jobs, refunds) and the golden tests use the same builders, so a rule is written
 * once. Fees are computed by the caller with `fee()` (BR-FEE-04: exact, then rounded DOWN).
 */

/** BR-FEE-04 / BR-MNY-09: `floor(gross × rate_pct / 100)`, raised to `min` if set, never above gross. */
export function fee(grossPt: number, ratePct: string | number, minPt?: number | null): number {
  const basisPoints = Math.round(Number(ratePct) * 100);
  let f = Math.floor((grossPt * basisPoints) / 10_000);
  if (minPt) f = Math.max(f, minPt);
  return Math.min(f, grossPt);
}

/** P1 · Payment captured: Dr clearing / Cr commission + Cr teacher pending. */
export function p1Capture(a: {
  provider: string;
  teacherId: string;
  amount: number;
  commission: number;
}): Line[] {
  return [
    { account: ACCOUNT.providerClearing(a.provider), debit: a.amount },
    { account: ACCOUNT.bookingCommission, credit: a.commission },
    { account: ACCOUNT.teacherPending(a.teacherId), credit: a.amount - a.commission },
  ];
}

/** P2 · Funds released at the first session of the paid period (BR-REF-01). */
export function p2Release(a: { teacherId: string; amount: number }): Line[] {
  return [
    { account: ACCOUNT.teacherPending(a.teacherId), debit: a.amount },
    { account: ACCOUNT.teacherAvailable(a.teacherId), credit: a.amount },
  ];
}

/**
 * P3 · Rent deducted from the teacher's available balance: `min(gross, available)` (BR-RNT-05).
 * The fee share of a part is proportional; the last part takes the remainder (BR-RNT-06).
 */
export function p3RentDeduction(a: {
  teacherId: string;
  centreId: string;
  deducted: number;
  feeShare: number;
}): Line[] {
  return [
    { account: ACCOUNT.teacherAvailable(a.teacherId), debit: a.deducted },
    { account: ACCOUNT.centreAvailable(a.centreId), credit: a.deducted - a.feeShare },
    { account: ACCOUNT.rentFee, credit: a.feeShare },
  ];
}

/** P4 · Rent top-up paid by the teacher through Link (no booking commission on it). */
export function p4RentTopup(a: {
  provider: string;
  centreId: string;
  amount: number;
  feeShare: number;
}): Line[] {
  return [
    { account: ACCOUNT.providerClearing(a.provider), debit: a.amount },
    { account: ACCOUNT.centreAvailable(a.centreId), credit: a.amount - a.feeShare },
    { account: ACCOUNT.rentFee, credit: a.feeShare },
  ];
}

/** The fee share of one part of a rent invoice (BR-RNT-06, Example E). */
export function rentFeeShare(a: {
  gross: number;
  fee: number;
  part: number;
  feeAlreadyTaken: number;
  last: boolean;
}): number {
  if (a.last) return a.fee - a.feeAlreadyTaken;
  return a.gross ? Math.floor((a.part * a.fee) / a.gross) : 0;
}

/** P5 · Provider settlement: the provider's fee is Link's cost (OD-15). */
export function p5Settlement(a: { provider: string; amount: number; providerFee: number }): Line[] {
  return [
    { account: ACCOUNT.bank, debit: a.amount - a.providerFee },
    { account: ACCOUNT.providerFees, debit: a.providerFee },
    { account: ACCOUNT.providerClearing(a.provider), credit: a.amount },
  ];
}

/**
 * P7 / P8 · Refund approved. Before release the teacher's share comes back from pending (P7);
 * after release from available (P8). Commission kept = fee on the amount NOT refunded (BR-FEE-05).
 */
export function refundSplit(a: {
  paid: number;
  commission: number;
  ratePct: string | number;
  minPt?: number | null;
  alreadyRefunded: number;
  refund: number;
}): { commissionReversed: number; teacherShare: number } {
  const keptBefore = a.alreadyRefunded
    ? fee(a.paid - a.alreadyRefunded, a.ratePct, a.minPt)
    : a.commission;
  const remaining = a.paid - a.alreadyRefunded - a.refund;
  const keptAfter = remaining > 0 ? fee(remaining, a.ratePct, a.minPt) : 0;
  const commissionReversed = keptBefore - keptAfter;
  return { commissionReversed, teacherShare: a.refund - commissionReversed };
}

export function p7RefundApproved(a: {
  provider: string;
  teacherId: string;
  refund: number;
  commissionReversed: number;
  released: boolean;
}): Line[] {
  const teacher = a.released
    ? ACCOUNT.teacherAvailable(a.teacherId)
    : ACCOUNT.teacherPending(a.teacherId);
  return [
    { account: ACCOUNT.bookingCommission, debit: a.commissionReversed },
    { account: teacher, debit: a.refund - a.commissionReversed },
    { account: ACCOUNT.refundsInTransit(a.provider), credit: a.refund },
  ];
}

/** P7 · The provider confirms the refund: the money leaves the provider's clearing balance. */
export function p7RefundConfirmed(a: { provider: string; refund: number }): Line[] {
  return [
    { account: ACCOUNT.refundsInTransit(a.provider), debit: a.refund },
    { account: ACCOUNT.providerClearing(a.provider), credit: a.refund },
  ];
}

/** P12 · Rent reversal after the booking ended (BR-RNT-09, Example I case 2). */
export function p12RentReversal(a: {
  teacherId: string;
  centreId: string;
  rent: number;
  fee: number;
}): Line[] {
  return [
    { account: ACCOUNT.centreAvailable(a.centreId), debit: a.rent - a.fee },
    { account: ACCOUNT.rentFee, debit: a.fee },
    { account: ACCOUNT.teacherAvailable(a.teacherId), credit: a.rent },
  ];
}
