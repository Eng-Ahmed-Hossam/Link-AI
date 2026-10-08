/**
 * Marketplace operations on the mock database (Batches 2–3). Money is integer piasters; Link's fee
 * is computed exactly and rounded DOWN to a whole piaster (OD-16); the payee keeps the fraction.
 * Rates come from `RATES` (OD-01 rent fee 5%, OD-02 booking commission 5%), never typed into a
 * screen. Every total and net amount is computed from the bookings, groups and enrolments here.
 */
import type {
  AutoApproveRules,
  CentreApplicationBody,
  CentreFeatures,
  CentreProfileEdit,
  CentreSchedule,
  Earnings,
  GroupPatch,
  Hall,
  HallPatch,
  Money,
  NewGroupBody,
  RentEstimate,
  RentEstimateBody,
  RentIncome,
  RentIncomeRow,
  RentRule,
  RequestStage,
  ReviewReceived,
  ReviewTab,
  ReviewsReceived,
  RoomRequest,
  RoomRequestBody,
  RoomSearchResult,
  ScheduleCell,
  TeacherBooking,
  TeacherEnrolment,
  TeacherSelf,
  TeacherSelfPatch,
  WeeklySlot,
  NewHallBody,
} from '@link/api-client';
import { formatClock, formatWeekdays } from '@link/i18n';
import * as fx from '../data';
import * as db from '../db';
import { addDays, cairoToUtc, cairoToday, isoWeekday } from '../time';
import * as mfx from './data';
import type { BookingRow, HallRow, RequestRow } from './seed';

type Lang = db.Lang;
const tr = (l: fx.L, lang: Lang) => l[lang];
const money = (amountPt: number): Money => ({ amountPt, currency: 'EGP' });
const fail = (status: number, code: string, detail: string): never => {
  throw new db.MockProblem(status, code, detail);
};

/** Commission rules (docs/13): OD-01 rent fee 5% of hall rent, OD-02 booking commission 5%. */
export const RATES = { rentFeePercent: 5, bookingCommissionPercent: 5 };
/** Link's fee: exact, then rounded down to a whole piaster (OD-16). */
export const feeOf = (amountPt: number, percent: number) => Math.floor((amountPt * percent) / 100);

// ── slots ───────────────────────────────────────────────────────────────────────
/** The hall grid (C05): Saturday to Thursday, 2-hour slots from 2 PM. */
export const SLOT_DAYS = [6, 7, 1, 2, 3, 4];
export const SLOT_TIMES = ['14:00', '16:00', '18:00', '20:00'];
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const plus2h = (t: string) => `${String(Number(t.slice(0, 2)) + 2).padStart(2, '0')}:${t.slice(3)}`;
const overlaps = (a0: string, a1: string, b0: string, b1: string) =>
  mins(a0) < mins(b1) && mins(b0) < mins(a1);

const m = () => db.market();
const hallRow = (id: string) =>
  m().halls.find((h) => h.id === id) ?? fail(404, 'not_found', 'Hall not found.');
const centreFx = (id: string) => fx.centres.find((c) => c.id === id)!;

function slotTaken(hallId: string, weekday: number, start: string, end: string, except?: string) {
  return m().bookings.some(
    (b) =>
      b.hallId === hallId &&
      b.id !== except &&
      b.weekdays.includes(weekday) &&
      overlaps(b.start, b.end, start, end),
  );
}
function slotState(h: HallRow, weekday: number, start: string): 'free' | 'taken' | 'closed' {
  if (slotTaken(h.id, weekday, start, plus2h(start))) return 'taken';
  if (!h.listed || h.closed.includes(`${weekday}|${start}`)) return 'closed';
  return 'free';
}
const grid = (h: HallRow) =>
  SLOT_DAYS.flatMap((weekday) =>
    SLOT_TIMES.map((start) => ({
      weekday,
      start,
      end: plus2h(start),
      state: slotState(h, weekday, start),
    })),
  );

const ruleDto = (h: HallRow): RentRule => ({
  basis: h.rule.basis,
  amount: h.rule.amountPt === null ? null : money(h.rule.amountPt),
  percent: h.rule.percent,
});

export function hallDto(h: HallRow, lang: Lang): Hall {
  const slots = grid(h);
  return {
    id: h.id,
    centreId: h.centreId,
    name: tr(h.name, lang),
    capacity: h.capacity,
    facilities: [...h.facilities],
    rentRule: ruleDto(h),
    listed: h.listed,
    slots,
    freeSlotsPerWeek: slots.filter((s) => s.state === 'free').length,
    photo: h.photo,
  };
}

export const centreHalls = (centreId: string, lang: Lang) =>
  m()
    .halls.filter((h) => h.centreId === centreId)
    .map((h) => hallDto(h, lang));

/** C05: one rent rule per hall; the seat count can't go below a group's seat cap. */
export function patchHall(hallId: string, p: HallPatch, lang: Lang): Hall {
  const h = hallRow(hallId);
  if (p.capacity !== undefined) {
    if (!Number.isInteger(p.capacity) || p.capacity < 1 || p.capacity > 500)
      fail(422, 'invalid_capacity', 'Seats must be a whole number from 1 to 500.');
    const biggest = Math.max(
      0,
      ...m()
        .bookings.filter((b) => b.hallId === h.id && b.groupId)
        .map((b) => db.allGroups().find((g) => g.id === b.groupId)?.seatCap ?? 0),
    );
    if (p.capacity < biggest)
      fail(409, 'capacity_below_group', `A group in this hall has ${biggest} seats.`);
    h.capacity = p.capacity;
  }
  if (p.name !== undefined) {
    const name = p.name.trim();
    if (!name) fail(422, 'invalid_name', 'Give the hall a name.');
    h.name = { en: name, ar: name };
  }
  if (p.facilities) h.facilities = [...new Set(p.facilities)];
  if (p.listed !== undefined) h.listed = p.listed;
  if (p.rentRule) {
    const r = p.rentRule;
    if (r.basis === 'percent_of_fees') {
      if (!r.percent || !Number.isInteger(r.percent) || r.percent < 1 || r.percent > 60)
        fail(422, 'invalid_percent', 'Share of fees: a whole percentage from 1 to 60.');
      h.rule = { basis: r.basis, amountPt: null, percent: r.percent! };
    } else {
      if (!r.amountPt || !Number.isInteger(r.amountPt) || r.amountPt < 100)
        fail(422, 'invalid_amount', 'Rent must be at least EGP 1.');
      h.rule = { basis: r.basis, amountPt: r.amountPt!, percent: null };
    }
  }
  if (p.closedSlots) h.closed = p.closedSlots.map((s) => `${s.weekday}|${s.start}`);
  db.persist();
  return hallDto(h, lang);
}

