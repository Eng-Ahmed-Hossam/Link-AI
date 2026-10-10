import { sql } from 'kysely';
import { normalizeEgyptPhone } from '@link/i18n';
import { writeAudit } from '../platform/audit';
import type { FieldCipher } from '../platform/crypto';
import { type Database, type Tx, isOwnerOf } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import { enqueue } from '../platform/outbox';
import { Problem, forbidden, notFound } from '../platform/problem';
import { cairoToday, isoWeekday } from '../platform/time';
import { ACCOUNT, balance, post } from './ledger';
import type { Reports } from './reports';

/**
 * Payouts being sent (ship job S3; BR-OUT-01…08, 08 §8, P6, MKT-OPS-11, MKT-TCH-03, MKT-CEN-05).
 *
 * Until a payout provider is chosen (S4) the provider is `manual`: every Thursday the worker makes
 * a batch — one payout per payee with money to pay (BR-OUT-05) — posting P6 "initiated" (the money
 * leaves the payee's available balance for `payouts_in_transit:manual`). Ops finance download the
 * batch as a CSV, make the bank or InstaPay transfers, and mark each payout settled (P6 settled:
 * Link's bank pays it) or failed (P6 failed: the money goes back to available, BR-OUT-06). A
 * failed payout is retried as the same payout with the same idempotency key (MKT-OPS-11 AC2).
 *
 * Who is paid (BR-OUT-03): a verified payout account, and a verified teacher (eKYC) or centre.
 * The amount is the "next payout" the payee already sees: for a teacher, available less the rent
 * held back and less released money the provider has not settled (CF-54, BR-OUT-02).
 *
 * Every write is SYSTEM (the money paths), after the caller's role was checked; every step is
 * audited; account numbers are encrypted with the field key and shown masked (last 4).
 */
const PROVIDER = 'manual' as const;
type PayeeType = 'teacher' | 'centre';
type Lang = 'ar' | 'en';
const money = (amountPt: number) => ({ amountPt, currency: 'EGP' as const });
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
const egp = (pt: number) => (pt / 100).toFixed(2);

