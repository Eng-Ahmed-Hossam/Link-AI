// pnpm test:money — the R2b review's money fixes: rent held back from the Thursday payout (CF-54)
// and the local refund decisions that stand in for the ops console (OD-42, `pnpm ops:refunds`).
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoId } from '../../seeds/demo';
import { ACCOUNT, post } from '../../src/ledger/ledger';
import { approveRefundRequest, denyRefundRequest, refundRequests } from '../../src/ops/refunds';
import { uuidv7 } from '../../src/platform/ids';
import { type Api, Client, PHONES, startApi } from '../helpers';
import {
  type EnrolmentBody,
  NOUR_GROUP,
  checkout,
  code,
  completeOnProvider,
  groupOf,
  hold,
  newParent,
} from '../money-helpers';

let api: Api;
let teacher: Client;
let n = 0;
beforeAll(async () => {
  api = await startApi();
  teacher = new Client(api);
  await teacher.signIn(PHONES.teacher);
}, 120_000);
afterAll(() => api.close());

const SALMA = demoId('tch-salma');
interface Earnings {
  rentTotal: { amountPt: number };
  nextPayout: { on: string; amount: { amountPt: number }; heldForRent: { amountPt: number } };
}
const earnings = async () => (await teacher.call<Earnings>('GET', '/v1/teachers/me/earnings')).body;
/** Move money into or out of the teacher's available balance (a balanced adjustment, P11). */
const adjust = (pt: number) =>
  api.s.db.asSystem((t) =>
    post(t, {
      kind: 'adjustment',
      key: `test-adjust:${uuidv7()}`,
      description: 'test adjustment',
      lines:
        pt > 0
          ? [
              { account: ACCOUNT.bank, debit: pt },
              { account: ACCOUNT.teacherAvailable(SALMA), credit: pt },
            ]
          : [
              { account: ACCOUNT.teacherAvailable(SALMA), debit: -pt },
              { account: ACCOUNT.bank, credit: -pt },
            ],
    }),
  );

describe('Held for rent (CF-54, OD-12, 08 §3)', () => {
  it('CF-54: the Thursday payout never includes the rent the 1st’s invoice will take; J07 shows it as its own line', async () => {
    await adjust(5_000_000); // plenty available, so the whole rent is held back
    const e = await earnings();
    // This month's rent (every session still planned, not only those held so far) is held back…
    expect(e.rentTotal.amountPt).toBeGreaterThan(0);
    expect(e.nextPayout.heldForRent.amountPt).toBeGreaterThanOrEqual(e.rentTotal.amountPt);
    // …and one more piaster available is one more piaster paid out: the hold is a fixed amount.
    await adjust(12_345);
    const after = await earnings();
    expect(after.nextPayout.heldForRent).toEqual(e.nextPayout.heldForRent);
    expect(after.nextPayout.amount.amountPt - e.nextPayout.amount.amountPt).toBe(12_345);
    await adjust(-12_345);
    // Less available than the rent owed: everything is held, nothing is paid out.
    const payable = e.nextPayout.amount.amountPt + e.nextPayout.heldForRent.amountPt;
    await adjust(-(payable - 100));
    const short = await earnings();
    expect(short.nextPayout.amount.amountPt).toBe(0);
    expect(short.nextPayout.heldForRent.amountPt).toBe(100);
    await adjust(payable - 100 - 5_000_000);
  });
});

