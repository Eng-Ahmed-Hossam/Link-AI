// pnpm test:money — S3 rent shortfall paid through Link (BR-RNT-05/06, OD-12, P4): when the
// month's rent is more than the teacher's balance on the 1st, the rest is due within 5 days and
// the teacher pays it by card, wallet or Fawry. Sample data only.
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoId } from '../../seeds/demo';
import { ACCOUNT, balance, post } from '../../src/ledger/ledger';
import { uuidv7 } from '../../src/platform/ids';
import { type Api, Client, PHONES, startApi } from '../helpers';
import { completeOnProvider, trial, until } from '../money-helpers';

let api: Api;
let teacher: Client;
const SALMA = demoId('tch-salma');
beforeAll(async () => {
  api = await startApi();
  teacher = new Client(api);
  await teacher.signIn(PHONES.teacher);
}, 120_000);
afterAll(() => api.close());

type Due = {
  id: string;
  rent: { amountPt: number };
  paid: { amountPt: number };
  due: { amountPt: number };
}[];
const code = (r: { body: unknown }) => (r.body as { code?: string }).code;

describe('S3 rent shortfall (BR-RNT-05/06, P4)', () => {
  let invoiceId = '';

  it('an empty balance on the 1st leaves the whole rent due; the teacher sees it', async () => {
    // Empty Ms Salma's available balance (a balanced sample adjustment, P11), then issue last
    // month's rent invoices: nothing can be deducted, so all of it is due.
    const avail = await api.s.db.asSystem((t) => balance(t, ACCOUNT.teacherAvailable(SALMA)));
    if (avail > 0)
      await api.s.db.asSystem((t) =>
        post(t, {
          kind: 'adjustment',
          key: `test-adjust:${uuidv7()}`,
          description: 'test adjustment',
          lines: [
            { account: ACCOUNT.teacherAvailable(SALMA), debit: avail },
            { account: ACCOUNT.bank, credit: avail },
          ],
        }),
      );
    await api.s.rent.issue();
    const due = (await teacher.call<Due>('GET', '/v1/teachers/me/rent-due')).body;
    expect(due.length).toBeGreaterThan(0);
    const inv = due[0]!;
    expect(inv.paid.amountPt).toBe(0);
    expect(inv.due.amountPt).toBe(inv.rent.amountPt);
    invoiceId = inv.id;
  });

  it('P4: paying by card credits the centre and the rest of Link’s fee; the invoice is paid', async () => {
    const co = await teacher.call<{ kind: string; checkoutUrl: string }>(
      'POST',
      `/v1/rent-invoices/${invoiceId}/checkout`,
      { method: 'card' },
    );
    expect(co.status).toBe(200);
    expect(co.body.kind).toBe('redirect');
    await completeOnProvider(co.body.checkoutUrl, 'succeeded');
    const inv = await until(
      async () =>
        (
          await sql<{ status: string; gross: string; fee: string; topup: string; centre: string }>`
            SELECT status, gross_amount_pt AS gross, link_fee_amount_pt AS fee,
              topup_paid_pt AS topup, centre_id AS centre
            FROM ledger.rent_invoices WHERE id = ${invoiceId}`.execute(api.db)
        ).rows[0]!,
      (r) => r.status === 'paid',
    );
    expect(Number(inv.topup)).toBe(Number(inv.gross));
    // Link's fee on this invoice, over every posting: exactly the invoice's fee (BR-RNT-06).
    const { rows } = await sql<{ fee: string; centre: string }>`
      SELECT
        sum(le.credit_pt - le.debit_pt) FILTER (WHERE a.code = ${ACCOUNT.rentFee}) AS fee,
        sum(le.credit_pt - le.debit_pt) FILTER (WHERE a.code LIKE 'centre_available:%') AS centre
      FROM ledger.ledger_transactions t JOIN ledger.ledger_entries le ON le.transaction_id = t.id
      JOIN ledger.ledger_accounts a ON a.id = le.account_id WHERE t.rent_invoice_id = ${invoiceId}`.execute(
      api.db,
    );
    expect(Number(rows[0]!.fee)).toBe(Number(inv.fee));
    expect(Number(rows[0]!.centre)).toBe(Number(inv.gross) - Number(inv.fee));
    const t = await trial(api);
    expect(t.debit).toBe(t.credit);
    const due = (await teacher.call<Due>('GET', '/v1/teachers/me/rent-due')).body;
    expect(due.some((d) => d.id === invoiceId)).toBe(false);
    expect(
      code(
        await teacher.call('POST', `/v1/rent-invoices/${invoiceId}/checkout`, { method: 'card' }),
      ),
    ).toBe('nothing_due');
  });

  it('another teacher’s invoice is not found; a parent cannot pay rent', async () => {
    const parent = new Client(api);
    await parent.signIn(PHONES.parent);
    expect(
      (await parent.call('POST', `/v1/rent-invoices/${invoiceId}/checkout`, { method: 'card' }))
        .status,
    ).toBe(404);
    expect((await parent.call('GET', '/v1/teachers/me/rent-due')).status).toBe(403);
  });
});