/** CF-44: the owner adds a hall (listed, every slot of the grid offered). */
export function addHall(centreId: string, b: NewHallBody, lang: Lang): Hall {
  const name = b.name?.trim();
  if (!name) fail(422, 'invalid_name', 'Give the hall a name.');
  if (!Number.isInteger(b.capacity) || b.capacity < 1 || b.capacity > 500)
    fail(422, 'invalid_capacity', 'Seats must be a whole number from 1 to 500.');
  const h: HallRow = {
    id: `hall-new-${++m().seq}`,
    centreId,
    name: { en: name!, ar: name! },
    roomLabel: name!,
    capacity: b.capacity,
    facilities: [...new Set(b.facilities ?? [])],
    rule: { basis: 'fixed_per_session', amountPt: 100, percent: null },
    listed: true,
    closed: [],
    photo: m().halls.filter((x) => x.centreId === centreId).length % 4,
  };
  m().halls.push(h);
  // The rent rule goes through the same checks as an edit (C05).
  try {
    return patchHall(h.id, { rentRule: b.rentRule }, lang);
  } catch (e) {
    m().halls.pop();
    throw e;
  }
}

/** The centre's location: a moved pin is under review until Link ops verify it (CF-44). */
export function centreLocation(centreId: string, lang: Lang) {
  const c = centreFx(centreId);
  const moved = m().centreEdits[centreId]?.location;
  return moved ?? { lat: c.lat, lng: c.lng, address: tr(c.address, lang), underReview: false };
}
export function moveCentrePin(
  centreId: string,
  p: { lat: number; lng: number; address: string },
  lang: Lang,
) {
  const address = p.address?.trim();
  if (!address || address.length > 200) fail(422, 'invalid_address', 'Write the address.');
  // Egypt, roughly: the pin must be on the map Link serves.
  if (!(p.lat >= 22 && p.lat <= 32 && p.lng >= 24.5 && p.lng <= 37))
    fail(422, 'invalid_location', 'Put the pin in Egypt.');
  m().centreEdits[centreId] = {
    ...(m().centreEdits[centreId] ?? {}),
    location: { lat: p.lat, lng: p.lng, address: address!, underReview: true },
  };
  db.persist();
  return centreProfile(centreId, lang);
}
/** Link ops checked the new location (the ops console is later; the demo has a control). */
export function verifyCentreLocation(centreId: string) {
  const loc = m().centreEdits[centreId]?.location;
  if (loc) loc.underReview = false;
  db.persist();
  return { ok: true as const };
}

// ── people ──────────────────────────────────────────────────────────────────────
function ratingOf(dist: number[]): { rating: number | null; count: number } {
  const count = dist.reduce((a, b) => a + b, 0);
  if (!count) return { rating: null, count: 0 };
  const sum = dist.reduce((a, n, i) => a + n * (5 - i), 0);
  return { rating: Math.round((sum / count) * 10) / 10, count };
}
export function teacherInfo(key: string, lang: Lang) {
  const tch = fx.teachers.find((x) => x.id === key);
  if (tch) {
    const r = ratingOf(tch.ratingDist);
    return {
      id: key,
      name: tr(tch.name, lang),
      rating: r.rating,
      reviewCount: r.count,
      verifiedId: tch.verified,
      isNew: false,
    };
  }
  const a =
    mfx.applicants.find((x) => x.id === key) ?? fail(404, 'not_found', 'Teacher not found.');
  return {
    id: key,
    name: tr(a.name, lang),
    rating: a.rating,
    reviewCount: a.reviewCount,
    verifiedId: a.verifiedId,
    isNew: a.isNew,
  };
}
const subjectName = (id: string, lang: Lang) =>
  tr(fx.subjects.find((s) => s.id === id)!.name, lang);
const yearShort = (id: string, lang: Lang) =>
  tr(fx.schoolYears.find((y) => y.id === id)!.short, lang);
const groupLabel = (g: fx.GroupFx, lang: Lang) =>
  `${subjectName(g.subjectId, lang)} • ${yearShort(g.schoolYearId, lang)}`;

// ── requests (C06, J02, J03) ────────────────────────────────────────────────────
export const autoApprove = (centreId: string): AutoApproveRules =>
  m().autoApprove[centreId] ?? {
    enabled: false,
    verifiedId: true,
    minRating: 4.5,
    fitsCapacity: true,
  };
export function putAutoApprove(centreId: string, r: AutoApproveRules) {
  if (!(r.minRating >= 1 && r.minRating <= 5)) fail(422, 'invalid_rating', 'Rating from 1 to 5.');
  m().autoApprove[centreId] = { ...r };
  db.persist();
  return autoApprove(centreId);
}

function checksOf(
  r: Pick<
    RequestRow,
    'hallId' | 'teacherKey' | 'weekdays' | 'start' | 'end' | 'expectedStudents' | 'bookingId'
  >,
) {
  const h = hallRow(r.hallId);
  const rules = autoApprove(h.centreId);
  const who = teacherInfo(r.teacherKey, 'en');
  const checks = {
    verifiedId: who.verifiedId,
    rating: who.rating !== null && who.rating >= rules.minRating,
    fitsCapacity: r.expectedStudents <= h.capacity,
    slotFree: r.weekdays.every(
      (d) => !slotTaken(h.id, d, r.start, r.end, r.bookingId ?? undefined),
    ),
  };
  const meetsRules =
    (!rules.verifiedId || checks.verifiedId) &&
    checks.rating &&
    (!rules.fitsCapacity || checks.fitsCapacity) &&
    checks.slotFree;
  return { checks, meetsRules };
}