describe('Refund requests decided locally (OD-42, BR-REF-02, `pnpm ops:refunds`)', () => {
  /** A parent who paid for a month and cancelled before the first session: refund requested. */
  async function requestedRefund() {
    const { c, childId } = await newParent(api, `+2010${70_000_000 + ++n}`);
    const next = (await groupOf(c, NOUR_GROUP)).upcomingSessions[0]!;
    const h = await hold(c, { studentId: childId, firstSessionId: next.id, plan: 'single_month' });
    expect(h.status).toBe(201);
    const co = await checkout(c, h.body.id, 'card');
    await completeOnProvider(co.body.checkoutUrl!, 'succeeded');
    const x = await c.call<EnrolmentBody>('POST', `/v1/enrolments/${h.body.id}/cancel`, {});
    expect(x.body.refund).toMatchObject({ status: 'requested' });
    const { rows } = await sql<{
      id: string;
    }>`SELECT id FROM ledger.refunds WHERE enrolment_id = ${h.body.id}`.execute(api.db);
    return { c, enrolmentId: h.body.id, refundId: rows[0]!.id };
  }
  const p08 = (c: Client, id: string) => c.call<EnrolmentBody>('GET', `/v1/enrolments/${id}`);
  const postings = async (refundId: string) =>
    (
      await sql<{ kind: string; debit: string; credit: string; code: string }>`
        SELECT t.kind, le.debit_pt AS debit, le.credit_pt AS credit, a.code
        FROM ledger.ledger_transactions t JOIN ledger.ledger_entries le ON le.transaction_id = t.id
        JOIN ledger.ledger_accounts a ON a.id = le.account_id
        WHERE t.refund_id = ${refundId} ORDER BY t.occurred_at, a.code`.execute(api.db)
    ).rows;
  const audit = async (refundId: string) =>
    (
      await sql<{
        action: string;
        reason: string | null;
      }>`SELECT action, reason FROM audit.audit_events WHERE object_ref = ${refundId} ORDER BY occurred_at`.execute(
        api.db,
      )
    ).rows;

  it('OD-42: approve posts the reversing entries (P7), is audited, and the parent sees it on P08', async () => {
    const { c, enrolmentId, refundId } = await requestedRefund();
    expect((await refundRequests(api.s.db)).some((r) => r.id === refundId)).toBe(true);
    await approveRefundRequest(api.s.db, api.s.money, refundId);
    // Before release: commission 2,750 and the teacher's pending 52,250 come back; 55,000 leaves.
    const p7 = (await postings(refundId)).filter((x) => x.kind === 'refund');
    expect(p7).toEqual([
      { kind: 'refund', debit: '2750', credit: '0', code: ACCOUNT.bookingCommission },
      { kind: 'refund', debit: '0', credit: '55000', code: 'refunds_in_transit:fake' },
      { kind: 'refund', debit: '52250', credit: '0', code: ACCOUNT.teacherPending(SALMA) },
    ]);
    expect((await audit(refundId)).map((a) => a.action)).toContain('refund.approved');
    // fake-pay sends it and confirms with a signed webhook; P08 shows the result.
    let e = (await p08(c, enrolmentId)).body;
    for (let i = 0; i < 40 && e.refund?.status !== 'succeeded'; i++) {
      await new Promise((r) => setTimeout(r, 100));
      e = (await p08(c, enrolmentId)).body;
    }
    expect(e.refund).toMatchObject({ status: 'succeeded', amount: { amountPt: 55_000 } });
    // Deciding twice is refused.
    await expect(approveRefundRequest(api.s.db, api.s.money, refundId)).rejects.toMatchObject({
      code: 'already_decided',
    });
  });

  it('OD-42: deny needs a reason, posts nothing, is audited, and P08 shows "not approved"', async () => {
    const { c, enrolmentId, refundId } = await requestedRefund();
    await expect(denyRefundRequest(api.s.db, refundId, '  ')).rejects.toMatchObject({
      code: 'reason_required',
    });
    await denyRefundRequest(api.s.db, refundId, 'Sample: outside the refund policy');
    expect(await postings(refundId)).toEqual([]);
    const a = await audit(refundId);
    expect(a.map((x) => x.action)).toEqual(['refund.rejected']);
    expect(a[0]!.reason).toContain('outside the refund policy');
    expect((await p08(c, enrolmentId)).body.refund).toMatchObject({ status: 'rejected' });
    expect((await refundRequests(api.s.db)).some((r) => r.id === refundId)).toBe(false);
    const again = await approveRefundRequest(api.s.db, api.s.money, refundId).catch((e) => e);
    expect(code({ body: again })).toBe('already_decided');
  });
});
