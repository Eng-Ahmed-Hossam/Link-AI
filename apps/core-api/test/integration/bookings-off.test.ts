// S3 `bookingsEnabled`: with no payment provider yet (PAYMENT_PROVIDER=none, a Follow-up-only
// start) the apps are told bookings are off, and nothing can hold a seat or open a checkout.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Api, Client, PHONES, startApi } from '../helpers';
import { MARIAM, NOUR_GROUP, count, groupOf } from '../money-helpers';

let api: Api;
let parent: Client;
beforeAll(async () => {
  process.env.PAYMENT_PROVIDER = 'none';
  api = await startApi();
  parent = new Client(api);
  await parent.signIn(PHONES.parent);
}, 120_000);
afterAll(async () => {
  delete process.env.PAYMENT_PROVIDER;
  await api.close();
});

describe('S3 bookingsEnabled (PAYMENT_PROVIDER=none)', () => {
  it('the flags tell a signed-in parent that bookings are off', async () => {
    type F = { flags: Record<string, boolean> };
    const r = await parent.call<F>('GET', '/v1/feature-flags');
    expect(r.body.flags['bookings.enabled']).toBe(false);
  });

  it('reserving answers 503 payments_off and holds nothing', async () => {
    const before = await count(api, 'market.enrolments');
    const next = (await groupOf(parent, NOUR_GROUP)).upcomingSessions[0]!;
    const r = await parent.call('POST', '/v1/enrolments', {
      groupId: NOUR_GROUP,
      studentId: MARIAM,
      paymentPlan: 'single_month',
      firstSessionId: next.id,
      sharePhone: false,
    });
    expect([r.status, (r.body as { code?: string }).code]).toEqual([503, 'payments_off']);
    expect(await count(api, 'market.enrolments')).toBe(before);
  });
});