export function requestDto(r: RequestRow, lang: Lang): RoomRequest {
  const h = hallRow(r.hallId);
  const c = centreFx(h.centreId);
  return {
    id: r.id,
    centre: { id: c.id, name: tr(c.name, lang), area: tr(c.area, lang) },
    hall: { id: h.id, name: tr(h.name, lang), capacity: h.capacity },
    teacher: teacherInfo(r.teacherKey, lang),
    subject: subjectName(r.subjectId, lang),
    schoolYear: yearShort(r.schoolYearId, lang),
    weekdays: r.weekdays,
    start: r.start,
    end: r.end,
    expectedStudents: r.expectedStudents,
    startsOn: r.startsOn,
    stage: r.stage,
    stageAt: r.stageAt,
    ...checksOf(r),
    rentRule: ruleDto(h),
    declinedReason: r.declinedReason,
    createdAt: r.createdAt,
  };
}

const reqRow = (id: string) =>
  m().requests.find((r) => r.id === id) ?? fail(404, 'not_found', 'Request not found.');

export const centreRequests = (centreId: string, lang: Lang) =>
  m()
    .requests.filter((r) => hallRow(r.hallId).centreId === centreId && r.stage !== 'withdrawn')
    .map((r) => requestDto(r, lang));

export const myRequests = (teacherKey: string, lang: Lang) =>
  m()
    .requests.filter((r) => r.teacherKey === teacherKey)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => requestDto(r, lang));

/** C06 columns run one way: Requested → Phone call → Meeting → Approved. */
const ORDER: RequestStage[] = ['requested', 'phone_call', 'meeting', 'approved'];
export function moveRequest(
  id: string,
  stage: 'phone_call' | 'meeting',
  at: string | undefined,
  lang: Lang,
) {
  const r = reqRow(id);
  if (!ORDER.includes(r.stage) || r.stage === 'approved')
    fail(409, 'request_closed', 'This request is already decided.');
  if (ORDER.indexOf(stage) <= ORDER.indexOf(r.stage))
    fail(409, 'stage_backwards', 'A request only moves forward.');
  r.stage = stage;
  r.stageAt = at ?? null;
  db.persist();
  return requestDto(r, lang);
}

function book(r: RequestRow): BookingRow {
  const b: BookingRow = {
    id: `bk-${r.id}`,
    hallId: r.hallId,
    teacherKey: r.teacherKey,
    weekdays: [...r.weekdays],
    start: r.start,
    end: r.end,
    startsOn: r.startsOn,
    groupId: null,
    requestId: r.id,
  };
  m().bookings.push(b);
  r.bookingId = b.id;
  r.stage = 'approved';
  return b;
}

/** Approve → the booking exists; the slot shows as Booked on C03 (MKT-HAL-04). */
export function approveRequest(id: string, lang: Lang) {
  const r = reqRow(id);
  if (r.stage === 'approved') return requestDto(r, lang);
  if (!ORDER.includes(r.stage))
    fail(409, 'request_closed', 'This request was declined or withdrawn.');
  if (!checksOf(r).checks.slotFree) fail(409, 'slot_taken', 'Another teacher has this slot now.');
  book(r);
  db.persist();
  return requestDto(r, lang);
}

export function declineRequest(id: string, reason: string, lang: Lang) {
  const r = reqRow(id);
  if (!reason?.trim()) fail(422, 'reason_required', 'Give the teacher a reason.');
  if (r.stage === 'approved') fail(409, 'request_closed', 'An approved request is a booking now.');
  r.stage = 'declined';
  r.declinedReason = reason.trim();
  db.persist();
  return requestDto(r, lang);
}

export function withdrawRequest(id: string, teacherKey: string, lang: Lang) {
  const r = reqRow(id);
  if (r.teacherKey !== teacherKey) fail(404, 'not_found', 'Request not found.');
  if (r.stage === 'approved' || r.stage === 'declined')
    fail(409, 'request_closed', 'This request is already decided.');
  r.stage = 'withdrawn';
  db.persist();
  return requestDto(r, lang);
}

/** J02: a request for free, listed slots; auto-approved at once only when the centre switched it on. */
export function createRequest(teacherKey: string, b: RoomRequestBody, lang: Lang) {
  const h = hallRow(b.hallId);
  if (!h.listed) fail(409, 'hall_not_listed', 'This hall is not taking requests.');
  if (!b.slots.length) fail(422, 'no_slots', 'Pick at least one free slot.');
  const start = b.slots[0]!.start;
  if (b.slots.some((s) => s.start !== start))
    fail(422, 'mixed_times', 'Pick slots at the same time of day.');
  for (const s of b.slots)
    if (slotState(h, s.weekday, s.start) !== 'free')
      fail(409, 'slot_taken', 'That slot is not free now.');
  if (!(b.expectedStudents >= 1)) fail(422, 'invalid_students', 'How many students do you expect?');
  const r: RequestRow = {
    id: `req-${++m().seq}`,
    hallId: h.id,
    teacherKey,
    subjectId: b.subjectId,
    schoolYearId: b.schoolYearId,
    weekdays: b.slots.map((s) => s.weekday),
    start,
    end: plus2h(start),
    expectedStudents: b.expectedStudents,
    startsOn: b.startsOn,
    stage: 'requested',
    stageAt: null,
    createdAt: new Date().toISOString(),
    declinedReason: null,
    bookingId: null,
  };
  m().requests.push(r);
  if (autoApprove(h.centreId).enabled && checksOf(r).meetsRules) book(r);
  db.persist();
  return requestDto(r, lang);
}

