// The connected story (Step 2B): "Jump to step N" sets up each step's starting state, and
// "Simulate first session done" moves only the story group's calendar.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import {
  api,
  fuApi,
  marketApi,
  ownerApi,
  setApiBaseUrl,
  setApiLocale,
  setAuthToken,
} from '@link/api-client';
import { handlers } from '../handlers';
import { resetMockDb } from '../db';
import { cairoToday } from '../time';

const BASE = 'http://mock.link.test';
const server = setupServer(...handlers);
beforeAll(() => {
  setApiBaseUrl(BASE);
  server.listen({ onUnhandledFrame: 'error' });
});
afterAll(() => server.close());
beforeEach(() => {
  resetMockDb();
  setApiLocale('en');
});
const as = (id: string) => setAuthToken(`mock.${id}`);
const post = async (path: string, body: unknown = {}) =>
  (
    await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  ).json();
const jump = (step: number) => post('/__demo/story/jump', { step });

describe('Step 2B · the connected story', () => {
  it('reset: marketplace, Phase 2 and the Follow-up extra on; nothing of the story yet', async () => {
    const s = await post('/__demo/story/reset');
    expect(s).toMatchObject({ requestId: null, groupId: null, followupExtra: true });
    as('usr-salma');
    // Ms Salma's existing group has its latest record, so the story's session will be the one due.
    expect((await fuApi.teacherToday()).recordDue).toBeNull();
  });

  it('jump to 2: the Saturday request for Room 1 waits in Requested', async () => {
    const s = await jump(2);
    expect(s.stage).toBe('requested');
    as('usr-owner');
    const r = (await marketApi.centreRequests('cen-nour')).find((x) => x.id === s.requestId)!;
    expect(r).toMatchObject({ weekdays: [6], start: '16:00', hall: { id: 'hall-nour-1' } });
  });

  it('jump to 3 and 4: approved and booked; then the group with both fees and 24 seats', async () => {
    expect((await jump(3)).bookingId).not.toBeNull();
    const s = await jump(4);
    expect(s.groupId).not.toBeNull();
    as('usr-parent');
    const g = await api.group(s.groupId);
    expect(g).toMatchObject({
      seatCap: 24,
      monthlyFee: { amountPt: 55_000 },
      sessionFee: { amountPt: 15_000 },
    });
    // The group starts on the booking's first day: no session before it.
    expect(g.upcomingSessions[0]!.startsAt > new Date().toISOString()).toBe(true);
  });

  it('jump to 5: Mariam paid by card (confirmed), Youssef held with Fawry; the seat count went down', async () => {
    const s = await jump(5);
    as('usr-parent');
    const mine = (await api.myEnrolments()).data.filter((e) => e.group.id === s.groupId);
    expect(mine.map((e) => e.status).sort()).toEqual(['confirmed', 'pending_payment']);
    const g = await api.group(s.groupId);
    expect(g.upcomingSessions[0]!.seatsLeft).toBe(24 - 2);
  });

  it('jump to 7: the first session has taken place, so the review form opens', async () => {
    const s = await jump(7);
    expect(s.sessionsDone).toBe(1);
    as('usr-parent');
    const e = await api.enrolment(s.enrolmentId);
    expect(e.firstSessionStarted).toBe(true);
  });

  it('jump to 8: review posted and replied; the first session is the record due', async () => {
    const s = await jump(8);
    expect(s.sessionsDone).toBe(1);
    as('usr-owner');
    const rv = await marketApi.reviewsReceived('cen-nour', 'public');
    expect(rv.items.find((x) => x.body.startsWith('Ms Salma explains'))?.reply?.body).toContain(
      'glad Mariam',
    );
    as('usr-salma');
    const today = await fuApi.teacherToday();
    expect(today.recordDue?.groupId).toBe(s.groupId);
  });

  it('jump to 9: two absences raised a follow-up; the approved update reached the parent; outcome logged', async () => {
    const s = await jump(9);
    as('usr-parent');
    const updates = (await ownerApi.parentUpdates()).data.filter(
      (u) => u.studentId === 'chd-mariam',
    );
    expect(updates.length).toBe(1);
    as('usr-reception');
    const c = (await fuApi.cases()).data.find((x) => x.student.id === 'chd-mariam')!;
    expect(c.assignee.id).toBe('usr-reception');
    expect(s.followupExtra).toBe(true);
  });

  it('step 9: with the extra off, the follow-up is gone for the parent and the marketplace still works', async () => {
    const s = await jump(9);
    await post('/__demo/story/extra', { on: false });
    as('usr-parent');
    expect((await ownerApi.parentUpdates()).data).toEqual([]);
    expect((await api.group(s.groupId)).seatCap).toBe(24);
    as('usr-salma');
    expect((await marketApi.teacherFeatures()).followupExtra).toBe(false);
  });

  it('"Simulate first session done" moves only the story group; the covered sessions move with it', async () => {
    const s = await jump(6);
    as('usr-parent');
    const before = await api.enrolment(s.enrolmentId);
    const done = await post('/__demo/story/session-done');
    expect(done.sessionsDone).toBe(1);
    const after = await api.enrolment(s.enrolmentId);
    expect(after.firstSession.startsAt < before.firstSession.startsAt).toBe(true);
    expect(after.firstSession.startsAt.slice(0, 10) < cairoToday()).toBe(true);
    expect(after.status).toBe('confirmed');
  });

  it('jump checks the step number', async () => {
    const r = await fetch(`${BASE}/__demo/story/jump`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ step: 12 }),
    });
    expect(r.status).toBe(422);
  });
});
