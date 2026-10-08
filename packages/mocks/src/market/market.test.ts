// Rule tests for the marketplace operations (Batches 2–3), through the real client and handlers.
// Test names carry rule / story / decision IDs.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import {
  ApiError,
  marketApi,
  ownerApi,
  setApiBaseUrl,
  setApiLocale,
  setAuthToken,
} from '@link/api-client';
import { handlers } from '../handlers';
import { resetMockDb } from '../db';
import { cairoToday, addDays } from '../time';
import { feeOf, sessionsInMonth } from './logic';

const BASE = 'http://mock.link.test';
const C = 'cen-nour';
const server = setupServer(...handlers);
beforeAll(() => {
  setApiBaseUrl(BASE);
  server.listen({ onUnhandledFrame: 'error' });
});
afterAll(() => server.close());
beforeEach(() => {
  resetMockDb();
  setApiLocale('en');
  setAuthToken('mock.usr-owner');
});
const as = (id: string) => setAuthToken(`mock.${id}`);
const err = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('expected an error');
};

describe('money (OD-01, OD-02, OD-16, CF-13)', () => {
  it("OD-16: Link's fee rounds down to a whole piaster", () => {
    expect(feeOf(1999, 5)).toBe(99);
    expect(feeOf(2000, 5)).toBe(100);
  });

  it('C07 MKT-LED-08: each row is rent − 5% fee = net, and the totals add up from the rows', async () => {
    const r = await marketApi.rentIncome(C);
    expect(r.feePercent).toBe(5);
    expect(r.rows.length).toBeGreaterThan(0);
    for (const row of r.rows) {
      expect(row.linkFee.amountPt).toBe(Math.floor((row.rent.amountPt * 5) / 100));
      expect(row.net.amountPt).toBe(row.rent.amountPt - row.linkFee.amountPt);
    }
    const sum = (f: (x: (typeof r.rows)[number]) => number) => r.rows.reduce((a, x) => a + f(x), 0);
    expect(r.totals.rentDue.amountPt).toBe(sum((x) => x.rent.amountPt));
    expect(r.totals.linkFee.amountPt).toBe(sum((x) => x.linkFee.amountPt));
    expect(r.totals.net.amountPt).toBe(r.totals.rentDue.amountPt - r.totals.linkFee.amountPt);
    expect(r.totals.collected.amountPt + r.totals.outstanding.amountPt).toBe(
      r.totals.rentDue.amountPt,
    );
    expect(r.nextTransfer.amount.amountPt).toBe(
      sum((x) => (x.paidVia === 'link' ? x.net.amountPt : 0)),
    );
  });

  it('C05 rent rules: fixed per session, per student per session, share of fees', async () => {
    const r = await marketApi.rentIncome(C);
    const room1 = r.rows.find((x) => x.hall.name === 'Room 1' && x.sessions > 0)!;
    expect(room1.rentRule.basis).toBe('fixed_per_session');
    expect(room1.rent.amountPt).toBe(25000 * room1.sessions);
    const hallA = r.rows.find((x) => x.hall.name === 'Hall A')!;
    expect(hallA.rent.amountPt).toBe(1500 * hallA.studentSessions);
    const room2 = r.rows.find((x) => x.hall.name === 'Room 2')!;
    expect(room2.rent.amountPt).toBe(Math.floor((room2.feesBase!.amountPt * 20) / 100));
  });

  it('J07 MKT-LED-07: keep = parents paid − 5% commission − rent, each on its own line', async () => {
    as('usr-salma');
    const e = await marketApi.earnings();
    expect(e.commissionPercent).toBe(5);
    const paid = e.byGroup.reduce((a, g) => a + g.amount.amountPt, 0);
    expect(e.parentsPaid.amountPt).toBe(paid);
    expect(e.commission.amountPt).toBe(
      e.byGroup.reduce((a, g) => a + Math.floor((g.amount.amountPt * 5) / 100), 0),
    );
    expect(e.rentTotal.amountPt).toBe(e.rent.reduce((a, r) => a + r.amount.amountPt, 0));
    expect(e.keep.amountPt).toBe(paid - e.commission.amountPt - e.rentTotal.amountPt);
  });

  it('OD-04: the next payout is a Thursday', async () => {
    as('usr-salma');
    const e = await marketApi.earnings();
    expect(new Date(`${e.nextPayout.on}T12:00:00Z`).getUTCDay()).toBe(4);
  });

  it('sessions in a month count only the booked weekdays from the start date', () => {
    expect(sessionsInMonth([6], '2026-10-01', '2026-10')).toBe(5); // Saturdays in Oct 2026
    expect(sessionsInMonth([6], '2026-10-15', '2026-10')).toBe(3);
  });
});