// ── groups, seats and money ─────────────────────────────────────────────────────
const groupById = (id: string) => db.allGroups().find((g) => g.id === id);
/** Students in the group's next session (seats filled), counted from the seats data. */
export function studentsOf(groupId: string): number {
  const d = db.groupDto(groupId, 'en');
  const next = d.upcomingSessions[0];
  return next ? next.seatCap - next.seatsLeft : 0;
}
const monthOf = (date: string) => date.slice(0, 7);
/** Sessions in a calendar month on these weekdays, from `from` on. */
export function sessionsInMonth(weekdays: number[], from: string, month: string): number {
  let n = 0;
  for (let d = `${month}-01`; monthOf(d) === month; d = addDays(d, 1))
    if (d >= from && weekdays.includes(isoWeekday(d))) n++;
  return n;
}
/** What parents pay the group in a month: monthly plan per student, else per session. */
export function groupFeesPt(g: fx.GroupFx, month: string): number {
  const students = studentsOf(g.id);
  return g.offersMonthlyRecurring
    ? students * g.monthlyFeePt
    : students * g.sessionFeePt * sessionsInMonth(g.weekdays, `${month}-01`, month);
}
function bookingRent(b: BookingRow, month: string) {
  const h = hallRow(b.hallId);
  const sessions = sessionsInMonth(b.weekdays, b.startsOn, month);
  const g = b.groupId ? groupById(b.groupId) : undefined;
  const students = g ? studentsOf(g.id) : 0;
  let rent: number;
  let feesBase: number | null = null;
  if (h.rule.basis === 'fixed_per_session') rent = (h.rule.amountPt ?? 0) * sessions;
  else if (h.rule.basis === 'per_student_per_session')
    rent = (h.rule.amountPt ?? 0) * students * sessions;
  else {
    feesBase = g ? groupFeesPt(g, month) : 0;
    rent = Math.floor((feesBase * (h.rule.percent ?? 0)) / 100);
  }
  return { sessions, studentSessions: students * sessions, rent, feesBase };
}
/** The next Thursday after today (weekly payouts, OD-04). */
export function nextThursday(from = cairoToday()): string {
  let d = addDays(from, 1);
  while (isoWeekday(d) !== 4) d = addDays(d, 1);
  return d;
}

// ── schedule (C03) ──────────────────────────────────────────────────────────────
export function centreSchedule(centreId: string, lang: Lang): CentreSchedule {
  const today = cairoToday();
  const hs = m().halls.filter((h) => h.centreId === centreId);
  const dates: Record<number, string> = {};
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    if (SLOT_DAYS.includes(isoWeekday(d))) dates[isoWeekday(d)] = d;
  }
  const cells: ScheduleCell[] = [];
  const teachers = new Set<string>();
  const fill: number[] = [];
  for (const b of m().bookings.filter((x) => hs.some((h) => h.id === x.hallId))) {
    teachers.add(b.teacherKey);
    const g = b.groupId ? groupById(b.groupId) : undefined;
    const started = b.startsOn <= today;
    const seats = g ? { filled: studentsOf(g.id), cap: g.seatCap } : null;
    if (seats && started) fill.push(seats.filled / seats.cap);
    for (const weekday of b.weekdays)
      cells.push({
        hallId: b.hallId,
        weekday,
        start: b.start,
        end: b.end,
        kind: g && started ? 'teaching' : 'booked',
        teacher: teacherInfo(b.teacherKey, lang).name,
        group: g ? groupLabel(g, lang) : null,
        seats,
        startsOn: started ? null : b.startsOn,
        rentRule: null,
      });
  }
  let open = 0;
  let taken = 0;
  let free = 0;
  for (const h of hs.filter((x) => x.listed))
    for (const s of grid(h)) {
      if (s.state === 'closed') continue;
      open++;
      if (s.state === 'taken') taken++;
      else {
        free++;
        cells.push({
          hallId: h.id,
          weekday: s.weekday,
          start: s.start,
          end: s.end,
          kind: 'free',
          teacher: null,
          group: null,
          seats: null,
          startsOn: null,
          rentRule: ruleDto(h),
        });
      }
    }
  return {
    // The next six working days from today, in date order (the centre's week has no Friday).
    days: [...SLOT_DAYS].sort((a, b) => (dates[a] ?? '').localeCompare(dates[b] ?? '')),
    dates,
    halls: hs.map((h) => ({ id: h.id, name: tr(h.name, lang), capacity: h.capacity })),
    cells,
    stats: {
      roomUsePercent: open ? Math.round((taken / open) * 100) : 0,
      freeSlots: free,
      averageSeatsFilledPercent: fill.length
        ? Math.round((fill.reduce((a, b) => a + b, 0) / fill.length) * 100)
        : 0,
      teachersRenting: teachers.size,
    },
  };
}

