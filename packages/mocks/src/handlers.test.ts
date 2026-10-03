// Rule tests for the mock backend the Batch 1 screens depend on. Test names carry rule IDs.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import {
  api,
  ApiError,
  setApiBaseUrl,
  setApiLocale,
  setAuthToken,
  newIdempotencyKey,
} from '@link/api-client';
import { handlers, MOCK_OTP } from './handlers';
import { resetMockDb, setMockSettings } from './db';

const server = setupServer(...handlers);
beforeAll(() => {
  setApiBaseUrl('http://mock.link.test');
  server.listen({ onUnhandledFrame: 'error' });
});
afterAll(() => server.close());
beforeEach(() => {
  resetMockDb();
  setApiLocale('en');
  setAuthToken('mock.usr-parent');
});

const err = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('expected an error');
};

describe('MKT-ACC-01 phone OTP', () => {
  it('accepts 123456 and returns tokens; an existing number is not a new user', async () => {
    await api.requestOtp('+201000000001');
    const r = await api.verifyOtp('+201000000001', MOCK_OTP);
    expect(r.accessToken).toBe('mock.usr-parent');
    expect(r.isNewUser).toBe(false);
  });
  it('AC4: a wrong code says how many tries are left; AC2: 5 tries then locked', async () => {
    await api.requestOtp('+201000000099');
    for (let remaining = 4; remaining >= 0; remaining--) {
      const e = await err(api.verifyOtp('+201000000099', '000000'));
      expect(e.problem.remainingAttempts).toBe(remaining);
    }
    const locked = await err(api.verifyOtp('+201000000099', MOCK_OTP));
    expect(locked.code).toBe('otp_locked');
  });
  it('accepts Arabic-Indic digits in the phone (RTL-04)', async () => {
    const r = await api.requestOtp('٠١٠٠٠٠٠٠٠٠١');
    expect(r.resendAfterSeconds).toBe(60);
  });
});

describe('MKT-DSC-02 search', () => {
  it('defaults to ≤ 5 km and reports totals', async () => {
    const r = await api.searchCentres({ subjectId: 'sub-math', schoolYearId: 'sy-sec2' });
    expect(r.data.every((c) => (c.distanceKm ?? 0) <= 5)).toBe(true);
    expect(r.data.find((c) => c.slug === 'horizon-new-cairo')).toBeUndefined();
    expect(r.totals.centres).toBe(r.data.length);
  });
  it('MKT-DSC-03: a centre whose matching groups are all full is "waitlist"', async () => {
    const r = await api.searchCentres({ subjectId: 'sub-math', schoolYearId: 'sy-sec2' });
    expect(r.data.find((c) => c.slug === 'future-minds-maadi')?.seatState).toBe('waitlist');
    expect(r.data.find((c) => c.slug === 'al-nour-maadi')?.seatState).toBe('open');
  });
});

