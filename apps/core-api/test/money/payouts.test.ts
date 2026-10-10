// pnpm test:money — S3 payouts being sent (BR-OUT-01…08, P6, MKT-OPS-11): payout accounts, the
// weekly batch, the CSV for manual transfers, settle / fail / retry. Sample data only.
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_FINANCE_PHONE, demoId } from '../../seeds/demo';
import { normaliseAccount, payoutWeek } from '../../src/ledger/payouts';
import { ACCOUNT, balance, post } from '../../src/ledger/ledger';
import { uuidv7 } from '../../src/platform/ids';
import { type Api, Client, PHONES, startApi } from '../helpers';
import { trial } from '../money-helpers';

/** A sample Egyptian IBAN (29 characters) with valid check digits (ISO 13616), from 25 digits. */
function sampleIban(bban: string) {
  const digits = `${bban}141600`; // E = 14, G = 16, check 00
  let rem = 0;
  for (const ch of digits) rem = (rem * 10 + Number(ch)) % 97;
  return `EG${String(98 - rem).padStart(2, '0')}${bban}`;
}

let api: Api;
let teacher: Client;
let owner: Client;
let finance: Client;
const SALMA = demoId('tch-salma');
const NOUR = demoId('cen-nour');
beforeAll(async () => {
  api = await startApi();
  teacher = new Client(api);
  await teacher.signIn(PHONES.teacher);
  owner = new Client(api);
  await owner.signIn(PHONES.owner);
  finance = new Client(api, { web: true });
  await finance.signIn(OPS_FINANCE_PHONE);
}, 120_000);
afterAll(() => api.close());

const code = (r: { body: unknown }) => (r.body as { code?: string }).code;
const available = () => api.s.db.asSystem((t) => balance(t, ACCOUNT.teacherAvailable(SALMA)));
const p6 = async (payoutId: string) =>
  (
    await sql<{ kind: string; code: string; debit: string; credit: string }>`
      SELECT t.kind, a.code, le.debit_pt AS debit, le.credit_pt AS credit
      FROM ledger.ledger_transactions t JOIN ledger.ledger_entries le ON le.transaction_id = t.id
      JOIN ledger.ledger_accounts a ON a.id = le.account_id
      WHERE t.payout_id = ${payoutId} ORDER BY t.occurred_at, t.id, a.code`.execute(api.db)
  ).rows;

describe('payout accounts (MKT-TCH-03, MKT-CEN-05, BR-OUT-03)', () => {
  it('accounts: an IBAN with wrong check digits or a wrong wallet number is refused', () => {
    const good = sampleIban('0003000000000000000000001');
    expect(normaliseAccount('bank', good)).toBe(good);
    expect(normaliseAccount('bank', good.replace(/1$/, '2'))).toBeNull();
    expect(normaliseAccount('wallet', '01000000002')).toBe('+201000000002');
    expect(normaliseAccount('wallet', '0123')).toBeNull();
  });

  it('a new account replaces the old one and waits for ops finance; others cannot see it', async () => {
    const bad = await teacher.call('PUT', '/v1/me/payout-account', {
      kind: 'bank',
      number: 'EG00 1234',
      holderName: 'Salma Sample',
    });
    expect(code(bad)).toBe('invalid_iban');
    const r = await teacher.call<{ account: { status: string; last4: string } }>(
      'PUT',
      '/v1/me/payout-account',
      {
        kind: 'bank',
        number: sampleIban('0003000000000000000000001'),
        holderName: 'Salma Sample',
      },
    );
    expect(r.status).toBe(200);
    expect(r.body.account).toMatchObject({ status: 'pending_verification', last4: '0001' });
    // The centre owner's own account; another centre's is 404 (10 §2).
    expect((await owner.call('GET', `/v1/centres/${NOUR}/payout-account`)).status).toBe(200);
    expect(
      (await owner.call('GET', `/v1/centres/${demoId('cen-nile')}/payout-account`)).status,
    ).toBe(404);
    // Ops finance see it with the holder name and verify it.
    const queue = (
      await finance.call<{ id: string; payeeName: string; holderName: string }[]>(
        'GET',
        '/v1/ops/payout-accounts',
      )
    ).body;
    const mine = queue.find((a) => a.holderName === 'Salma Sample')!;
    expect(mine).toBeTruthy();
    expect(
      (await finance.call('POST', `/v1/ops/payout-accounts/${mine.id}/verify`, {})).status,
    ).toBe(200);
    expect(
      (await teacher.call<{ account: { status: string } }>('GET', '/v1/me/payout-account')).body
        .account!.status,
    ).toBe('verified');
  });
});