// ── rent income (C07) ───────────────────────────────────────────────────────────
export function rentIncome(centreId: string, lang: Lang): RentIncome {
  const today = cairoToday();
  const month = monthOf(today);
  const pct = RATES.rentFeePercent;
  const hs = m().halls.filter((h) => h.centreId === centreId);
  const rows: RentIncomeRow[] = [];
  for (const b of m().bookings.filter((x) => hs.some((h) => h.id === x.hallId))) {
    const r = bookingRent(b, month);
    if (!r.sessions) continue;
    const h = hallRow(b.hallId);
    const fee = feeOf(r.rent, pct);
    const due = mfx.rentDue[b.teacherKey];
    rows.push({
      teacher: { id: b.teacherKey, name: teacherInfo(b.teacherKey, lang).name },
      hall: { id: h.id, name: tr(h.name, lang) },
      sessions: r.sessions,
      studentSessions: r.studentSessions,
      rentRule: ruleDto(h),
      feesBase: r.feesBase === null ? null : money(r.feesBase),
      rent: money(r.rent),
      linkFee: money(fee),
      net: money(r.rent - fee),
      paidVia: due ? 'due' : 'link',
      dueOn: due ? addDays(today, due) : null,
    });
  }
  const sum = (f: (x: RentIncomeRow) => number) => rows.reduce((a, x) => a + f(x), 0);
  const rentDue = sum((x) => x.rent.amountPt);
  const collected = sum((x) => (x.paidVia === 'link' ? x.rent.amountPt : 0));
  const linkFee = sum((x) => x.linkFee.amountPt);
  const transfer = sum((x) => (x.paidVia === 'link' ? x.net.amountPt : 0));
  return {
    month,
    feePercent: pct,
    rows,
    totals: {
      rentDue: money(rentDue),
      collected: money(collected),
      outstanding: money(rentDue - collected),
      linkFee: money(linkFee),
      net: money(rentDue - linkFee),
    },
    teachers: new Set(rows.map((r) => r.teacher.id)).size,
    halls: new Set(rows.map((r) => r.hall.id)).size,
    roomUsePercent: centreSchedule(centreId, lang).stats.roomUsePercent,
    nextTransfer: {
      on: nextThursday(today),
      amount: money(transfer),
      account: mfx.centreExtra[centreId]?.payoutAccount ?? '••••',
    },
  };
}

// ── earnings (J07) ──────────────────────────────────────────────────────────────
export function earnings(teacherKey: string, lang: Lang): Earnings {
  const month = monthOf(cairoToday());
  const pct = RATES.bookingCommissionPercent;
  const gs = db.allGroups().filter((g) => g.teacherId === teacherKey);
  const byGroup = gs.map((g) => ({
    id: g.id,
    name: `${groupLabel(g, lang)} • ${tr(centreFx(g.centreId).name, lang)}`,
    students: studentsOf(g.id),
    amount: money(groupFeesPt(g, month)),
  }));
  const parentsPaid = byGroup.reduce((a, g) => a + g.amount.amountPt, 0);
  // The commission is taken from each payment, so it is rounded per group (OD-16).
  const commission = byGroup.reduce((a, g) => a + feeOf(g.amount.amountPt, pct), 0);
  // One line per hall (each centre's rent on its own line, J07): bookings in the same hall add up.
  const perHall = new Map<string, number>();
  for (const b of m().bookings.filter((x) => x.teacherKey === teacherKey))
    perHall.set(b.hallId, (perHall.get(b.hallId) ?? 0) + bookingRent(b, month).rent);
  const rent = [...perHall]
    .filter(([, pt]) => pt > 0)
    .map(([hallId, pt]) => {
      const h = hallRow(hallId);
      return {
        centre: tr(centreFx(h.centreId).name, lang),
        hall: tr(h.name, lang),
        rule: ruleDto(h),
        amount: money(pt),
      };
    });
  const rentTotal = rent.reduce((a, r) => a + r.amount.amountPt, 0);
  const keep = parentsPaid - commission - rentTotal;
  const paid = db
    .enrolmentRows()
    .filter(
      (e) => gs.some((g) => g.id === e.groupId) && e.method && e.status !== 'pending_payment',
    );
  const methods = (['card', 'fawry', 'wallet'] as const)
    .map((method) => ({
      method,
      percent: paid.length
        ? Math.round((paid.filter((e) => e.method === method).length / paid.length) * 100)
        : 0,
    }))
    .filter((x) => x.percent > 0);
  const self = mfx.teacherSelf[teacherKey];
  return {
    month,
    keep: money(keep),
    nextPayout: {
      on: nextThursday(),
      amount: money(Math.max(0, keep)),
      account: self?.payoutAccount ?? '••••',
    },
    parentsPaid: money(parentsPaid),
    commission: money(commission),
    commissionPercent: pct,
    rent,
    rentTotal: money(rentTotal),
    byGroup,
    methods,
  };
}

/** J02 estimate: a pure calculation from the slots, students and fee. */
export function rentEstimate(teacherKey: string, b: RentEstimateBody): RentEstimate {
  const h = hallRow(b.hallId);
  const weekdays = b.slots.map((s) => s.weekday);
  const sessions = weekdays.length * 4;
  const fees = Math.max(0, Math.round(b.students)) * Math.max(0, Math.round(b.monthlyFeePt));
  const rent =
    h.rule.basis === 'fixed_per_session'
      ? (h.rule.amountPt ?? 0) * sessions
      : h.rule.basis === 'per_student_per_session'
        ? (h.rule.amountPt ?? 0) * b.students * sessions
        : Math.floor((fees * (h.rule.percent ?? 0)) / 100);
  const commission = feeOf(fees, RATES.bookingCommissionPercent);
  const rules = autoApprove(h.centreId);
  const start = b.slots[0]?.start ?? '14:00';
  const meets = checksOf({
    hallId: h.id,
    teacherKey,
    weekdays,
    start,
    end: plus2h(start),
    expectedStudents: b.students,
    bookingId: null,
  }).meetsRules;
  return {
    sessionsPerMonth: sessions,
    fees: money(fees),
    rent: money(rent),
    commission: money(commission),
    commissionPercent: RATES.bookingCommissionPercent,
    keep: money(fees - rent - commission),
    autoApprove: { enabled: rules.enabled, meets },
  };
}

// ── teacher: rooms, profile, bookings, groups, enrolments ───────────────────────
export function searchRooms(
  q: { students?: number; weekdays?: number[]; maxKm?: number },
  lang: Lang,
): RoomSearchResult[] {
  const students = q.students ?? 0;
  return m()
    .halls.filter((h) => h.listed)
    .map((h) => {
      const c = centreFx(h.centreId);
      const freeSlots: WeeklySlot[] = grid(h)
        .filter(
          (s) => s.state === 'free' && (!q.weekdays?.length || q.weekdays.includes(s.weekday)),
        )
        .map(({ weekday, start, end }) => ({ weekday, start, end }));
      return {
        hall: {
          id: h.id,
          name: tr(h.name, lang),
          capacity: h.capacity,
          facilities: [...h.facilities],
        },
        centre: {
          id: c.id,
          name: tr(c.name, lang),
          area: tr(c.area, lang),
          distanceKm: c.distanceKm,
        },
        freeSlots,
        rentRule: ruleDto(h),
        fits: h.capacity >= students,
      };
    })
    .filter((r) => r.freeSlots.length && (q.maxKm === undefined || r.centre.distanceKm <= q.maxKm))
    .sort((a, b) => Number(b.fits) - Number(a.fits) || a.centre.distanceKm - b.centre.distanceKm);
}