describe('halls and room requests (MKT-HAL)', () => {
  it('MKT-HAL-05: auto-approve is off by default', async () => {
    expect((await marketApi.autoApprove(C)).enabled).toBe(false);
  });

  it('C06: the pipeline only moves forward; approving books the slot (shown on C03)', async () => {
    const before = (await marketApi.schedule(C)).cells.filter((c) => c.kind === 'booked').length;
    await marketApi.moveRequest('req-omar', 'phone_call');
    expect((await err(marketApi.moveRequest('req-omar', 'phone_call'))).code).toBe(
      'stage_backwards',
    );
    await marketApi.moveRequest('req-omar', 'meeting');
    const ok = await marketApi.approveRequest('req-omar');
    expect(ok.stage).toBe('approved');
    const after = (await marketApi.schedule(C)).cells.filter((c) => c.kind === 'booked').length;
    expect(after).toBe(before + 2); // Sun and Tue
  });

  it('C06: "meets your rules" is checked from the data (ID, rating, size, free slot)', async () => {
    const reqs = await marketApi.centreRequests(C);
    const omar = reqs.find((r) => r.id === 'req-omar')!;
    expect(omar.meetsRules).toBe(true);
    const dina = reqs.find((r) => r.id === 'req-dina')!;
    expect(dina.checks.verifiedId).toBe(false);
    expect(dina.meetsRules).toBe(false);
    const tamer = reqs.find((r) => r.id === 'req-tamer')!;
    expect(tamer.checks.rating).toBe(false);
  });

  it('declining needs a reason; an approved request cannot be declined', async () => {
    expect((await err(marketApi.declineRequest('req-dina', ' '))).code).toBe('reason_required');
    expect((await err(marketApi.declineRequest('req-tarek', 'x'))).code).toBe('request_closed');
  });

  it('J02: a teacher requests free slots only; with auto-approve on and every rule met it is booked at once', async () => {
    as('usr-salma');
    const rooms = await marketApi.searchRooms({ students: 20 });
    const room2 = rooms.find((r) => r.hall.id === 'hall-nour-2')!;
    const slot = room2.freeSlots.find((s) => s.start === '14:00')!;
    const body = {
      hallId: 'hall-nour-2',
      slots: [slot],
      groupId: null,
      subjectId: 'sub-math',
      schoolYearId: 'sy-sec2',
      expectedStudents: 20,
      startsOn: addDays(cairoToday(), 7),
    };
    const r = await marketApi.requestRoom(body);
    expect(r.stage).toBe('requested');
    // A request does not hold the slot: two teachers may ask; approving one blocks the other.
    const twin = await marketApi.requestRoom(body);
    as('usr-owner');
    await marketApi.approveRequest(r.id);
    expect((await err(marketApi.approveRequest(twin.id))).code).toBe('slot_taken');
    as('usr-owner');
    await marketApi.putAutoApprove(C, {
      enabled: true,
      verifiedId: true,
      minRating: 4.5,
      fitsCapacity: true,
    });
    as('usr-salma');
    const other = room2.freeSlots.find((s) => s.start === '20:00' && s.weekday !== slot.weekday)!;
    const auto = await marketApi.requestRoom({ ...body, slots: [other] });
    expect(auto.stage).toBe('approved');
  });

  it('C05: seats cannot go below a group in the hall; only the owner edits halls', async () => {
    expect((await err(marketApi.updateHall('hall-nour-a', { capacity: 10 }))).code).toBe(
      'capacity_below_group',
    );
    as('usr-reception');
    expect((await err(marketApi.updateHall('hall-nour-a', { capacity: 50 }))).problem.status).toBe(
      403,
    );
  });
});

