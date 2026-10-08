/**
 * The connected story (Step 2B): one shared story across the three roles on the shared mock
 * server. Ms Salma rents a Saturday slot at مركز النور, opens "Maths · Secondary 2" there, the
 * parent books Mariam a seat and pays, Link's fee and commission show on their own lines, the
 * parent reviews after the first session, and — with the Follow-up extra — two absences raise a
 * follow-up that ends in an approved update to the parent. Demo only (the `/__demo/story/*` calls).
 *
 * "Jump to step N" replays steps 1 … N−1 through the same functions the screens call, so any step
 * can start from a known state. "Simulate first session done" moves only the story group's
 * calendar a week back (its booking, enrolments and records move with it), so every date-based
 * rule — reviews after the first session, records of past sessions, consecutive absences — runs on
 * real dates instead of a faked clock.
 */
import type { NewGroupBody, RoomRequestBody } from '@link/api-client';
import * as db from '../db';
import * as fu from '../followup/db';
import * as mk from '../market/logic';
import { addDays, cairoToday, isoWeekday } from '../time';

export const STORY = {
  centreId: 'cen-nour',
  hallId: 'hall-nour-1',
  weekday: 6, // Saturday
  start: '16:00',
  end: '18:00',
  teacherKey: 'tch-salma',
  teacherUser: 'usr-salma',
  ownerUser: 'usr-owner',
  receptionUser: 'usr-reception',
  parentUser: 'usr-parent',
  child: 'chd-mariam',
  secondChild: 'chd-youssef',
  subjectId: 'sub-math',
  schoolYearId: 'sy-sec2',
  expectedStudents: 20,
  monthlyFeePt: 55_000,
  sessionFeePt: 15_000,
  seatCap: 24,
} as const;

export const STORY_STEPS = 9;
const EN = 'en' as const;
let seq = 0;
const key = (what: string) => `story-${what}-${Date.now()}-${++seq}`;

/** The first Saturday at least three days ahead (as J02 picks it: time to tell parents). */
function firstSaturday(): string {
  for (let i = 3; i < 10; i++) {
    const d = addDays(cairoToday(), i);
    if (isoWeekday(d) === STORY.weekday) return d;
  }
  return addDays(cairoToday(), 3);
}

// ── what the story has created so far ────────────────────────────────────────────
const storyRequest = () =>
  db
    .market()
    .requests.filter(
      (r) =>
        r.teacherKey === STORY.teacherKey &&
        r.hallId === STORY.hallId &&
        r.weekdays.includes(STORY.weekday) &&
        r.start === STORY.start,
    )
    .at(-1);
const storyBooking = () => {
  const r = storyRequest();
  return r?.bookingId ? db.market().bookings.find((b) => b.id === r.bookingId) : undefined;
};
const storyGroupId = () => storyBooking()?.groupId ?? null;
const storyEnrolment = (studentId: string) =>
  db
    .enrolmentRows()
    .filter((e) => e.groupId === storyGroupId() && e.studentId === studentId)
    .at(-1);

/** For the Demo controls: where the story is, and the ids the screens and tests need. */
export function storyState() {
  const groupId = storyGroupId();
  const past = groupId ? db.sessionsOf(groupId).filter((x) => x.date < cairoToday()).length : 0;
  return {
    requestId: storyRequest()?.id ?? null,
    stage: storyRequest()?.stage ?? null,
    bookingId: storyBooking()?.id ?? null,
    groupId,
    enrolmentId: storyEnrolment(STORY.child)?.id ?? null,
    sessionsDone: past,
    followupExtra: mk.features(STORY.centreId).followupExtra,
  };
}

// ── reset ──────────────────────────────────────────────────────────────────────
/**
 * "Reset story": the sample scenario with the marketplace, Phase 2 and the Follow-up extra on.
 * Ms Salma's existing group gets its latest record (everyone present), so the story group's first
 * session is the record Today asks for in step 8.
 */
