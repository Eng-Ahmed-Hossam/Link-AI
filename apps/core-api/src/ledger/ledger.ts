import { sql } from 'kysely';
import type { Tx } from '../platform/db';
import { uuidv7 } from '../platform/ids';

/**
 * The double-entry ledger (docs/08, ADR-0002). Money is integer piasters. Every money event is ONE
 * transaction whose lines balance (INV-01, also checked by a deferred trigger at commit), keyed by
 * an idempotency key so a retried webhook or job never moves money twice (BR-MNY-04). Lines are
 * never edited: a correction is a new, reversing transaction. Balances are computed from the
 * entries every time and never cached (BR-MNY-10).
 */

type AccountType = 'asset' | 'liability' | 'revenue' | 'expense';
type OwnerType = 'link' | 'teacher' | 'centre' | 'provider';

/** The chart of accounts (08 §1). Accounts are created on first use. */
export const ACCOUNT = {
  providerClearing: (provider: string) => `provider_clearing:${provider}`,
  bank: 'bank:link',
  teacherPending: (teacherId: string) => `teacher_pending:${teacherId}`,
  teacherAvailable: (teacherId: string) => `teacher_available:${teacherId}`,
  centreAvailable: (centreId: string) => `centre_available:${centreId}`,
  payoutsInTransit: (provider: string) => `payouts_in_transit:${provider}`,
  refundsInTransit: (provider: string) => `refunds_in_transit:${provider}`,
  bookingCommission: 'link_revenue:booking_commission',
  rentFee: 'link_revenue:rent_fee',
  subscriptions: 'link_revenue:subscriptions',
  providerFees: 'link_expense:provider_fees',
  chargebackLosses: 'link_expense:chargeback_losses',
} as const;

/** Type and owner of an account, from its code. */
export function accountMeta(code: string): {
  type: AccountType;
  ownerType: OwnerType;
  ownerId: string | null;
} {
  const [head, owner] = code.split(':') as [string, string | undefined];
  switch (head) {
    case 'provider_clearing':
    case 'bank':
      return { type: 'asset', ownerType: head === 'bank' ? 'link' : 'provider', ownerId: null };
    case 'teacher_pending':
    case 'teacher_available':
      return { type: 'liability', ownerType: 'teacher', ownerId: owner ?? null };
    case 'centre_available':
      return { type: 'liability', ownerType: 'centre', ownerId: owner ?? null };
    case 'payouts_in_transit':
    case 'refunds_in_transit':
      return { type: 'liability', ownerType: 'provider', ownerId: null };
    case 'link_revenue':
      return { type: 'revenue', ownerType: 'link', ownerId: null };
    case 'link_expense':
      return { type: 'expense', ownerType: 'link', ownerId: null };
    default:
      throw new Error(`unknown ledger account ${code}`);
  }
}

/** One line: exactly one side is set, in whole piasters. */
export interface Line {
  account: string;
  debit?: number;
  credit?: number;
}

export type TransactionKind =
  | 'payment_captured'
  | 'funds_released'
  | 'rent_deduction'
  | 'rent_topup'
  | 'rent_reversal'
  | 'payout_initiated'
  | 'payout_settled'
  | 'payout_failed'
  | 'refund'
  | 'refund_confirmed'
  | 'refund_failed'
  | 'chargeback'
  | 'settlement'
  | 'adjustment';

export interface Posting {
  kind: TransactionKind;
  /** One effect per money event, e.g. `capture:fake:chk_…` (08 §2). */
  key: string;
  description: string;
  lines: Line[];
  paymentId?: string | null;
  refundId?: string | null;
  rentInvoiceId?: string | null;
  payoutId?: string | null;
  centreId?: string | null;
  teacherId?: string | null;
  reversesId?: string | null;
  createdBy?: string | null;
  occurredAt?: Date;
}

export class UnbalancedPosting extends Error {}

/** Lines with a zero amount are dropped; every amount must be a whole, non-negative piaster. */
export function checkLines(lines: Line[]): Line[] {
  const out = lines.filter((l) => (l.debit ?? 0) !== 0 || (l.credit ?? 0) !== 0);
  let d = 0;
  let c = 0;
  for (const l of out) {
    for (const v of [l.debit, l.credit])
      if (v !== undefined && (!Number.isSafeInteger(v) || v < 0))
        throw new UnbalancedPosting(
          `${l.account}: ${v} is not a whole, non-negative piaster amount`,
        );
    if (l.debit && l.credit) throw new UnbalancedPosting(`${l.account}: one side per line`);
    d += l.debit ?? 0;
    c += l.credit ?? 0;
  }
  if (d !== c || d === 0) throw new UnbalancedPosting(`debit ${d} ≠ credit ${c}`);
  return out;
}

