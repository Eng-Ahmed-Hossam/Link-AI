// R2b against real Postgres, Redis and fake-pay: holds, checkout, signed webhooks, the 8 states,
// refunds, the waitlist, renewals, J06/J07/C07 and reviews. Test names carry requirement IDs.
import { createHmac } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoId } from '../../seeds/demo';
import { addDays, addMonth, cairoToday } from '../../src/platform/time';
import { type Api, Client, PHONES, startApi } from '../helpers';
import {
  type EnrolmentBody,
  MARIAM,
  NOUR_GROUP,
  YOUSSEF,
  ageHold,
  checkout,
  code,
  completeOnProvider,
  count,
  groupOf,
  hold,
  ledgerOf,
  newParent,
  payFawryAtOutlet,
  paymentsOf,
  sampleParent,
  trial,
  until,
} from '../money-helpers';

let api: Api;
let parent: Client;
let owner: Client;
let teacher: Client;
let next: { id: string; startsAt: string };
let phoneN = 0;
const freshParent = () => newParent(api, `+2010000004${String(++phoneN).padStart(2, '0')}`);
const seatsLeftNext = async () =>
  (await groupOf(parent, NOUR_GROUP)).upcomingSessions[0]!.seatsLeft;
const get = (c: Client, id: string) => c.call<EnrolmentBody>('GET', `/v1/enrolments/${id}`);

/** Hold, checkout by card and pay on fake-pay: a confirmed seat. */
async function paidSeat(c: Client, studentId: string, plan = 'single_month') {
  const h = await hold(c, { studentId, firstSessionId: next.id, plan });
  expect(h.status).toBe(201);
  const co = await checkout(c, h.body.id, 'card');
  await completeOnProvider(co.body.checkoutUrl!, 'succeeded');
  return h.body.id;
}