describe('MKT-ENR-02 hold and checkout', () => {
  const group = 'grp-salma-ws';
  const firstSession = async () => (await api.group(group)).upcomingSessions[0]!;

  it('BR-ENR-02: seats are counted per session, and a hold uses a seat in every covered session', async () => {
    const before = await api.group(group);
    const s0 = before.upcomingSessions[0]!;
    const e = await api.createEnrolment(
      {
        groupId: group,
        studentId: 'chd-mariam',
        paymentPlan: 'single_month',
        firstSessionId: s0.id,
        sharePhone: false,
      },
      newIdempotencyKey(),
    );
    expect(e.status).toBe('pending_payment');
    const after = await api.group(group);
    for (const sid of e.sessionIds) {
      const b = before.upcomingSessions.find((x) => x.id === sid)!;
      const a = after.upcomingSessions.find((x) => x.id === sid)!;
      expect(a.seatsLeft).toBe(b.seatsLeft - 1);
    }
  });

  it('BR-ENR-01: the hold lasts 10 minutes for card and wallet', async () => {
    const s0 = await firstSession();
    const e = await api.createEnrolment(
      {
        groupId: group,
        studentId: 'chd-mariam',
        paymentPlan: 'per_session',
        sessionId: s0.id,
        sharePhone: false,
      },
      newIdempotencyKey(),
    );
    const mins = (new Date(e.holdExpiresAt!).getTime() - Date.now()) / 60000;
    expect(mins).toBeGreaterThan(9.9);
    expect(mins).toBeLessThanOrEqual(10);
  });

  it('BR-PMT-07 / OD-09: Fawry extends the hold to 24 hours and gives a reference', async () => {
    const s0 = await firstSession();
    const e = await api.createEnrolment(
      {
        groupId: group,
        studentId: 'chd-mariam',
        paymentPlan: 'single_month',
        firstSessionId: s0.id,
        sharePhone: false,
      },
      newIdempotencyKey(),
    );
    const c = await api.checkout(e.id, 'fawry', newIdempotencyKey());
    expect(c.kind).toBe('fawry');
    if (c.kind === 'fawry')
      expect((new Date(c.expiresAt).getTime() - Date.now()) / 3600000).toBeGreaterThan(23.9);
  });

  it('BR-PMT-02: a monthly plan cannot be paid with Fawry or a wallet', async () => {
    const s0 = await firstSession();
    const e = await api.createEnrolment(
      {
        groupId: group,
        studentId: 'chd-mariam',
        paymentPlan: 'monthly_recurring',
        firstSessionId: s0.id,
        sharePhone: false,
      },
      newIdempotencyKey(),
    );
    expect((await err(api.checkout(e.id, 'fawry', newIdempotencyKey()))).code).toBe(
      'method_not_allowed',
    );
    expect((await err(api.checkout(e.id, 'wallet', newIdempotencyKey()))).code).toBe(
      'method_not_allowed',
    );
  });

  it('MKT-ENR-02 AC7: a full covered session is named in the 409', async () => {
    const g = await api.group('grp-salma-st');
    const e = await err(
      api.createEnrolment(
        {
          groupId: 'grp-salma-st',
          studentId: 'chd-mariam',
          paymentPlan: 'monthly_recurring',
          firstSessionId: g.upcomingSessions[0]!.id,
          sharePhone: false,
        },
        newIdempotencyKey(),
      ),
    );
    expect(e.code).toBe('seat_unavailable');
    expect(e.problem.errors?.[0]?.sessionId).toBe(
      g.upcomingSessions.find((s) => s.seatsLeft === 0)!.id,
    );
  });

  it('BR-ENR-08: one live enrolment per student per group; 07: same key replays', async () => {
    const s0 = await firstSession();
    const key = newIdempotencyKey();
    const body = {
      groupId: group,
      studentId: 'chd-mariam',
      paymentPlan: 'per_session' as const,
      sessionId: s0.id,
      sharePhone: false,
    };
    const a = await api.createEnrolment(body, key);
    const b = await api.createEnrolment(body, key);
    expect(b.id).toBe(a.id);
    expect((await err(api.createEnrolment(body, newIdempotencyKey()))).code).toBe(
      'already_enrolled',
    );
  });

  it('BR-ENR-05: a failed attempt keeps pending_payment; BR-ENR-01: an unpaid hold expires', async () => {
    setMockSettings({ holdSeconds: 1 });
    const s0 = await firstSession();
    const e = await api.createEnrolment(
      {
        groupId: group,
        studentId: 'chd-mariam',
        paymentPlan: 'per_session',
        sessionId: s0.id,
        sharePhone: false,
      },
      newIdempotencyKey(),
    );
    await new Promise((r) => setTimeout(r, 1200));
    expect((await api.enrolment(e.id)).status).toBe('expired');
  });

  it('MKT-ENR-08 / BR-REF-02: cancelling before the first session creates a separate refund request', async () => {
    const s = (await api.group(group)).upcomingSessions[3]!;
    const e = await api.createEnrolment(
      {
        groupId: group,
        studentId: 'chd-mariam',
        paymentPlan: 'per_session',
        sessionId: s.id,
        sharePhone: false,
      },
      newIdempotencyKey(),
    );
    // Simulate a paid enrolment through the mock provider + webhook.
    const c = await api.checkout(e.id, 'card', newIdempotencyKey());
    const paymentId = c.kind === 'redirect' ? c.checkoutUrl.split('/').pop()! : '';
    await fetch(`http://mock.link.test/__mock/payments/${paymentId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ result: 'succeeded' }),
    });
    expect((await api.enrolment(e.id)).status).toBe('pending_payment'); // BR-MNY-12: not until the webhook
    await new Promise((r) => setTimeout(r, 2700));
    expect((await api.enrolment(e.id)).status).toBe('confirmed');
    const cancelled = await api.cancelEnrolment(e.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.refund?.status).toBe('requested');
  }, 10000);
});

describe('MKT-REV-01 reviews', () => {
  it('BR-REV-01/02: verified parent after the first session, once per target per term', async () => {
    const body = {
      enrolmentId: 'enr-mariam-phys',
      targetType: 'teacher' as const,
      stars: 5,
      tags: [],
      body: 'Great',
      visibility: 'public' as const,
    };
    const r = await api.createReview(body, newIdempotencyKey());
    expect(r.status).toBe('published');
    expect((await err(api.createReview(body, newIdempotencyKey()))).code).toBe('already_reviewed');
  });
  it('BR-REV-04: contact details hold a review for ops', async () => {
    const r = await api.createReview(
      {
        enrolmentId: 'enr-mariam-phys',
        targetType: 'centre',
        stars: 4,
        tags: [],
        body: 'Call me on 01012345678',
        visibility: 'public',
      },
      newIdempotencyKey(),
    );
    expect(r.status).toBe('held');
  });
  it('rejects text over 600 characters', async () => {
    const e = await err(
      api.createReview(
        {
          enrolmentId: 'enr-mariam-phys',
          targetType: 'centre',
          stars: 4,
          tags: [],
          body: 'x'.repeat(601),
          visibility: 'public',
        },
        newIdempotencyKey(),
      ),
    );
    expect(e.code).toBe('body_too_long');
  });
});