/** The account's id, creating it on first use (08 §1). */
async function accountId(tx: Tx, code: string): Promise<string> {
  const found = await tx
    .selectFrom('ledger.ledger_accounts')
    .select('id')
    .where('code', '=', code)
    .executeTakeFirst();
  if (found) return found.id;
  const m = accountMeta(code);
  await tx
    .insertInto('ledger.ledger_accounts')
    .values({ id: uuidv7(), code, type: m.type, owner_type: m.ownerType, owner_id: m.ownerId })
    .onConflict((oc) => oc.column('code').doNothing())
    .execute();
  return (
    await tx
      .selectFrom('ledger.ledger_accounts')
      .select('id')
      .where('code', '=', code)
      .executeTakeFirstOrThrow()
  ).id;
}

/**
 * Post one balanced transaction, at most once per key. Returns `created: false` when the key was
 * already posted (a retried webhook or job): nothing moves the second time.
 */
export async function post(tx: Tx, p: Posting): Promise<{ id: string; created: boolean }> {
  const lines = checkLines(p.lines);
  const id = uuidv7();
  const inserted = await tx
    .insertInto('ledger.ledger_transactions')
    .values({
      id,
      kind: p.kind,
      idempotency_key: p.key,
      payment_id: p.paymentId ?? null,
      refund_id: p.refundId ?? null,
      rent_invoice_id: p.rentInvoiceId ?? null,
      payout_id: p.payoutId ?? null,
      centre_id: p.centreId ?? null,
      teacher_id: p.teacherId ?? null,
      reverses_id: p.reversesId ?? null,
      description: p.description,
      occurred_at: p.occurredAt ?? new Date(),
      created_by: p.createdBy ?? null,
    })
    .onConflict((oc) => oc.column('idempotency_key').doNothing())
    .returning('id')
    .executeTakeFirst();
  if (!inserted) {
    const prior = await tx
      .selectFrom('ledger.ledger_transactions')
      .select('id')
      .where('idempotency_key', '=', p.key)
      .executeTakeFirstOrThrow();
    return { id: prior.id, created: false };
  }
  const rows = [];
  for (const l of lines)
    rows.push({
      id: uuidv7(),
      transaction_id: id,
      account_id: await accountId(tx, l.account),
      debit_pt: String(l.debit ?? 0),
      credit_pt: String(l.credit ?? 0),
      payment_id: p.paymentId ?? null,
    });
  await tx.insertInto('ledger.ledger_entries').values(rows).execute();
  return { id, created: true };
}

/**
 * A correction: the exact mirror of an earlier transaction (debits become credits), posted as a
 * new transaction that names the one it reverses (P11, P7 "provider fails").
 */
export async function reverse(
  tx: Tx,
  originalKey: string,
  p: Omit<Posting, 'lines' | 'reversesId'>,
): Promise<{ id: string; created: boolean } | null> {
  const original = await tx
    .selectFrom('ledger.ledger_transactions')
    .select('id')
    .where('idempotency_key', '=', originalKey)
    .executeTakeFirst();
  if (!original) return null;
  const entries = await tx
    .selectFrom('ledger.ledger_entries as e')
    .innerJoin('ledger.ledger_accounts as a', 'a.id', 'e.account_id')
    .select(['a.code', 'e.debit_pt', 'e.credit_pt'])
    .where('e.transaction_id', '=', original.id)
    .execute();
  return post(tx, {
    ...p,
    reversesId: original.id,
    lines: entries.map((e) =>
      Number(e.debit_pt)
        ? { account: e.code, credit: Number(e.debit_pt) }
        : { account: e.code, debit: Number(e.credit_pt) },
    ),
  });
}

/** An account's balance on its normal side (08 §1), computed now from the entries. */
export async function balance(tx: Tx, code: string): Promise<number> {
  const { rows } = await sql<{ b: string }>`SELECT ledger.balance_of(${code}) AS b`.execute(tx);
  return Number(rows[0]?.b ?? 0);
}

/** Σ debit − Σ credit over every entry: always 0 (the trial balance, 08 §7 step 6). */
export async function trialBalance(tx: Tx): Promise<{ debit: number; credit: number }> {
  const r = await tx
    .selectFrom('ledger.ledger_entries')
    .select([
      sql<string>`coalesce(sum(debit_pt), 0)`.as('d'),
      sql<string>`coalesce(sum(credit_pt), 0)`.as('c'),
    ])
    .executeTakeFirstOrThrow();
  return { debit: Number(r.d), credit: Number(r.c) };
}