/** The Thursday (Cairo) of a run on or before `day`: a late run still belongs to its week. */
export function payoutWeek(day = cairoToday()): string {
  const d = new Date(`${day}T00:00:00Z`);
  const back = (isoWeekday(day) - 4 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** An Egyptian IBAN (EG + 27 digits) or a mobile wallet / InstaPay number; null = not valid. */
export function normaliseAccount(kind: 'bank' | 'wallet', raw: string): string | null {
  if (kind === 'wallet') {
    const n = normalizeEgyptPhone(raw);
    return n ? `+20${n}` : null;
  }
  const iban = raw
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .replace(/\s|-/g, '')
    .toUpperCase();
  if (!/^EG\d{27}$/.test(iban)) return null;
  // ISO 13616 check digits (mod 97).
  const moved = `${iban.slice(4)}${iban.slice(0, 4)}`.replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55),
  );
  let rem = 0;
  for (const ch of moved) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1 ? iban : null;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  // Spreadsheet formula injection: a leading = + - @ is made literal.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export class Payouts {
  constructor(
    private readonly db: Database,
    private readonly cipher: FieldCipher,
    private readonly reports: Reports,
  ) {}

  // ── The payee: payout account and history ───────────────────────────────────────
  /** Who the caller pays out as: their teacher profile, or a centre they own. */
  private payee(userId: string, type: PayeeType, centreId?: string) {
    return this.db.asUser(userId, async (_tx, ctx) => {
      if (type === 'teacher') {
        if (!ctx.teacherId) throw forbidden('Teachers only.');
        return ctx.teacherId;
      }
      if (!centreId || !ctx.centreIds.includes(centreId)) throw notFound('centre');
      if (!isOwnerOf(ctx, centreId)) throw forbidden('Only the owner manages payouts.');
      return centreId;
    });
  }

  private async accountView(sys: Tx, type: PayeeType, ownerId: string) {
    const a = await sys
      .selectFrom('ledger.payout_accounts')
      .select(['id', 'kind', 'display_last4', 'status', 'holder_name_encrypted', 'created_at'])
      .where('owner_type', '=', type)
      .where('owner_id', '=', ownerId)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    if (!a || a.status === 'replaced') return null;
    return {
      kind: a.kind as 'bank' | 'wallet',
      last4: a.display_last4,
      holderName: a.holder_name_encrypted ? this.cipher.decrypt(a.holder_name_encrypted) : null,
      status: a.status as 'pending_verification' | 'verified' | 'failed',
      addedAt: iso(a.created_at)!,
    };
  }

  async getAccount(userId: string, type: PayeeType, centreId?: string) {
    const ownerId = await this.payee(userId, type, centreId);
    return this.db.asSystem(async (sys) => ({
      account: await this.accountView(sys, type, ownerId),
    }));
  }

  /** Replace the payout account (re-verified by ops finance before any payout, BR-OUT-03). */
  async putAccount(
    userId: string,
    type: PayeeType,
    b: { kind: 'bank' | 'wallet'; number: string; holderName: string },
    centreId?: string,
    requestId?: string,
  ) {
    const ownerId = await this.payee(userId, type, centreId);
    const number = normaliseAccount(b.kind, b.number);
    if (!number)
      throw new Problem(
        422,
        b.kind === 'bank' ? 'invalid_iban' : 'invalid_wallet',
        b.kind === 'bank'
          ? 'Enter the full IBAN (EG and 27 digits).'
          : 'Enter the wallet’s Egyptian mobile number.',
      );
    return this.db.asSystem(async (sys) => {
      const replaced = await sys
        .updateTable('ledger.payout_accounts')
        .set({ status: 'replaced' })
        .where('owner_type', '=', type)
        .where('owner_id', '=', ownerId)
        .where('status', '<>', 'replaced')
        .returning('id')
        .execute();
      const id = uuidv7();
      await sys
        .insertInto('ledger.payout_accounts')
        .values({
          id,
          owner_type: type,
          owner_id: ownerId,
          kind: b.kind,
          details_encrypted: this.cipher.encrypt(number),
          holder_name_encrypted: this.cipher.encrypt(b.holderName.trim()),
          display_last4: number.slice(-4),
          status: 'pending_verification',
        })
        .execute();
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: type === 'centre' ? ownerId : null,
        action: 'payout_account.replaced',
        objectType: 'payout_account',
        objectRef: id,
        before: replaced.length ? { replaced: replaced.map((r) => r.id) } : null,
        after: { kind: b.kind, status: 'pending_verification' },
        requestId,
      });
      return { account: await this.accountView(sys, type, ownerId) };
    });
  }

  /** The payee's payout history (MKT-LED-05, MKT-LED-08), newest first. */
  async history(userId: string, type: PayeeType, centreId?: string) {
    const ownerId = await this.payee(userId, type, centreId);
    return this.db.asSystem(async (sys) => {
      const rows = await sys
        .selectFrom('ledger.payouts as p')
        .innerJoin('ledger.payout_accounts as a', 'a.id', 'p.payout_account_id')
        .select([
          'p.id',
          sql<string>`p.period_start::text`.as('week'),
          'p.amount_pt',
          'p.status',
          'p.failure_reason',
          'p.settled_at',
          'a.kind',
          'a.display_last4',
        ])
        .where('p.payee_type', '=', type)
        .where('p.payee_id', '=', ownerId)
        .orderBy('p.period_start', 'desc')
        .limit(52)
        .execute();
      return rows.map((r) => ({
        id: r.id,
        on: r.week,
        amount: money(Number(r.amount_pt)),
        status: r.status as 'initiated' | 'settled' | 'failed',
        account: `•••• ${r.display_last4}`,
        kind: r.kind as 'bank' | 'wallet',
        settledAt: iso(r.settled_at),
        failureReason: r.failure_reason,
      }));
    });
  }

  // ── The weekly run (worker job, Thursday; or ops finance "Run now") ──────────────
  /**
   * Make this week's batch: one payout per payee with a positive amount (BR-OUT-05, safe to run
   * twice). Each payee in its own transaction, under an advisory lock, so a release or a refund
   * at the same moment never makes the amount wrong.
   */
  async runWeek(day = cairoToday(), createdBy: string | null = null) {
    const week = payoutWeek(day);
    const batchId = await this.db.asSystem(async (sys) => {
      await sys
        .insertInto('ledger.payout_batches')
        .values({ id: uuidv7(), run_on: week, provider: PROVIDER, created_by: createdBy })
        .onConflict((oc) => oc.column('run_on').doNothing())
        .execute();
      return (
        await sys
          .selectFrom('ledger.payout_batches')
          .select('id')
          .where('run_on', '=', sql<Date>`${week}::date`)
          .executeTakeFirstOrThrow()
      ).id;
    });
    const payees = await this.db.asSystem(async (sys) => {
      const { rows } = await sql<{ type: PayeeType; id: string; account_id: string }>`
        SELECT 'teacher' AS type, t.id, a.id AS account_id FROM org.teachers t
        JOIN ledger.payout_accounts a ON a.owner_type = 'teacher' AND a.owner_id = t.id AND a.status = 'verified'
        WHERE t.verification = 'verified'
        UNION ALL
        SELECT 'centre', c.id, a.id FROM org.centres c
        JOIN ledger.payout_accounts a ON a.owner_type = 'centre' AND a.owner_id = c.id AND a.status = 'verified'
        WHERE c.verification = 'verified' AND c.archived_at IS NULL`.execute(sys);
      return rows;
    });
    let count = 0;
    let totalPt = 0;
    for (const p of payees) {
      const made = await this.db.asSystem(async (sys) => {
        await sql`SELECT pg_advisory_xact_lock(hashtext(${`payout:${p.type}:${p.id}`}))`.execute(
          sys,
        );
        const exists = await sys
          .selectFrom('ledger.payouts')
          .select('id')
          .where('payee_type', '=', p.type)
          .where('payee_id', '=', p.id)
          .where('period_start', '=', sql<Date>`${week}::date`)
          .executeTakeFirst();
        if (exists) return 0;
        const amount = await this.payable(sys, p.type, p.id);
        if (amount <= 0) return 0;
        const id = uuidv7();
        const key = `payout:${p.type}:${p.id}:${week}`;
        await sys
          .insertInto('ledger.payouts')
          .values({
            id,
            batch_id: batchId,
            payee_type: p.type,
            payee_id: p.id,
            period_start: week,
            amount_pt: String(amount),
            payout_account_id: p.account_id,
            provider: PROVIDER,
            idempotency_key: key,
          })
          .execute();
        await this.postP6(sys, 'initiated', { id, payeeType: p.type, payeeId: p.id, amount }, 1);
        await enqueue(sys, {
          type: 'payout.initiated',
          aggregateType: 'payout',
          aggregateId: id,
          centreId: p.type === 'centre' ? p.id : null,
          data: { payoutId: id, payeeType: p.type, payeeId: p.id, amountPt: amount },
        });
        return amount;
      });
      if (made > 0) {
        count++;
        totalPt += made;
      }
    }
    return { batchId, week, count, totalPt };
  }

  /** What can be paid now: the same "next payout" J07 and C07 show (CF-54, BR-OUT-02). */
  private async payable(sys: Tx, type: PayeeType, id: string) {
    if (type === 'teacher') return (await this.reports.teacherBalances(sys, id)).nextPayout;
    return Math.max(0, await balance(sys, ACCOUNT.centreAvailable(id)));
  }

  /** P6 (08): initiated, settled or failed, once per attempt (the key names the attempt). */
  private postP6(
    sys: Tx,
    step: 'initiated' | 'settled' | 'failed',
    p: { id: string; payeeType: PayeeType; payeeId: string; amount: number },
    attempt: number,
  ) {
    const payeeAccount =
      p.payeeType === 'teacher'
        ? ACCOUNT.teacherAvailable(p.payeeId)
        : ACCOUNT.centreAvailable(p.payeeId);
    const transit = ACCOUNT.payoutsInTransit(PROVIDER);
    const lines =
      step === 'initiated'
        ? [
            { account: payeeAccount, debit: p.amount },
            { account: transit, credit: p.amount },
          ]
        : step === 'settled'
          ? [
              { account: transit, debit: p.amount },
              { account: ACCOUNT.bank, credit: p.amount },
            ]
          : [
              { account: transit, debit: p.amount },
              { account: payeeAccount, credit: p.amount },
            ];
    return post(sys, {
      kind: `payout_${step}`,
      key: `payout:${p.id}:${attempt}:${step}`,
      description: `Payout ${step} (${PROVIDER})`,
      lines,
      payoutId: p.id,
      centreId: p.payeeType === 'centre' ? p.payeeId : null,
      teacherId: p.payeeType === 'teacher' ? p.payeeId : null,
    });
  }

  // ── Ops finance (MKT-OPS-11) ────────────────────────────────────────────────────
  private async payeeName(sys: Tx, type: PayeeType, id: string) {
    const r =
      type === 'teacher'
        ? await sys
            .selectFrom('org.teachers')
            .select('display_name as name')
            .where('id', '=', id)
            .executeTakeFirst()
        : await sys
            .selectFrom('org.centres')
            .select('name')
            .where('id', '=', id)
            .executeTakeFirst();
    return r?.name ?? '';
  }

  batches() {
    return this.db.asSystem(async (sys) => {
      const { rows } = await sql<{
        id: string;
        run_on: string;
        status: string;
        exported_at: Date | null;
        n: number;
        initiated: number;
        settled: number;
        failed: number;
        total_pt: string;
      }>`
        SELECT b.id, b.run_on::text, b.status, b.exported_at,
          count(p.id)::int AS n,
          count(p.id) FILTER (WHERE p.status = 'initiated')::int AS initiated,
          count(p.id) FILTER (WHERE p.status = 'settled')::int AS settled,
          count(p.id) FILTER (WHERE p.status = 'failed')::int AS failed,
          coalesce(sum(p.amount_pt), 0) AS total_pt
        FROM ledger.payout_batches b LEFT JOIN ledger.payouts p ON p.batch_id = b.id
        GROUP BY b.id ORDER BY b.run_on DESC LIMIT 26`.execute(sys);
      return rows.map((r) => ({
        id: r.id,
        runOn: r.run_on,
        status: r.status as 'open' | 'exported' | 'closed',
        exportedAt: iso(r.exported_at),
        payouts: r.n,
        initiated: r.initiated,
        settled: r.settled,
        failed: r.failed,
        total: money(Number(r.total_pt)),
      }));
    });
  }

  payouts(status?: string) {
    return this.db.asSystem(async (sys) => {
      let q = sys
        .selectFrom('ledger.payouts as p')
        .innerJoin('ledger.payout_batches as b', 'b.id', 'p.batch_id')
        .innerJoin('ledger.payout_accounts as a', 'a.id', 'p.payout_account_id')
        .select([
          'p.id',
          'p.payee_type',
          'p.payee_id',
          'p.amount_pt',
          'p.status',
          'p.attempts',
          'p.failure_reason',
          'p.provider_ref',
          'p.settled_at',
          'p.failed_at',
          'p.created_at',
          sql<string>`b.run_on::text`.as('week'),
          'a.kind',
          'a.display_last4',
        ])
        .orderBy('b.run_on', 'desc')
        .orderBy('p.created_at')
        .limit(500);
      if (status && status !== 'all') q = q.where('p.status', '=', status);
      const rows = await q.execute();
      const out = [];
      for (const r of rows)
        out.push({
          id: r.id,
          payeeType: r.payee_type as PayeeType,
          payeeName: await this.payeeName(sys, r.payee_type as PayeeType, r.payee_id),
          week: r.week,
          amount: money(Number(r.amount_pt)),
          status: r.status as 'initiated' | 'settled' | 'failed',
          attempts: r.attempts,
          account: `•••• ${r.display_last4}`,
          kind: r.kind as 'bank' | 'wallet',
          reference: r.provider_ref,
          failureReason: r.failure_reason,
          settledAt: iso(r.settled_at),
          failedAt: iso(r.failed_at),
        });
      return out;
    });
  }

  /**
   * The batch as a CSV for the bank or InstaPay (the only place full account numbers leave the
   * database). Audited; the batch is marked exported.
   */
  exportBatch(opsUserId: string, batchId: string, requestId?: string) {
    return this.db.asSystem(async (sys) => {
      const b = await sys
        .selectFrom('ledger.payout_batches')
        .select(['id', sql<string>`run_on::text`.as('week'), 'status'])
        .where('id', '=', batchId)
        .executeTakeFirst();
      if (!b) throw notFound('payout batch');
      const rows = await sys
        .selectFrom('ledger.payouts as p')
        .innerJoin('ledger.payout_accounts as a', 'a.id', 'p.payout_account_id')
        .select([
          'p.id',
          'p.payee_type',
          'p.payee_id',
          'p.amount_pt',
          'a.kind',
          'a.details_encrypted',
          'a.holder_name_encrypted',
        ])
        .where('p.batch_id', '=', batchId)
        .where('p.status', '=', 'initiated')
        .orderBy('p.created_at')
        .execute();
      const week = b.week;
      const lines = [
        ['reference', 'payee_type', 'payee', 'account_holder', 'kind', 'account', 'amount_egp'],
      ];
      for (const r of rows)
        lines.push([
          `LINK-${week.replace(/-/g, '')}-${r.id.slice(-8)}`,
          r.payee_type,
          await this.payeeName(sys, r.payee_type as PayeeType, r.payee_id),
          r.holder_name_encrypted ? this.cipher.decrypt(r.holder_name_encrypted) : '',
          r.kind === 'bank' ? 'bank (IBAN)' : 'wallet / InstaPay',
          r.details_encrypted ? this.cipher.decrypt(r.details_encrypted) : '(sample: none)',
          egp(Number(r.amount_pt)),
        ]);
      await sys
        .updateTable('ledger.payout_batches')
        .set({ status: 'exported', exported_at: new Date() })
        .where('id', '=', batchId)
        .execute();
      await writeAudit(sys, {
        actorId: opsUserId,
        actorType: 'user',
        action: 'payout_batch.exported',
        objectType: 'payout_batch',
        objectRef: batchId,
        after: { payouts: rows.length },
        requestId,
      });
      return {
        filename: `link-payouts-${week}.csv`,
        csv: `${lines.map((l) => l.map(csvCell).join(',')).join('\n')}\n`,
        payouts: rows.length,
      };
    });
  }

  private async locked(sys: Tx, id: string) {
    const p = await sys
      .selectFrom('ledger.payouts')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    if (!p) throw notFound('payout');
    return p;
  }

  /** The transfer went through: P6 settled (Link's bank pays it). */
  settle(opsUserId: string, id: string, reference: string | undefined, requestId?: string) {
    return this.db.asSystem(async (sys) => {
      const p = await this.locked(sys, id);
      if (p.status !== 'initiated')
        throw new Problem(409, 'already_decided', `This payout is already ${p.status}.`);
      await sys
        .updateTable('ledger.payouts')
        .set({ status: 'settled', settled_at: new Date(), provider_ref: reference ?? null })
        .where('id', '=', id)
        .execute();
      const amount = Number(p.amount_pt);
      await this.postP6(
        sys,
        'settled',
        { id, payeeType: p.payee_type as PayeeType, payeeId: p.payee_id, amount },
        p.attempts,
      );
      await this.closeIfDone(sys, p.batch_id);
      await writeAudit(sys, {
        actorId: opsUserId,
        actorType: 'user',
        centreId: p.payee_type === 'centre' ? p.payee_id : null,
        action: 'payout.settled',
        objectType: 'payout',
        objectRef: id,
        before: { status: 'initiated' },
        after: { status: 'settled', amountPt: amount },
        reason: reference ?? null,
        requestId,
      });
      await enqueue(sys, {
        type: 'payout.settled',
        aggregateType: 'payout',
        aggregateId: id,
        centreId: p.payee_type === 'centre' ? p.payee_id : null,
        data: { payoutId: id, amountPt: amount },
        requestId,
      });
      return { ok: true as const };
    });
  }

  /**
   * The transfer bounced: P6 failed (the money is available again) and the payee's account is
   * marked failed, so they are asked to fix it (BR-OUT-06).
   */
  fail(opsUserId: string, id: string, reason: string, requestId?: string) {
    return this.db.asSystem(async (sys) => {
      const p = await this.locked(sys, id);
      if (p.status !== 'initiated')
        throw new Problem(409, 'already_decided', `This payout is already ${p.status}.`);
      await sys
        .updateTable('ledger.payouts')
        .set({ status: 'failed', failed_at: new Date(), failure_reason: reason })
        .where('id', '=', id)
        .execute();
      await sys
        .updateTable('ledger.payout_accounts')
        .set({ status: 'failed' })
        .where('id', '=', p.payout_account_id)
        .where('status', '=', 'verified')
        .execute();
      const amount = Number(p.amount_pt);
      await this.postP6(
        sys,
        'failed',
        { id, payeeType: p.payee_type as PayeeType, payeeId: p.payee_id, amount },
        p.attempts,
      );
      await this.closeIfDone(sys, p.batch_id);
      await writeAudit(sys, {
        actorId: opsUserId,
        actorType: 'user',
        centreId: p.payee_type === 'centre' ? p.payee_id : null,
        action: 'payout.failed',
        objectType: 'payout',
        objectRef: id,
        before: { status: 'initiated' },
        after: { status: 'failed' },
        reason,
        requestId,
      });
      await enqueue(sys, {
        type: 'payout.failed',
        aggregateType: 'payout',
        aggregateId: id,
        centreId: p.payee_type === 'centre' ? p.payee_id : null,
        data: { payoutId: id, payeeType: p.payee_type, payeeId: p.payee_id },
        requestId,
      });
      return { ok: true as const };
    });
  }

  /**
   * MKT-OPS-11 AC2: retry a failed payout once the payee has a verified account again — the same
   * payout and idempotency key, a new attempt; never a second payout for the period (BR-OUT-05).
   */
  retry(opsUserId: string, id: string, requestId?: string) {
    return this.db.asSystem(async (sys) => {
      const p = await this.locked(sys, id);
      if (p.status !== 'failed')
        throw new Problem(409, 'not_failed', 'Only a failed payout can be retried.');
      const account = await sys
        .selectFrom('ledger.payout_accounts')
        .select('id')
        .where('owner_type', '=', p.payee_type)
        .where('owner_id', '=', p.payee_id)
        .where('status', '=', 'verified')
        .executeTakeFirst();
      if (!account)
        throw new Problem(
          409,
          'account_not_verified',
          'The payee has no verified payout account yet: they fix it, then ops verify it.',
        );
      const amount = Number(p.amount_pt);
      const type = p.payee_type as PayeeType;
      const available = await balance(
        sys,
        type === 'teacher'
          ? ACCOUNT.teacherAvailable(p.payee_id)
          : ACCOUNT.centreAvailable(p.payee_id),
      );
      if (available < amount)
        throw new Problem(
          409,
          'insufficient_balance',
          'The payee’s available balance no longer covers this payout.',
        );
      const attempt = p.attempts + 1;
      await sys
        .updateTable('ledger.payouts')
        .set({
          status: 'initiated',
          attempts: attempt,
          payout_account_id: account.id,
          failed_at: null,
          failure_reason: null,
        })
        .where('id', '=', id)
        .execute();
      await sys
        .updateTable('ledger.payout_batches')
        .set({ status: 'open' })
        .where('id', '=', p.batch_id)
        .execute();
      await this.postP6(
        sys,
        'initiated',
        { id, payeeType: type, payeeId: p.payee_id, amount },
        attempt,
      );
      await writeAudit(sys, {
        actorId: opsUserId,
        actorType: 'user',
        centreId: type === 'centre' ? p.payee_id : null,
        action: 'payout.retried',
        objectType: 'payout',
        objectRef: id,
        after: { attempt },
        requestId,
      });
      return { ok: true as const };
    });
  }

  private async closeIfDone(sys: Tx, batchId: string) {
    const open = await sys
      .selectFrom('ledger.payouts')
      .select('id')
      .where('batch_id', '=', batchId)
      .where('status', '=', 'initiated')
      .executeTakeFirst();
    if (!open)
      await sys
        .updateTable('ledger.payout_batches')
        .set({ status: 'closed' })
        .where('id', '=', batchId)
        .execute();
  }

  // ── Payout accounts waiting for ops finance (BR-OUT-03) ─────────────────────────
  accountsToVerify(lang: Lang) {
    void lang;
    return this.db.asSystem(async (sys) => {
      const rows = await sys
        .selectFrom('ledger.payout_accounts')
        .select([
          'id',
          'owner_type',
          'owner_id',
          'kind',
          'display_last4',
          'holder_name_encrypted',
          'created_at',
        ])
        .where('status', '=', 'pending_verification')
        .orderBy('created_at')
        .limit(200)
        .execute();
      const out = [];
      for (const r of rows)
        out.push({
          id: r.id,
          payeeType: r.owner_type as PayeeType,
          payeeName: await this.payeeName(sys, r.owner_type as PayeeType, r.owner_id),
          kind: r.kind as 'bank' | 'wallet',
          last4: r.display_last4,
          holderName: r.holder_name_encrypted ? this.cipher.decrypt(r.holder_name_encrypted) : null,
          addedAt: iso(r.created_at)!,
        });
      return out;
    });
  }

  decideAccount(
    opsUserId: string,
    id: string,
    decision: 'verify' | 'reject',
    reason: string | undefined,
    requestId?: string,
  ) {
    return this.db.asSystem(async (sys) => {
      const a = await sys
        .selectFrom('ledger.payout_accounts')
        .select(['id', 'status', 'owner_type', 'owner_id'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!a) throw notFound('payout account');
      if (a.status !== 'pending_verification')
        throw new Problem(409, 'already_decided', `This account is already ${a.status}.`);
      const status = decision === 'verify' ? 'verified' : 'failed';
      await sys
        .updateTable('ledger.payout_accounts')
        .set({ status, verified_at: decision === 'verify' ? new Date() : null })
        .where('id', '=', id)
        .execute();
      await writeAudit(sys, {
        actorId: opsUserId,
        actorType: 'user',
        centreId: a.owner_type === 'centre' ? a.owner_id : null,
        action: `payout_account.${status}`,
        objectType: 'payout_account',
        objectRef: id,
        before: { status: 'pending_verification' },
        after: { status },
        reason: reason ?? null,
        requestId,
      });
      return { ok: true as const };
    });
  }
}
