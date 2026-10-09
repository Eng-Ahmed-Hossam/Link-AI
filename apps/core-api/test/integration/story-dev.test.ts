// The local Demo control behind story step 7: "Simulate first session done" moves the story group's
// calendar back a week (sessions, booking, paid periods), so the paid seat can be reviewed (BR-REV-01).
import { expect, it } from 'vitest';
import { demoId } from '../../seeds/demo';
import { addDays, cairoToday, isoWeekday } from '../../src/platform/time';
import { Client, PHONES, startApi } from '../helpers';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MARIAM, checkout, completeOnProvider, hold, ledgerOf, paymentsOf } from '../money-helpers';
it('DEV story/session-done: the first session took place and the review opens', async () => {
  const api = await startApi();
  const owner = new Client(api);
  await owner.signIn(PHONES.owner);
  const teacher = new Client(api);
  await teacher.signIn(PHONES.teacher);
  let d = addDays(cairoToday(), 1);
  while (isoWeekday(d) !== 6) d = addDays(d, 1);
  const rq = await teacher.call<{ id: string }>('POST', '/v1/room-requests', {
    hallId: demoId('hall-nour-1'),
    slots: [{ weekday: 6, start: '16:00', end: '18:00' }],
    groupId: null,
    subjectId: demoId('sub-math'),
    schoolYearId: demoId('sy-sec2'),
    expectedStudents: 20,
    startsOn: d,
  });
  const ap = await owner.call<{ bookingId: string }>(
    'POST',
    `/v1/room-requests/${rq.body.id}/approve`,
    {},
  );
  const st = (await fetch(`${api.base}/__demo/story`).then((r) => r.json())) as {
    bookingId: string;
  };
  const g = await teacher.call<{ id: string }>('POST', '/v1/groups', {
    bookingId: st.bookingId,
    subjectId: demoId('sub-math'),
    schoolYearId: demoId('sy-sec2'),
    monthlyFeePt: 55000,
    sessionFeePt: 15000,
    seatCap: 24,
    offersMonthlyRecurring: true,
  });
  const parent = new Client(api);
  await parent.signIn(PHONES.parent);
  const grp = await parent.call<{ upcomingSessions: { id: string }[] }>(
    'GET',
    `/v1/groups/${g.body.id}`,
  );
  const h = await hold(parent, {
    groupId: g.body.id,
    studentId: MARIAM,
    firstSessionId: grp.body.upcomingSessions[0]!.id,
  });
  const co = await checkout(parent, h.body.id, 'card');
  await completeOnProvider(co.body.checkoutUrl!, 'succeeded');
  const r = await fetch(`${api.base}/__demo/story/session-done`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const body = (await r.json()) as { sessionsDone: number; enrolmentId: string };
  const e = await parent.call<{ canReview: boolean; firstSessionStarted: boolean }>(
    'GET',
    `/v1/enrolments/${h.body.id}`,
  );
  // P2: the first session started, so the release job moves the teacher's share to available.
  await api.s.money.releaseDue();
  const [pay] = await paymentsOf(api, h.body.id);
  const lines = await ledgerOf(api, pay!.id);
  writeFileSync(join(tmpdir(), 'link-r2b-story-ledger.json'), JSON.stringify(lines, null, 1));
  expect(lines.map((l) => [l.kind, l.code.split(':')[0], l.debit, l.credit])).toEqual([
    ['payment_captured', 'provider_clearing', 55_000, 0],
    ['payment_captured', 'link_revenue', 0, 2_750],
    ['payment_captured', 'teacher_pending', 0, 52_250],
    ['funds_released', 'teacher_pending', 52_250, 0],
    ['funds_released', 'teacher_available', 0, 52_250],
  ]);
  await api.close();
  expect([ap.status, r.status, body.sessionsDone, body.enrolmentId]).toEqual([
    200,
    200,
    1,
    h.body.id,
  ]);
  expect(e.body).toMatchObject({ firstSessionStarted: true, canReview: true });
}, 120000);