export function resetStory() {
  db.resetMockDb();
  fu.resetFollowupDb();
  fu.setDemo({
    phase2: true,
    marketplace: true,
    offline: false,
    sttDown: false,
    confirmFault: null,
    realStt: false,
  });
  mk.setFeatures(STORY.centreId, { followupExtra: true });
  const due = fu.teacherToday(STORY.teacherUser, EN).recordDue;
  if (due) confirmRecordWith(due.groupId, due.sessionId, () => 'present');
  return storyState();
}

function confirmRecordWith(
  groupId: string,
  sessionId: string,
  attendance: (studentId: string) => 'present' | 'absent',
) {
  const { record } = fu.openRecord(STORY.teacherUser, groupId, sessionId, EN);
  fu.saveDraft(
    STORY.teacherUser,
    record.id,
    {
      entries: record.entries.map((e) => ({
        studentId: e.student.id,
        attendance: attendance(e.student.id),
      })),
    },
    EN,
  );
  return fu.confirmRecord(STORY.teacherUser, record.id, key('confirm'), EN);
}

// ── the steps, as the screens do them ──────────────────────────────────────────
/** 1 · J01 → J02: Ms Salma requests Room 1, Saturday 4 PM, for a new Maths · Secondary 2 group. */
function step1() {
  const body: RoomRequestBody = {
    hallId: STORY.hallId,
    slots: [{ weekday: STORY.weekday, start: STORY.start, end: STORY.end }],
    groupId: null,
    subjectId: STORY.subjectId,
    schoolYearId: STORY.schoolYearId,
    expectedStudents: STORY.expectedStudents,
    startsOn: firstSaturday(),
  };
  mk.createRequest(STORY.teacherKey, body, EN);
}
/** 2 · C06: the owner moves it through Phone call and Meeting, then approves (C03: Booked). */
function step2() {
  const r = storyRequest()!;
  mk.moveRequest(r.id, 'phone_call', undefined, EN);
  mk.moveRequest(r.id, 'meeting', undefined, EN);
  mk.approveRequest(r.id, EN);
}
/** 3 · J05: she opens the group with both fees and 24 seats (Room 1 has 24). */
function step3() {
  const body: NewGroupBody = {
    bookingId: storyBooking()!.id,
    subjectId: STORY.subjectId,
    schoolYearId: STORY.schoolYearId,
    monthlyFeePt: STORY.monthlyFeePt,
    sessionFeePt: STORY.sessionFeePt,
    seatCap: STORY.seatCap,
    offersMonthlyRecurring: true,
  };
  mk.createGroup(STORY.teacherKey, body);
}
/** 4 · P06 → P08: Mariam's month paid by card; Youssef's session reserved with Fawry (held). */
function step4() {
  const groupId = storyGroupId()!;
  const first = db.groupDto(groupId, EN).upcomingSessions[0]!;
  const card = db.createEnrolment(
    STORY.parentUser,
    {
      groupId,
      studentId: STORY.child,
      paymentPlan: 'single_month',
      firstSessionId: first.id,
      sharePhone: false,
    },
    key('enrol'),
    EN,
  );
  const pay = db.checkout(card.dto.id, STORY.parentUser, 'card');
  if (pay.kind === 'redirect')
    db.completeMockPayment(pay.checkoutUrl.split('/').pop()!, 'succeeded');
  db.settlePayments();
  const fawry = db.createEnrolment(
    STORY.parentUser,
    {
      groupId,
      studentId: STORY.secondChild,
      paymentPlan: 'per_session',
      sessionId: first.id,
      sharePhone: false,
    },
    key('enrol'),
    EN,
  );
  db.checkout(fawry.dto.id, STORY.parentUser, 'fawry');
}
/** 7 · P10 → C04: after the first session the parent reviews Ms Salma; the owner replies. */
function step7() {
  if (storyState().sessionsDone < 1) simulateSessionDone();
  const enr = storyEnrolment(STORY.child)!;
  const r = db.createReview(
    STORY.parentUser,
    {
      enrolmentId: enr.id,
      targetType: 'teacher',
      stars: 5,
      tags: ['explains_clearly'],
      body: 'Ms Salma explains every step and checks that Mariam understood.',
      visibility: 'public',
    },
    key('review'),
  );
  mk.replyReview(r.dto.id, 'Thank you — we are glad Mariam is enjoying the group.');
}
/**
 * 8 · Follow-up: two records with Mariam absent raise the flag; Reception (assigned) drafts the
 * update, approves it, it is delivered (P09), and Reception logs the outcome.
 */