export function teacherSelf(teacherKey: string, lang: Lang): TeacherSelf {
  const tch =
    fx.teachers.find((x) => x.id === teacherKey) ?? fail(404, 'not_found', 'Teachers only.');
  const base = mfx.teacherSelf[teacherKey];
  const edits = m().teacherEdits[teacherKey] ?? {};
  const r = ratingOf(tch.ratingDist);
  return {
    id: tch.id,
    name: tr(tch.name, lang),
    subjects: base ? tr(base.subjects, lang) : '',
    yearsExperience: tch.yearsExperience,
    rating: r.rating,
    reviewCount: r.count,
    openToSlots: edits.openToSlots ?? base?.openToSlots ?? true,
    about: edits.about ?? (base ? tr(base.about, lang) : tr(tch.bio, lang)),
    verification: {
      nationalId: base?.nationalId ?? 'verified',
      degree: base?.degree ?? 'missing',
      references: { added: base?.referencesAdded ?? 0, needed: 2 },
    },
    availability: edits.availability ?? base?.availability ?? [],
    reviewEachEnrolment: db.reviewEachEnrolment(teacherKey),
    payoutAccount: base?.payoutAccount ?? '••••',
    teaches: db
      .allGroups()
      .filter((g) => g.teacherId === teacherKey)
      .map((g) => ({
        groupId: g.id,
        subjectId: g.subjectId,
        schoolYearId: g.schoolYearId,
        label: `${tr(fx.subjects.find((x) => x.id === g.subjectId)!.name, lang)} • ${yearShort(g.schoolYearId, lang)}`,
        where: `${tr(centreFx(g.centreId).name, lang)} • ${tr(g.room, lang)} • ${formatWeekdays(g.weekdays, lang)} ${formatClock(g.startTime, lang)}`,
        students: studentsOf(g.id),
        monthlyFee: money(g.monthlyFeePt),
      })),
  };
}
export function patchTeacherSelf(teacherKey: string, p: TeacherSelfPatch, lang: Lang) {
  if (p.about !== undefined && p.about.length > 600) fail(422, 'too_long', 'Up to 600 characters.');
  const { reviewEachEnrolment, ...rest } = p;
  m().teacherEdits[teacherKey] = { ...(m().teacherEdits[teacherKey] ?? {}), ...rest };
  if (reviewEachEnrolment !== undefined) db.setReviewEachEnrolment(teacherKey, reviewEachEnrolment);
  db.persist();
  return teacherSelf(teacherKey, lang);
}

export const teacherBookings = (teacherKey: string, lang: Lang): TeacherBooking[] =>
  m()
    .bookings.filter((b) => b.teacherKey === teacherKey)
    .map((b) => {
      const h = hallRow(b.hallId);
      const c = centreFx(h.centreId);
      const r = b.requestId ? m().requests.find((x) => x.id === b.requestId) : undefined;
      const subject = r ? fx.subjects.find((x) => x.id === r.subjectId) : undefined;
      return {
        id: b.id,
        centre: { id: c.id, name: tr(c.name, lang) },
        hall: { id: h.id, name: tr(h.name, lang), capacity: h.capacity },
        weekdays: b.weekdays,
        start: b.start,
        end: b.end,
        startsOn: b.startsOn,
        groupId: b.groupId,
        subjectId: r?.subjectId ?? null,
        schoolYearId: r?.schoolYearId ?? null,
        label:
          r && subject ? `${tr(subject.name, lang)} • ${yearShort(r.schoolYearId, lang)}` : null,
      };
    });

function checkFees(monthlyFeePt?: number, sessionFeePt?: number) {
  for (const v of [monthlyFeePt, sessionFeePt])
    if (v !== undefined && (!Number.isInteger(v) || v < 100 || v > 10_000_000))
      fail(422, 'invalid_fee', 'Fees must be at least EGP 1.');
}
const hallOfGroupId = (groupId: string) => {
  const b = m().bookings.find((x) => x.groupId === groupId);
  return b ? hallRow(b.hallId) : null;
};

/** J05: the teacher sets each group's fees and seats; seats ≤ the hall and ≥ seats taken. */
export function updateGroup(teacherKey: string, groupId: string, p: GroupPatch) {
  const g = groupById(groupId);
  if (!g || g.teacherId !== teacherKey) fail(404, 'not_found', 'Group not found.');
  checkFees(p.monthlyFeePt, p.sessionFeePt);
  if (p.seatCap !== undefined) {
    const hall = hallOfGroupId(groupId);
    if (!Number.isInteger(p.seatCap) || p.seatCap < 1)
      fail(422, 'invalid_seats', 'Seats: a whole number.');
    if (hall && p.seatCap > hall.capacity)
      fail(422, 'seat_cap_above_hall', `The hall has ${hall.capacity} seats.`);
    const filled = studentsOf(groupId);
    if (p.seatCap < filled)
      fail(409, 'seat_cap_below_filled', `${filled} seats are already taken.`);
  }
  m().groupEdits[groupId] = { ...(m().groupEdits[groupId] ?? {}), ...p };
  db.persist();
  return { ok: true as const };
}