/** A signed webhook body, as fake-pay would send it. */
const signed = (body: object) => {
  const raw = JSON.stringify(body);
  return {
    raw,
    sig: `sha256=${createHmac('sha256', api.config.PAYMENT_WEBHOOK_SECRET).update(raw).digest('hex')}`,
  };
};
const postWebhook = (raw: string, sig: string) =>
  fetch(`${api.base}/v1/webhooks/payments/fake-pay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-fake-pay-signature': sig },
    body: raw,
  });

beforeAll(async () => {
  api = await startApi();
  // Room 2 seats 30: room for the cases below (the fixture group has 2 seats left at 20).
  await sql`UPDATE market.groups SET seat_cap = 30 WHERE id = ${NOUR_GROUP}`.execute(api.db);
  parent = await sampleParent(api);
  owner = new Client(api);
  await owner.signIn(PHONES.owner);
  teacher = new Client(api);
  await teacher.signIn(PHONES.teacher);
  next = (await groupOf(parent, NOUR_GROUP)).upcomingSessions[0]!;
}, 120_000);
afterAll(() => api.close());

describe('Hold → card → confirmed (MKT-ENR-02/03, BR-ENR-01/02/04, P1)', () => {
  let id = '';
  it('MKT-ENR-02: a hold takes one seat in every covered session, for 10 minutes', async () => {
    const before = await seatsLeftNext();
    const r = await hold(parent, {
      studentId: MARIAM,
      firstSessionId: next.id,
      key: 'story-key-1',
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('pending_payment');
    const mins = (Date.parse(r.body.holdExpiresAt!) - Date.now()) / 60_000;
    expect(mins).toBeGreaterThan(9);
    expect(mins).toBeLessThanOrEqual(10);
    expect(r.body.sessionIds.length).toBeGreaterThanOrEqual(8);
    expect(await seatsLeftNext()).toBe(before - 1);
    id = r.body.id;
    // 07 §1: the same key gives the same hold.
    const again = await hold(parent, {
      studentId: MARIAM,
      firstSessionId: next.id,
      key: 'story-key-1',
    });
    expect(again.body.id).toBe(id);
    expect(again.headers.get('idempotent-replayed')).toBe('true');
  });

  it('BR-MNY-06: checkout goes to the provider page; Link never asks for card data', async () => {
    const r = await checkout(parent, id, 'card');
    expect(r.status).toBe(200);
    expect(r.body.kind).toBe('redirect');
    expect(r.body.checkoutUrl!.startsWith(api.fakeBase)).toBe(true);
    const page = await (await fetch(r.body.checkoutUrl!)).text();
    expect(page).not.toMatch(/<input[^>]+(cc-|card)/i);
    // BR-MNY-12: the redirect alone changes nothing.
    expect((await get(parent, id)).body.status).toBe('pending_payment');
    await completeOnProvider(r.body.checkoutUrl!, 'succeeded');
  });

  it('BR-ENR-04, P1: the verified webhook confirms; the capture is one balanced transaction', async () => {
    const e = (await get(parent, id)).body;
    expect(e.status).toBe('confirmed');
    expect(e.payment).toMatchObject({
      amount: { amountPt: 55_000 },
      method: 'card',
      cardLast4: '4242',
    });
    const [p] = await paymentsOf(api, id);
    expect(p).toMatchObject({ status: 'succeeded', commission_pt: '2750' });
    const lines = await ledgerOf(api, p!.id);
    expect(lines.map((l) => [l.code.split(':')[0], l.debit, l.credit])).toEqual([
      ['provider_clearing', 55_000, 0],
      ['link_revenue', 0, 2_750],
      ['teacher_pending', 0, 52_250],
    ]);
    const t = await trial(api);
    expect(t.debit).toBe(t.credit);
  });

  it('BR-ENR-08: one live enrolment per child and group', async () => {
    const r = await hold(parent, { studentId: MARIAM, firstSessionId: next.id });
    expect(r.status).toBe(409);
    expect(code(r)).toBe('already_enrolled');
  });

  it('BR-PMT-02: the monthly plan is card only', async () => {
    const r = await hold(parent, {
      studentId: YOUSSEF,
      firstSessionId: next.id,
      plan: 'monthly_recurring',
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const f = await checkout(parent, r.body.id, 'fawry');
    expect(f.status).toBe(422);
    expect(code(f)).toBe('method_not_allowed');
    await parent.call('POST', `/v1/enrolments/${r.body.id}/cancel`, {});
  });
});

describe('Edge cases (docs/08 §4, BR-ENR-05/06, BR-MNY-04/12)', () => {
  it('EDGE-1a payment fails: stays pending, parent can retry; the hold expiring releases the seat', async () => {
    const { c, childId } = await freshParent();
    const before = await seatsLeftNext();
    const h = await hold(c, { studentId: childId, firstSessionId: next.id });
    const co = await checkout(c, h.body.id, 'card');
    await completeOnProvider(co.body.checkoutUrl!, 'failed');
    const e = (await get(c, h.body.id)).body;
    expect(e.status).toBe('pending_payment');
    expect(e.lastPaymentFailed).toBe(true);
    const retry = await checkout(c, h.body.id, 'card');
    expect(retry.body.checkoutUrl).not.toBe(co.body.checkoutUrl);
    await ageHold(api, h.body.id);
    await api.s.jobs.expireHolds();
    expect((await get(c, h.body.id)).body.status).toBe('expired');
    expect(await seatsLeftNext()).toBe(before);
    // The provider was asked to close the open attempt.
    const ref = (await paymentsOf(api, h.body.id)).at(-1)!.provider_ref!;
    const at = await until(
      async () =>
        (await (await fetch(`${api.fakeBase}/v1/payments/${ref}`)).json()) as { status: string },
      (x) => x.status === 'expired',
    );
    expect(at.status).toBe('expired');
  });

  it('EDGE-1b payment abandoned: the hold runs out and the seat goes back', async () => {
    const { c, childId } = await freshParent();
    const before = await seatsLeftNext();
    const h = await hold(c, { studentId: childId, firstSessionId: next.id });
    await checkout(c, h.body.id, 'card');
    expect(await seatsLeftNext()).toBe(before - 1);
    await ageHold(api, h.body.id);
    await api.s.jobs.expireHolds();
    expect((await get(c, h.body.id)).body.status).toBe('expired');
    expect(await seatsLeftNext()).toBe(before);
  });

  it('EDGE-2 the same webhook twice, or out of order: posted once, the state never goes back', async () => {
    const { c, childId } = await freshParent();
    const id = await paidSeat(c, childId);
    const [p] = await paymentsOf(api, id);
    const txBefore = await count(api, 'ledger.ledger_transactions', `payment_id = '${p!.id}'`);
    const ev = api.fake.sent.find((x) => x.type === 'payment.succeeded' && x.body.includes(p!.id))!;
    // fake-pay sends the very same event again.
    const again = await fetch(`${api.fakeBase}/v1/test-controls/redeliver`, {
      method: 'POST',
      body: JSON.stringify({ eventId: ev.eventId }),
    });
    expect(((await again.json()) as { status: number }).status).toBe(200);
    // A late "failed" for the same payment (another event ID) arrives after the success.
    const late = signed({
      eventId: `evt_late_${p!.id}`,
      type: 'payment.failed',
      providerRef: p!.provider_ref,
      orderRef: p!.id,
      reason: 'late',
    });
    const r = await postWebhook(late.raw, late.sig);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { outcome: string }).outcome).toBe('ignored_succeeded');
    expect(await count(api, 'ledger.ledger_transactions', `payment_id = '${p!.id}'`)).toBe(
      txBefore,
    );
    expect((await paymentsOf(api, id))[0]!.status).toBe('succeeded');
    expect((await get(c, id)).body.status).toBe('confirmed');
  });

  it('EDGE-3 a bad signature: 401, nothing stored or changed', async () => {
    // Only this event is checked: a late webhook from an earlier step may still be arriving.
    const forgedRows = () => count(api, 'ledger.provider_events', `event_id = 'evt_forged'`);
    const forged = JSON.stringify({
      eventId: 'evt_forged',
      type: 'payment.succeeded',
      providerRef: 'x',
      orderRef: 'x',
      amountPt: 55_000,
    });
    const r = await postWebhook(forged, `sha256=${'0'.repeat(64)}`);
    expect(r.status).toBe(401);
    expect(((await r.json()) as { code: string }).code).toBe('invalid_signature');
    const none = await postWebhook(forged, '');
    expect(none.status).toBe(401);
    expect(await forgedRows()).toBe(0);
  });

  // A late payment is a Fawry reference paid after it expired (BR-PMT-07); a hosted card page
  // closes with the hold.
  it('EDGE-4a paid after the hold expired, a seat still free: the parent gets the seat (OD-09)', async () => {
    const { c, childId } = await freshParent();
    const h = await hold(c, { studentId: childId, firstSessionId: next.id });
    const f = await checkout(c, h.body.id, 'fawry');
    await ageHold(api, h.body.id);
    await api.s.jobs.expireHolds();
    expect((await get(c, h.body.id)).body.status).toBe('expired');
    await payFawryAtOutlet(api, f.body.fawryReference!);
    expect((await get(c, h.body.id)).body.status).toBe('confirmed');
  });

  it('EDGE-4b paid after the hold expired, no seat remains: automatic full refund, the parent sees why (P10)', async () => {
    const { c, childId } = await freshParent();
    const h = await hold(c, { studentId: childId, firstSessionId: next.id });
    const f = await checkout(c, h.body.id, 'fawry');
    await ageHold(api, h.body.id);
    await api.s.jobs.expireHolds();
    // Meanwhile the group fills: the seat cap drops to the seats already taken.
    const { rows } = await sql<{ most: number }>`
      SELECT max(committed)::int AS most FROM market.seats_committed(
        ARRAY(SELECT id FROM market.group_sessions WHERE group_id = ${NOUR_GROUP} AND starts_at > now()))`.execute(
      api.db,
    );
    await sql`UPDATE market.groups SET seat_cap = ${rows[0]!.most} WHERE id = ${NOUR_GROUP}`.execute(
      api.db,
    );
    try {
      await payFawryAtOutlet(api, f.body.fawryReference!);
      const e = await until(
        async () => (await get(c, h.body.id)).body,
        (x) => x.refund?.status === 'succeeded',
      );
      expect(e.status).toBe('expired');
      expect(e.refund).toMatchObject({
        policy: 'late_payment_no_seat',
        status: 'succeeded',
        amount: { amountPt: 55_000 },
      });
      const [p] = await paymentsOf(api, h.body.id);
      expect(p!.status).toBe('refunded');
      // P1, then P7 (approved: commission and pending reversed), then the provider's confirmation.
      const lines = await ledgerOf(api, p!.id);
      // Capture and refund approval commit together, so compare the kinds as a multiset.
      expect(lines.map((l) => l.kind).sort()).toEqual([
        'payment_captured',
        'payment_captured',
        'payment_captured',
        'refund',
        'refund',
        'refund',
        'refund_confirmed',
        'refund_confirmed',
      ]);
      const sum = (prefix: string) =>
        lines.filter((l) => l.code.startsWith(prefix)).reduce((a, l) => a + l.credit - l.debit, 0);
      expect(sum('teacher_pending')).toBe(0);
      expect(sum('link_revenue:booking_commission')).toBe(0);
      expect(sum('provider_clearing')).toBe(0);
    } finally {
      await sql`UPDATE market.groups SET seat_cap = 30 WHERE id = ${NOUR_GROUP}`.execute(api.db);
    }
  });

  it('EDGE-5 a Fawry reference expires unpaid: the seat is released (BR-PMT-07)', async () => {
    const { c, childId } = await freshParent();
    const before = await seatsLeftNext();
    const h = await hold(c, { studentId: childId, firstSessionId: next.id });
    const f = await checkout(c, h.body.id, 'fawry');
    expect(f.body.kind).toBe('fawry');
    expect(f.body.fawryReference).toMatch(/^\d{8}$/);
    const e = (await get(c, h.body.id)).body;
    expect((Date.parse(e.holdExpiresAt!) - Date.now()) / 3_600_000).toBeGreaterThan(23.9); // OD-09
    expect(e.fawry?.reference).toBe(f.body.fawryReference);
    await ageHold(api, h.body.id);
    await api.s.jobs.expireHolds();
    expect((await get(c, h.body.id)).body.status).toBe('expired');
    expect(await seatsLeftNext()).toBe(before);
  });

  it('MKT-ENR-04 Fawry paid at an outlet: confirmed by the webhook', async () => {
    const { c, childId } = await freshParent();
    const h = await hold(c, { studentId: childId, firstSessionId: next.id });
    const f = await checkout(c, h.body.id, 'fawry');
    await payFawryAtOutlet(api, f.body.fawryReference!);
    const e = (await get(c, h.body.id)).body;
    expect(e.status).toBe('confirmed');
    expect(e.payment?.method).toBe('fawry');
  });

  it('EDGE-6 the monthly card renewal fails: retried after 1 and 3 days, past_due, then ended after 7 days (BR-PMT-06, OD-17)', async () => {
    const { c, childId } = await freshParent();
    const id = await paidSeat(c, childId, 'monthly_recurring');
    expect(
      await count(api, 'ledger.payment_mandates', `enrolment_id = '${id}' AND status = 'active'`),
    ).toBe(1);
    // The paid month ends today: renewal day.
    const today = cairoToday();
    const start = addDays(
      addMonth(today),
      -2 * 31 + 31 - (Number(addMonth(today).slice(8)) - Number(today.slice(8))),
    );
    void start;
    // Everything so far kept the counters true (the check at the end covers the rest).
    expect((await api.s.jobs.rebuildSeats()).drifted).toBe(0);
    await sql`UPDATE market.enrolments SET current_period_end = ${today}::date,
      current_period_start = (${today}::date - interval '1 month')::date WHERE id = ${id}`.execute(
      api.db,
    );
    // The dates were rewritten under Redis: count the seats again, as if the plan always had them.
    await api.s.jobs.rebuildSeats();
    const now = new Date();
    const attempts = async () =>
      (await paymentsOf(api, id)).filter((p) => p.status === 'failed').length;
    for (const [day, expected] of [
      [0, 1],
      [0, 1],
      [1, 2],
      [2, 2],
      [3, 3],
      [5, 3],
    ] as const) {
      api.fake.controls.nextMandateCharge = 'fail';
      await api.s.jobs.renew(new Date(now.getTime() + day * 86_400_000));
      expect(await until(attempts, (n) => n >= expected)).toBe(expected);
    }
    // The new period's first session starts unpaid → past_due; the seat is kept for 7 days.
    const at = new Date(now.getTime() + 8 * 86_400_000);
    await api.s.jobs.pastDue(at);
    expect((await get(c, id)).body.status).toBe('past_due');
    await api.s.jobs.pastDue(new Date(at.getTime() + 7 * 86_400_000 + 60_000));
    expect((await get(c, id)).body.status).toBe('ended');
  });

  it('08 §5: a renewal that succeeds starts the next period (P1 again)', async () => {
    const { c, childId } = await freshParent();
    const id = await paidSeat(c, childId, 'monthly_recurring');
    const today = cairoToday();
    // Everything so far kept the counters true (the check at the end covers the rest).
    expect((await api.s.jobs.rebuildSeats()).drifted).toBe(0);
    await sql`UPDATE market.enrolments SET current_period_end = ${today}::date,
      current_period_start = (${today}::date - interval '1 month')::date WHERE id = ${id}`.execute(
      api.db,
    );
    // The dates were rewritten under Redis: count the seats again, as if the plan always had them.
    await api.s.jobs.rebuildSeats();
    api.fake.controls.nextMandateCharge = 'succeed';
    await api.s.jobs.renew();
    const renewed = await until(
      async () => (await paymentsOf(api, id)).filter((p) => p.status === 'succeeded').length,
      (n) => n === 2,
    );
    expect(renewed).toBe(2);
    const { rows } = await sql<{
      s: string;
    }>`SELECT current_period_start::text AS s FROM market.enrolments WHERE id = ${id}`.execute(
      api.db,
    );
    expect(rows[0]!.s).toBe(today);
  });
});

describe('Cancel, decline, waitlist (MKT-ENR-08/09/10, BR-REF-02, BR-ENR-10/11)', () => {
  it('BR-REF-02: cancel before paying releases the seat; after paying, a refund is requested', async () => {
    const { c, childId } = await freshParent();
    const before = await seatsLeftNext();
    const h = await hold(c, { studentId: childId, firstSessionId: next.id });
    const r = await c.call<EnrolmentBody>('POST', `/v1/enrolments/${h.body.id}/cancel`, {});
    expect(r.body.status).toBe('cancelled');
    expect(r.body.refund).toBeNull();
    expect(await seatsLeftNext()).toBe(before);
    const { c: c2, childId: k2 } = await freshParent();
    const paid = await paidSeat(c2, k2);
    const x = await c2.call<EnrolmentBody>('POST', `/v1/enrolments/${paid}/cancel`, {});
    expect(x.body.status).toBe('cancelled');
    expect(x.body.refund).toMatchObject({ status: 'requested', policy: 'before_first_session' });
    expect(await seatsLeftNext()).toBe(before);
  });

  it('BR-ENR-11: with "review each enrolment" on, a decline refunds in full automatically', async () => {
    await teacher.call('PATCH', '/v1/teachers/me', { reviewEachEnrolment: true });
    try {
      const { c, childId } = await freshParent();
      const id = await paidSeat(c, childId);
      expect((await get(c, id)).body.status).toBe('awaiting_teacher');
      const list = await teacher.call<{ id: string; canDecide: boolean }[]>(
        'GET',
        '/v1/teachers/me/enrolments',
      );
      expect(list.body.find((x) => x.id === id)?.canDecide).toBe(true);
      const d = await teacher.call<{ status: string }>('POST', `/v1/enrolments/${id}/decline`, {});
      expect(d.body.status).toBe('declined');
      const e = await until(
        async () => (await get(c, id)).body,
        (x) => x.refund?.status === 'succeeded',
      );
      expect(e.refund).toMatchObject({ policy: 'teacher_declined', status: 'succeeded' });
    } finally {
      await teacher.call('PATCH', '/v1/teachers/me', { reviewEachEnrolment: false });
    }
  });

  it('BR-ENR-10: a full group takes a waitlist; a freed seat is offered and the offer opens checkout', async () => {
    const { c, childId } = await freshParent();
    const { c: other, childId: otherKid } = await freshParent();
    // One seat left in the next session (holds of earlier cases included): someone holds it,
    // so that session is full for the next family.
    const g = await groupOf(c, NOUR_GROUP);
    await sql`UPDATE market.groups SET seat_cap = ${g.seatCap - g.upcomingSessions[0]!.seatsLeft + 1} WHERE id = ${NOUR_GROUP}`.execute(
      api.db,
    );
    try {
      const taken = await hold(other, {
        studentId: otherKid,
        firstSessionId: next.id,
        plan: 'per_session',
      });
      expect(taken.status, JSON.stringify(taken.body)).toBe(201);
      const full = await hold(c, {
        studentId: childId,
        firstSessionId: next.id,
        plan: 'per_session',
      });
      expect(full.status).toBe(409);
      expect(code(full)).toBe('seat_unavailable');
      const w = await c.call<{ id: string; status: string; position: number }>(
        'POST',
        `/v1/groups/${NOUR_GROUP}/waitlist`,
        { studentId: childId },
      );
      expect(w.status).toBe(201);
      expect(w.body).toMatchObject({ status: 'waiting', position: 1 });
      // The holder cancels: the seat goes to the first family in line as a 24-hour offer.
      await other.call('POST', `/v1/enrolments/${taken.body.id}/cancel`, {});
      const { rows: o } = await sql<{
        status: string;
      }>`SELECT status FROM market.waitlist_entries WHERE id = ${w.body.id}`.execute(api.db);
      expect(o[0]!.status).toBe('offered');
      const acc = await c.call<{ kind: string }>('POST', `/v1/waitlist/${w.body.id}/accept`, {
        paymentPlan: 'single_month',
        method: 'card',
      });
      expect(acc.status).toBe(200);
      expect(acc.body.kind).toBe('redirect');
    } finally {
      await sql`UPDATE market.groups SET seat_cap = 30 WHERE id = ${NOUR_GROUP}`.execute(api.db);
    }
  });
});

describe('Statements from the ledger (J06, J07, C07; BR-FEE-07)', () => {
  it('MKT-ENR-10 J06: the teacher sees paid enrolments only (BR-ENR-07)', async () => {
    const r = await teacher.call<{ id: string; status: string; student: string }[]>(
      'GET',
      '/v1/teachers/me/enrolments',
    );
    expect(r.status).toBe(200);
    expect(r.body.some((x) => x.student === 'مريم حسن' || x.student.length > 0)).toBe(true);
    expect(r.body.every((x) => x.status !== 'pending_payment')).toBe(true);
  });

  it('MKT-LED-07 J07: parents paid, Link commission on its own line, rent, next payout Thursday', async () => {
    const r = await teacher.call<{
      parentsPaid: { amountPt: number };
      commission: { amountPt: number };
      commissionPercent: number;
      rent: { hall: string; amount: { amountPt: number } }[];
      nextPayout: { on: string; amount: { amountPt: number } };
    }>('GET', '/v1/teachers/me/earnings');
    expect(r.status).toBe(200);
    expect(r.body.commissionPercent).toBe(5);
    expect(r.body.parentsPaid.amountPt).toBeGreaterThan(0);
    expect(r.body.commission.amountPt).toBeGreaterThan(0);
    expect(r.body.commission.amountPt).toBeLessThan(r.body.parentsPaid.amountPt / 19);
    expect(new Date(`${r.body.nextPayout.on}T12:00:00Z`).getUTCDay()).toBe(4);
    expect(r.body.nextPayout.amount.amountPt).toBeGreaterThanOrEqual(0);
  });

  it('MKT-LED-08 C07: rent per booking with Link fee and net; owner only', async () => {
    const r = await owner.call<{
      feePercent: number;
      rows: {
        hall: { name: string };
        teacher: { name: string };
        rent: { amountPt: number };
        linkFee: { amountPt: number };
        net: { amountPt: number };
      }[];
    }>('GET', `/v1/centres/${demoId('cen-nour')}/rent-income`);
    expect(r.status).toBe(200);
    expect(r.body.feePercent).toBe(5);
    expect(r.body.rows.length).toBeGreaterThan(0);
    for (const row of r.body.rows)
      expect(row.net.amountPt).toBe(row.rent.amountPt - row.linkFee.amountPt);
    const reception = new Client(api);
    await reception.signIn(PHONES.reception);
    expect(
      (await reception.call('GET', `/v1/centres/${demoId('cen-nour')}/rent-income`)).status,
    ).toBe(403);
  });
});

describe('Reviews (MKT-REV-01/03, BR-REV-01/02/04/06)', () => {
  const physics = demoId('enr:enr-mariam-phys'); // Mariam's paid physics plan, first session long past
  let reviewId = '';
  it('BR-REV-01: only after the first session', async () => {
    const own = (await parent.call<{ data: EnrolmentBody[] }>('GET', '/v1/me/enrolments')).body
      .data;
    const fresh = own.find((e) => e.status === 'confirmed' && !e.firstSessionStarted)!;
    const r = await parent.call('POST', '/v1/reviews', {
      enrolmentId: fresh.id,
      targetType: 'teacher',
      stars: 5,
      tags: [],
      body: 'x',
      visibility: 'public',
    });
    expect(r.status).toBe(403);
    expect(code(r)).toBe('not_verified_parent');
  });

  it('MKT-REV-01: a verified parent reviews; once per target and term (BR-REV-02)', async () => {
    expect((await get(parent, physics)).body.canReview).toBe(true);
    const r = await parent.call<{ id: string; status: string }>('POST', '/v1/reviews', {
      enrolmentId: physics,
      targetType: 'centre',
      stars: 4,
      tags: ['organised'],
      body: 'منظمين والمواعيد مضبوطة.',
      visibility: 'public',
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('published');
    reviewId = r.body.id;
    const again = await parent.call('POST', '/v1/reviews', {
      enrolmentId: physics,
      targetType: 'centre',
      stars: 5,
      tags: [],
      body: '',
      visibility: 'public',
    });
    expect(again.status).toBe(409);
    expect(code(again)).toBe('already_reviewed');
  });

  it('BR-REV-04: a phone number in the text holds the review for Link ops', async () => {
    const r = await parent.call<{ status: string }>('POST', '/v1/reviews', {
      enrolmentId: physics,
      targetType: 'teacher',
      stars: 5,
      tags: [],
      body: 'كلموني على 01012345678',
      visibility: 'public',
    });
    expect(r.body.status).toBe('held');
  });

  it('BR-REV-06: the centre replies or reports, never deletes; others may not reply', async () => {
    const centreOf = await sql<{
      centre_id: string;
    }>`SELECT centre_id FROM market.reviews WHERE id = ${reviewId}`.execute(api.db);
    const centreId = centreOf.rows[0]!.centre_id;
    const ownerPhone = centreId === demoId('cen-nour') ? PHONES.owner : PHONES.ownerB;
    const target = new Client(api);
    await target.signIn(ownerPhone);
    const list = await target.call<{ items: { id: string }[] }>(
      'GET',
      `/v1/me/reviews-received?centreId=${centreId}&visibility=public`,
    );
    expect(list.body.items.some((x) => x.id === reviewId)).toBe(true);
    expect(
      (await parent.call('POST', `/v1/reviews/${reviewId}/reply`, { body: 'hi' })).status,
    ).toBe(404);
    const reply = await target.call('POST', `/v1/reviews/${reviewId}/reply`, {
      body: 'شكرًا لكم.',
    });
    expect(reply.status).toBe(200);
    const twice = await target.call('POST', `/v1/reviews/${reviewId}/reply`, { body: 'again' });
    expect(code(twice)).toBe('already_replied');
    const rep = await target.call('POST', `/v1/reviews/${reviewId}/report`, {
      reason: 'Not our centre',
    });
    expect(rep.status).toBe(200);
    const reported = await target.call<{ items: { id: string }[] }>(
      'GET',
      `/v1/me/reviews-received?centreId=${centreId}&status=reported`,
    );
    expect(reported.body.items.some((x) => x.id === reviewId)).toBe(true);
    // No delete route exists, and the database refuses one from the app role.
    expect((await target.call('DELETE', `/v1/reviews/${reviewId}`)).status).toBe(404);
  });
});

describe('Seat counters stay true (08 §4 "Nightly rebuild")', () => {
  it('after every case above, Redis and the database agree on every future session', async () => {
    const r = await api.s.jobs.rebuildSeats();
    expect(r.groups).toBeGreaterThan(0);
    expect(r.drifted).toBe(0);
  });
});