function step8() {
  const groupId = storyGroupId()!;
  const absent = (id: string) => (id === STORY.child ? 'absent' : 'present');
  while (storyState().sessionsDone < 2) simulateSessionDone();
  for (const s of db
    .sessionsOf(groupId)
    .filter((x) => x.date < cairoToday())
    .slice(-2))
    confirmRecordWith(groupId, s.id, absent);
  const c = fu
    .listCases(STORY.receptionUser, EN)
    .find((x) => x.student.id === STORY.child && x.status !== 'resolved')!;
  const msg = fu.createDraft(STORY.receptionUser, { caseId: c.id }, EN);
  fu.approveMessage(STORY.receptionUser, msg.id, { checked: true }, EN);
  fu.providerEvent('advance', msg.id);
  fu.providerEvent('advance', msg.id);
  fu.addAttempt(
    STORY.receptionUser,
    c.id,
    { channel: 'phone', result: 'reached', learned: 'Mariam was ill; back on Saturday.' },
    EN,
  );
}
const STEPS: Record<number, () => void> = {
  1: step1,
  2: step2,
  3: step3,
  4: step4,
  5: () => {}, // 5 · J06, J07: the teacher looks — nothing to do.
  6: () => {}, // 6 · C07: the owner looks — nothing to do.
  7: step7,
  8: step8,
};

/** "Jump to step N": a fresh story with steps 1 … N−1 done, ready for step N. */
export function jumpToStep(n: number) {
  if (!Number.isInteger(n) || n < 1 || n > STORY_STEPS)
    throw new db.MockProblem(422, 'invalid_step', `Steps go from 1 to ${STORY_STEPS}.`);
  resetStory();
  for (let k = 1; k < n; k++) STEPS[k]?.();
  // Step 7 starts after the first session; step 8 with it already recorded-ready.
  if (n === 7 && storyState().sessionsDone < 1) simulateSessionDone();
  return storyState();
}

// ── "Simulate first session done" ──────────────────────────────────────────────
/**
 * Moves the story group's calendar back so its next session has taken place: the first press
 * makes the first session last Saturday, the next press the second one, and so on. The booking,
 * the enrolments (their covered sessions) and the records move with it.
 */
export function simulateSessionDone() {
  const groupId = storyGroupId();
  if (!groupId)
    throw new db.MockProblem(409, 'no_story_group', 'Open the story group first (step 3).');
  const today = cairoToday();
  const next = db.sessionsOf(groupId).find((x) => x.date >= today);
  if (!next) throw new db.MockProblem(409, 'no_session', 'No upcoming session to complete.');
  let target = addDays(today, -1);
  while (isoWeekday(target) !== STORY.weekday) target = addDays(target, -1);
  const days = Math.round((Date.parse(next.date) - Date.parse(target)) / 86_400_000);
  mk.shiftOpenedGroup(groupId, days);
  db.shiftGroupEnrolments(groupId, days);
  fu.shiftGroupRecords(groupId, days);
  return storyState();
}

/** Step 9: the Follow-up extra on or off for the centre (OD-58). */
export function setStoryExtra(on: boolean) {
  mk.setFeatures(STORY.centreId, { followupExtra: on });
  return storyState();
}