/** J05 "New group" in a booked slot: fees per month and per session, seats ≤ the hall. */
export function createGroup(teacherKey: string, b: NewGroupBody) {
  const bk = m().bookings.find((x) => x.id === b.bookingId);
  if (!bk || bk.teacherKey !== teacherKey) fail(404, 'not_found', 'Booking not found.');
  if (bk!.groupId) fail(409, 'booking_has_group', 'This slot already has a group.');
  checkFees(b.monthlyFeePt, b.sessionFeePt);
  const h = hallRow(bk!.hallId);
  if (!Number.isInteger(b.seatCap) || b.seatCap < 1)
    fail(422, 'invalid_seats', 'Seats: a whole number.');
  if (b.seatCap > h.capacity) fail(422, 'seat_cap_above_hall', `The hall has ${h.capacity} seats.`);
  const id = `grp-new-${++m().seq}`;
  m().newGroups.push({
    id,
    teacherId: teacherKey,
    centreId: h.centreId,
    room: { ...h.name },
    subjectId: b.subjectId,
    curriculumId:
      fx.schoolYears.find((y) => y.id === b.schoolYearId)?.curriculumId ?? 'cur-national',
    schoolYearId: b.schoolYearId,
    weekdays: [...bk!.weekdays],
    startTime: bk!.start,
    endTime: bk!.end,
    sessionFeePt: b.sessionFeePt,
    monthlyFeePt: b.monthlyFeePt,
    sessionsPerMonth: bk!.weekdays.length * 4,
    offersMonthlyRecurring: b.offersMonthlyRecurring,
    seatCap: b.seatCap,
    takenUpcoming: [0],
    startsOn: bk!.startsOn,
  });
  bk!.groupId = id;
  db.persist();
  return { id };
}