describe('groups, enrolments, reviews', () => {
  it('J05 / CF-05: the teacher sets fees per group; seats ≤ the hall and ≥ seats taken', async () => {
    as('usr-salma');
    expect((await err(marketApi.updateGroup('grp-salma-ws', { seatCap: 31 }))).code).toBe(
      'seat_cap_above_hall',
    );
    expect((await err(marketApi.updateGroup('grp-salma-ws', { seatCap: 1 }))).code).toBe(
      'seat_cap_below_filled',
    );
    await marketApi.updateGroup('grp-salma-ws', { monthlyFeePt: 60000, sessionFeePt: 16000 });
    expect(
      (await err(marketApi.updateGroup('grp-karim-nour', { seatCap: 10 }))).problem.status,
    ).toBe(404);
  });

  it('J05: a new group goes in a booked slot, with both fees and a seat cap ≤ the hall', async () => {
    as('usr-owner');
    await marketApi.approveRequest('req-salma-future').catch(() => undefined);
    as('usr-salma');
    const bk = (await marketApi.myBookings()).find((b) => !b.groupId)!;
    expect(
      (
        await err(
          marketApi.createGroup({
            bookingId: bk.id,
            subjectId: 'sub-math',
            schoolYearId: 'sy-sec2',
            monthlyFeePt: 55000,
            sessionFeePt: 15000,
            seatCap: bk.hall.capacity + 1,
            offersMonthlyRecurring: true,
          }),
        )
      ).code,
    ).toBe('seat_cap_above_hall');
    const g = await marketApi.createGroup({
      bookingId: bk.id,
      subjectId: 'sub-math',
      schoolYearId: 'sy-sec2',
      monthlyFeePt: 55000,
      sessionFeePt: 15000,
      seatCap: bk.hall.capacity,
      offersMonthlyRecurring: true,
    });
    expect(g.id).toMatch(/^grp-new-/);
    expect((await marketApi.myBookings()).find((b) => b.id === bk.id)!.groupId).toBe(g.id);
  });

  it('J06 / OD-08: read-only by default; accept and decline only with "review each enrolment" on', async () => {
    as('usr-salma');
    const list = await marketApi.myEnrolments();
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((e) => !e.canDecide)).toBe(true);
    await marketApi.updateTeacherSelf({ reviewEachEnrolment: true });
    expect((await marketApi.teacherSelf()).reviewEachEnrolment).toBe(true);
  });

  it('BR-REV-06: owners reply or report; there is no delete or hide', async () => {
    await marketApi.replyReview('rev-1', 'Thank you!');
    await marketApi.reportReview('rev-2', 'Not about our centre');
    const pub = await marketApi.reviewsReceived(C, 'public');
    expect(pub.items.find((r) => r.id === 'rev-1')!.reply!.body).toBe('Thank you!');
    const rep = await marketApi.reviewsReceived(C, 'reported');
    expect(rep.items.map((r) => r.id)).toContain('rev-2');
    expect((await err(marketApi.replyReview('pf-1', 'x'))).code).toBe('private_feedback');
  });

  it('OD-58: Follow-up is a paid extra per centre — on for Al Nour in the demo, off elsewhere', async () => {
    expect((await marketApi.centreFeatures(C)).followupExtra).toBe(true);
    expect((await marketApi.centreFeatures('cen-nile')).followupExtra).toBe(false);
    as('usr-salma');
    expect((await marketApi.teacherFeatures()).followupExtra).toBe(true);
  });

  it('OD-58: without the extra a parent gets no updates feed (P09)', async () => {
    as('usr-parent');
    expect((await marketApi.parentFeatures()).followupExtra).toBe(true);
    await fetch(`${BASE}/__demo/features`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ centreId: C, followupExtra: false }),
    });
    expect((await marketApi.parentFeatures()).followupExtra).toBe(false);
    expect((await ownerApi.parentUpdates()).data).toEqual([]);
  });
});