describe('the weekly batch (BR-OUT-01, -05, P6, MKT-OPS-11)', () => {
  let payoutId = '';
  let amount = 0;

  it('pays every eligible payee once per week; P6 initiated balances; a second run pays nothing', async () => {
    // Plenty available (a balanced sample adjustment, P11), so Ms Salma has something to be paid.
    await api.s.db.asSystem((t) =>
      post(t, {
        kind: 'adjustment',
        key: `test-adjust:${uuidv7()}`,
        description: 'test adjustment',
        lines: [
          { account: ACCOUNT.bank, debit: 5_000_000 },
          { account: ACCOUNT.teacherAvailable(SALMA), credit: 5_000_000 },
        ],
      }),
    );
    const before = await available();
    const run = await finance.call<{ count: number; week: string; batchId: string }>(
      'POST',
      '/v1/ops/payout-batches/run',
      {},
    );
    expect(run.status).toBe(200);
    expect(run.body.week).toBe(payoutWeek());
    expect(run.body.count).toBeGreaterThan(0);
    const again = await finance.call<{ count: number }>('POST', '/v1/ops/payout-batches/run', {});
    expect(again.body.count).toBe(0);
    type P = { id: string; payeeName: string; amount: { amountPt: number }; status: string }[];
    const list = (await finance.call<P>('GET', '/v1/ops/payouts')).body;
    const salma = list.find((p) => p.payeeName.includes('سلمى'))!;
    expect(salma.status).toBe('initiated');
    payoutId = salma.id;
    amount = salma.amount.amountPt;
    expect(await available()).toBe(before - amount);
    expect(await p6(payoutId)).toEqual([
      {
        kind: 'payout_initiated',
        code: ACCOUNT.payoutsInTransit('manual'),
        debit: '0',
        credit: String(amount),
      },
      {
        kind: 'payout_initiated',
        code: ACCOUNT.teacherAvailable(SALMA),
        debit: String(amount),
        credit: '0',
      },
    ]);
    const t = await trial(api);
    expect(t.debit).toBe(t.credit);
    // The teacher sees it in their history.
    const mine = await teacher.call<{ id: string; status: string }[]>('GET', '/v1/me/payouts');
    expect(mine.body.find((x) => x.id === payoutId)?.status).toBe('initiated');
  });

  it('the CSV carries the full IBAN and the amount; the export is audited', async () => {
    const b = (await finance.call<{ id: string }[]>('GET', '/v1/ops/payout-batches')).body[0]!;
    const x = await finance.call<{ csv: string; filename: string }>(
      'POST',
      `/v1/ops/payout-batches/${b.id}/export`,
      {},
    );
    expect(x.body.filename).toMatch(/^link-payouts-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(x.body.csv).toContain(sampleIban('0003000000000000000000001'));
    expect(x.body.csv).toContain((amount / 100).toFixed(2));
    const { rows } = await sql<{ n: number }>`SELECT count(*)::int AS n FROM audit.audit_events
      WHERE action = 'payout_batch.exported' AND object_ref = ${b.id}`.execute(api.db);
    expect(rows[0]!.n).toBe(1);
  });

  it('BR-OUT-06: a bounced transfer returns the money and asks the payee to fix the account; retry is the same payout', async () => {
    const before = await available();
    expect(
      (
        await finance.call('POST', `/v1/ops/payouts/${payoutId}/fail`, {
          reason: 'Sample: account closed',
        })
      ).status,
    ).toBe(200);
    expect(await available()).toBe(before + amount);
    expect(
      (await teacher.call<{ account: { status: string } }>('GET', '/v1/me/payout-account')).body
        .account!.status,
    ).toBe('failed');
    const early = await finance.call('POST', `/v1/ops/payouts/${payoutId}/retry`, {});
    expect(code(early)).toBe('account_not_verified');
    // The teacher adds a wallet; ops verify it; the retry pays the same payout again.
    await teacher.call('PUT', '/v1/me/payout-account', {
      kind: 'wallet',
      number: '01000000002',
      holderName: 'Salma Sample',
    });
    const acc = (
      await finance.call<{ id: string; kind: string }[]>('GET', '/v1/ops/payout-accounts')
    ).body.find((a) => a.kind === 'wallet')!;
    await finance.call('POST', `/v1/ops/payout-accounts/${acc.id}/verify`, {});
    expect((await finance.call('POST', `/v1/ops/payouts/${payoutId}/retry`, {})).status).toBe(200);
    expect(await available()).toBe(before);
    const settled = await finance.call('POST', `/v1/ops/payouts/${payoutId}/settle`, {
      reference: 'SAMPLE-INSTAPAY-1',
    });
    expect(settled.status).toBe(200);
    expect(code(await finance.call('POST', `/v1/ops/payouts/${payoutId}/settle`, {}))).toBe(
      'already_decided',
    );
    const kinds = (await p6(payoutId)).map((r) => r.kind);
    expect(kinds.filter((k) => k === 'payout_initiated')).toHaveLength(4); // two attempts × two lines
    expect(kinds.filter((k) => k === 'payout_failed')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'payout_settled')).toHaveLength(2);
    // One payout for the period, whatever happened (BR-OUT-05).
    const { rows } = await sql<{ n: number }>`SELECT count(*)::int AS n FROM ledger.payouts
      WHERE payee_type = 'teacher' AND payee_id = ${SALMA}`.execute(api.db);
    expect(rows[0]!.n).toBe(1);
    const t = await trial(api);
    expect(t.debit).toBe(t.credit);
  });

  it('MKT-OPS-08: only ops finance runs payouts', async () => {
    expect((await owner.call('POST', '/v1/ops/payout-batches/run', {})).status).toBe(403);
  });
});