const PLAN_OK = ['awaiting_teacher', 'confirmed', 'pending_payment', 'past_due'];
export function teacherEnrolments(teacherKey: string, lang: Lang): TeacherEnrolment[] {
  const gs = db.allGroups().filter((g) => g.teacherId === teacherKey);
  const review = db.reviewEachEnrolment(teacherKey);
  return db
    .enrolmentRows()
    .filter((e) => gs.some((g) => g.id === e.groupId) && PLAN_OK.includes(e.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((e) => {
      const g = gs.find((x) => x.id === e.groupId)!;
      const who = db.studentLabel(e.studentId, lang);
      return {
        id: e.id,
        student: who.student,
        parent: who.parent,
        group: {
          id: g.id,
          name: groupLabel(g, lang),
          centre: tr(centreFx(g.centreId).name, lang),
          room: tr(g.room, lang),
        },
        plan: e.plan,
        method: e.method,
        status: e.status,
        paid: e.payment ? money(e.payment.amountPt) : null,
        createdAt: e.createdAt,
        canDecide: review && e.status === 'awaiting_teacher',
      };
    });
}
export function decideEnrolment(teacherKey: string, id: string, accept: boolean, lang: Lang) {
  db.teacherDecide(id, teacherKey, accept);
  return teacherEnrolments(teacherKey, lang).find((x) => x.id === id) ?? null;
}

// ── centre profile, application, reviews, features ─────────────────────────────
export function centreProfile(centreId: string, lang: Lang): CentreProfileEdit {
  const c = centreFx(centreId);
  const extra = mfx.centreExtra[centreId];
  const edits = m().centreEdits[centreId] ?? {};
  const about = edits.about ?? (extra ? tr(extra.about, lang) : '');
  const photos = edits.photos ?? extra?.photos ?? 0;
  const halls = centreHalls(centreId, lang);
  const listed = halls.filter((h) => h.listed).length;
  const parts = [about.length >= 40, photos >= 3, listed > 0, true, true];
  const r = ratingOf(c.ratingDist);
  return {
    id: c.id,
    slug: c.slug,
    distanceKm: c.distanceKm,
    name: tr(c.name, lang),
    area: tr(c.area, lang),
    address: tr(c.address, lang),
    about,
    photos,
    hours:
      lang === 'ar'
        ? 'السبت–الخميس، ٢:٠٠–٩:٠٠ م · الجمعة مغلق'
        : 'Sat–Thu, 2:00–9:00 PM · Fri closed',
    liveOnMap: c.verified && listed > 0,
    verified: c.verified,
    completeness: Math.round((parts.filter(Boolean).length / parts.length) * 100),
    badges: [
      ...(c.verified ? ['verified'] : []),
      ...(features(centreId).followupExtra ? ['progress_updates'] : []),
    ],
    rating: { avg: r.rating ?? 0, count: r.count },
    teachers: new Set(
      m()
        .bookings.filter((b) => halls.some((h) => h.id === b.hallId))
        .map((b) => b.teacherKey),
    ).size,
    halls,
    location: centreLocation(centreId, lang),
  };
}
export function patchCentreProfile(
  centreId: string,
  p: { about?: string; photos?: number },
  lang: Lang,
) {
  if (p.about !== undefined && p.about.length > 600) fail(422, 'too_long', 'Up to 600 characters.');
  if (p.photos !== undefined && (p.photos < 0 || p.photos > 12))
    fail(422, 'too_many', 'Up to 12 photos.');
  m().centreEdits[centreId] = { ...(m().centreEdits[centreId] ?? {}), ...p };
  db.persist();
  return centreProfile(centreId, lang);
}

export function applyToJoin(b: CentreApplicationBody) {
  const missing = (
    ['centreName', 'governorate', 'area', 'address', 'ownerName', 'phone'] as const
  ).filter((k) => !String(b[k] ?? '').trim());
  if (missing.length) fail(422, 'validation_failed', `Missing: ${missing.join(', ')}`);
  if (!b.consent) fail(422, 'consent_required', 'Tick the box so Link can contact you.');
  const id = `app-${++m().seq}`;
  m().applications.push({ ...b, id, at: new Date().toISOString() });
  db.persist();
  return { id };
}

export const features = (centreId: string): CentreFeatures => ({
  followupExtra: m().features[centreId]?.followupExtra ?? false,
});
export function setFeatures(centreId: string, f: Partial<CentreFeatures>) {
  m().features[centreId] = { ...features(centreId), ...f };
  db.persist();
  return features(centreId);
}
/** A teacher sees Follow-up when any centre they teach at has the extra. */
export const teacherFeatures = (teacherKey: string): CentreFeatures => ({
  followupExtra: db
    .allGroups()
    .filter((g) => g.teacherId === teacherKey)
    .some((g) => features(g.centreId).followupExtra),
});

/** C04: the centre's reviews and those of the teachers renting there (public), private feedback. */
export function reviewsReceived(centreId: string, tab: ReviewTab, lang: Lang): ReviewsReceived {
  const st = m();
  const teacherIds = new Set(
    db
      .allGroups()
      .filter((g) => g.centreId === centreId)
      .map((g) => g.teacherId),
  );
  const nameOf = (kind: 'centre' | 'teacher', id: string) =>
    kind === 'centre' ? tr(centreFx(id).name, lang) : teacherInfo(id, lang).name;
  const all: ReviewReceived[] = [];
  for (const r of fx.reviews) {
    const mine =
      (r.targetType === 'centre' && r.targetId === centreId) ||
      (r.targetType === 'teacher' && teacherIds.has(r.targetId));
    if (!mine) continue;
    all.push({
      id: r.id,
      target: { kind: r.targetType, name: nameOf(r.targetType, r.targetId) },
      stars: r.stars,
      body: tr(r.body, lang),
      schoolYear: yearShort(r.schoolYearId, lang),
      createdAt: cairoToUtc(r.publishedOn, '12:00'),
      visibility: 'public',
      reply:
        st.replies[r.id] ??
        (r.reply ? { body: tr(r.reply.body, lang), at: cairoToUtc(r.publishedOn, '18:00') } : null),
      reported: st.reports[r.id] ?? null,
    });
  }
  for (const p of mfx.privateFeedback) {
    const mine =
      (p.target === 'centre' && p.targetId === centreId) ||
      (p.target === 'teacher' && teacherIds.has(p.targetId));
    if (!mine) continue;
    all.push({
      id: p.id,
      target: { kind: p.target, name: nameOf(p.target, p.targetId) },
      stars: p.stars,
      body: tr(p.body, lang),
      schoolYear: yearShort(p.schoolYearId, lang),
      createdAt: cairoToUtc(addDays(cairoToday(), -p.daysAgo), '12:00'),
      visibility: 'private',
      reply: null,
      reported: null,
    });
  }
  for (const r of db.reviewRows()) {
    const e = db.enrolmentRows().find((x) => x.id === r.enrolmentId);
    const g = e ? groupById(e.groupId) : undefined;
    if (!g || g.centreId !== centreId || r.status !== 'published') continue;
    all.push({
      id: r.id,
      target: {
        kind: r.targetType,
        name:
          r.targetType === 'centre'
            ? nameOf('centre', centreId)
            : teacherInfo(g.teacherId, lang).name,
      },
      stars: r.stars,
      body: r.body,
      schoolYear: yearShort(g.schoolYearId, lang),
      createdAt: r.createdAt ?? cairoToUtc(cairoToday(), '09:00'),
      visibility: r.visibility,
      reply: st.replies[r.id] ?? null,
      reported: st.reports[r.id] ?? null,
    });
  }
  all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const inTab = (x: ReviewReceived) =>
    tab === 'reported'
      ? !!x.reported
      : tab === 'private'
        ? x.visibility === 'private'
        : x.visibility === 'public' && !x.reported;
  const c = centreFx(centreId);
  const cr = ratingOf(c.ratingDist);
  const tags = new Map<string, number>();
  for (const r of fx.reviews.filter((x) => x.targetType === 'centre' && x.targetId === centreId))
    for (const tag of r.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  return {
    summary: {
      centre: { rating: cr.rating ?? 0, count: cr.count },
      teachers: [...teacherIds].map((id) => {
        const i = teacherInfo(id, lang);
        return { name: i.name, rating: i.rating ?? 0, count: i.reviewCount };
      }),
      privateThisMonth: all.filter((x) => x.visibility === 'private').length,
    },
    counts: {
      public: all.filter((x) => x.visibility === 'public' && !x.reported).length,
      private: all.filter((x) => x.visibility === 'private').length,
      reported: all.filter((x) => !!x.reported).length,
    },
    mentions: [...tags].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count),
    items: all.filter(inTab),
  };
}

/** Owners reply or report; a review is never deleted or hidden by them (BR-REV-06). */
export function replyReview(id: string, body: string) {
  const text = body?.trim();
  if (!text) fail(422, 'reply_required', 'Write your reply.');
  if (text.length > 600) fail(422, 'too_long', 'Up to 600 characters.');
  if (mfx.privateFeedback.some((p) => p.id === id))
    fail(409, 'private_feedback', 'Private feedback gets no public reply.');
  m().replies[id] = { body: text, at: new Date().toISOString() };
  db.persist();
  return { ok: true as const };
}
export function reportReview(id: string, reason: string) {
  if (!reason?.trim()) fail(422, 'reason_required', 'Say why you are reporting it.');
  m().reports[id] = { reason: reason.trim(), at: new Date().toISOString() };
  db.persist();
  return { ok: true as const };
}

// ── the connected story (Step 2B, demo only) ───────────────────────────────────
/** Moves a group opened in a booked slot `days` earlier: the group, its booking and the request. */
export function shiftOpenedGroup(groupId: string, days: number) {
  const g = m().newGroups.find((x) => x.id === groupId);
  if (!g?.startsOn) fail(404, 'not_found', 'Only a group opened in a booked slot can move.');
  g!.startsOn = addDays(g!.startsOn!, -days);
  for (const b of m().bookings.filter((x) => x.groupId === groupId)) {
    b.startsOn = addDays(b.startsOn, -days);
    const r = m().requests.find((x) => x.bookingId === b.id);
    if (r) r.startsOn = addDays(r.startsOn, -days);
  }
  db.persist();
}