describe('staff and schedule', () => {
  it('A16 MKT-ACC-06 AC1: a Reception invite carries bookings.manage / reviews.reply', async () => {
    const before = await ownerApi.staff(C);
    expect(before.find((m) => m.role === 'reception')?.permissions).toEqual([
      'bookings.manage',
      'reviews.reply',
    ]);
    expect(before.find((m) => m.role === 'teacher')?.permissions).toEqual([]);
    const after = await ownerApi.invite(C, {
      phone: '+201011112222',
      role: 'reception',
      permissions: ['reviews.reply'],
    });
    expect(after.find((m) => m.status === 'invite_pending')?.permissions).toEqual([
      'reviews.reply',
    ]);
  });

  it('10 §1: Reception (bookings.manage) works the room requests; a teacher cannot', async () => {
    as('usr-reception');
    expect((await marketApi.centreRequests(C)).length).toBeGreaterThan(0);
    as('usr-salma');
    expect((await err(marketApi.centreRequests(C))).problem.status).toBe(403);
  });

  it('C03: the week runs from today in date order (no Friday)', async () => {
    const s = await marketApi.schedule(C);
    const dates = s.days.map((d) => s.dates[d]!);
    expect([...dates].sort()).toEqual(dates);
    expect(dates[0]).toBe(
      [0, 1].map((i) => addDays(cairoToday(), i)).find((d) => new Date(d).getUTCDay() !== 5),
    );
  });
});

describe('CF-44 (decided 2026-10-08): owners add halls and move the pin', () => {
  it('only the owner adds a hall; it is listed with every slot offered and its rent rule checked', async () => {
    const before = (await marketApi.halls(C)).length;
    as('usr-reception');
    expect(
      (
        await err(
          marketApi.addHall(C, {
            name: 'Room 4',
            capacity: 18,
            facilities: ['ac'],
            rentRule: { basis: 'fixed_per_session', amountPt: 20000 },
          }),
        )
      ).problem.status,
    ).toBe(403);
    as('usr-owner');
    expect(
      (
        await err(
          marketApi.addHall(C, {
            name: 'Room 4',
            capacity: 18,
            facilities: [],
            rentRule: { basis: 'percent_of_fees', percent: 90 },
          }),
        )
      ).problem.status,
    ).toBe(422);
    const h = await marketApi.addHall(C, {
      name: 'Room 4',
      capacity: 18,
      facilities: ['ac'],
      rentRule: { basis: 'fixed_per_session', amountPt: 20000 },
    });
    expect(h.listed).toBe(true);
    expect(h.slots.every((x) => x.state === 'free')).toBe(true);
    expect((await marketApi.halls(C)).length).toBe(before + 1);
  });

  it('a moved pin shows "Location under review" to the owner and on P04 until ops verify it', async () => {
    const p = await marketApi.moveCentrePin(C, {
      lat: 29.961,
      lng: 31.258,
      address: '14 Road 9, Maadi',
    });
    expect(p.location).toMatchObject({ address: '14 Road 9, Maadi', underReview: true });
    const pub = await (await fetch(`${BASE}/v1/centres/by-slug/al-nour-maadi`)).json();
    expect(pub.locationUnderReview).toBe(true);
    expect(pub.address).toBe('14 Road 9, Maadi');
    await fetch(`${BASE}/__demo/verify-location`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ centreId: C }),
    });
    expect((await marketApi.centreProfile(C)).location.underReview).toBe(false);
    expect(
      (await err(marketApi.moveCentrePin(C, { lat: 48.8, lng: 2.3, address: 'Paris' }))).problem
        .status,
    ).toBe(422);
  });
});
