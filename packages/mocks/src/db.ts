/**
 * Stateful mock backend for the Batch 1 parent flow. Mirrors the rules the real core-api will
 * enforce (docs/01, 08 §4) closely enough for the UI: per-session seats, holds, the 8 enrolment
 * states, refunds kept separate, webhook-only payment status, verified-parent reviews.
 *
 * State persists in localStorage in the browser (so a reservation survives navigation and reload)
 * and in memory under Node (tests). `resetMockDb()` restores the fixtures.
 */
import type {
  CentreCard,
  CentreProfile,
  Child,
  CurriculumRef,
  Enrolment,
  EnrolmentStatus,
  GroupSummary,
  Money,
  PaymentMethod,
  PaymentPlan,
  PublicReview,
  RatingSummary,
  Refund,
  ReviewTag,
  SchoolYearRef,
  SeatState,
  SessionSeats,
  SubjectRef,
  TeacherCard,
  TeacherProfile,
} from '@link/api-client';
import * as fx from './data';
import { addDays, addMonth, cairoToUtc, cairoToday, isoWeekday } from './time';

export type Lang = 'ar' | 'en';
export type Scenario = 'default' | 'empty' | 'error' | 'offline' | 'slow';

const STORAGE_KEY = 'link.mock.db.v1';
const HOLD_SECONDS_DEFAULT = 600; // 10 min for card and wallet (BR-ENR-01)
const FAWRY_HOLD_SECONDS = 24 * 3600; // OD-09
const WEBHOOK_DELAY_MS = 2500; // "Confirming…" until the mock webhook lands

interface PaymentRow {
  id: string;
  enrolmentId: string;
  method: PaymentMethod;
  amountPt: number;
  status: 'pending' | 'succeeded' | 'failed';
}

interface EnrolmentRow {
  id: string;
  reference: string;
  groupId: string;
  studentId: string;
  plan: PaymentPlan;
  status: EnrolmentStatus;
  method: PaymentMethod | null;
  pricePt: number;
  holdExpiresAt: string | null;
  sessionIds: string[];
  firstSessionId: string;
  phoneShared: boolean;
  periodStart: string | null;
  planCancelled: boolean;
  payment: {
    amountPt: number;
    method: PaymentMethod;
    cardLast4: string | null;
    paidAt: string;
  } | null;
  lastPaymentFailed: boolean;
  fawry: { reference: string; expiresAt: string } | null;
  refund: (Omit<Refund, 'amount'> & { amountPt: number }) | null;
  reviewedTargets: ('centre' | 'teacher')[];
  pendingWebhook: { result: 'succeeded' | 'failed'; dueAt: number; method: PaymentMethod } | null;
  createdAt: string;
}

interface State {
  enrolments: EnrolmentRow[];
  payments: PaymentRow[];
  /** Idempotency-Key → stored response reference (07 §1). */
  idem: Record<string, { kind: string; id: string }>;
  reviews: {
    id: string;
    enrolmentId: string;
    targetType: 'centre' | 'teacher';
    stars: number;
    tags: ReviewTag[];
    body: string;
    visibility: 'public' | 'private';
    status: 'published' | 'held';
  }[];
  waitlist: { id: string; groupId: string; studentId: string }[];
  /** Phone → OTP attempts for the current code. */
  otp: Record<string, { attempts: number; sentAt: number }>;
  /** Known accounts (phone → user). The sample parent is pre-registered. */
  users: Record<string, { id: string; name: string | null; roles: string[] }>;
  extraChildren: {
    id: string;
    ownerId: string;
    name: string;
    curriculumId: string;
    schoolYearId: string;
  }[];
  settings: {
    holdSeconds: number;
    scenario: Scenario;
    reviewEachEnrolment: Record<string, boolean>;
  };
  seq: number;
}

// ── persistence ────────────────────────────────────────────────────────────────
const hasStorage = () => {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
};

function fresh(): State {
  const today = cairoToday();
  const s: State = {
    enrolments: [],
    payments: [],
    idem: {},
    reviews: [],
    waitlist: [],
    otp: {},
    users: { [fx.PARENT_PHONE]: { id: fx.parent.id, name: null, roles: ['parent'] } },
    extraChildren: [],
    settings: { holdSeconds: HOLD_SECONDS_DEFAULT, scenario: 'default', reviewEachEnrolment: {} },
    seq: 20900,
  };
  for (const e of fx.seedEnrolments) {
    const first = sessionsOf(e.groupId).find((x) => x.date >= addDays(today, -e.startedDaysAgo))!;
    const covered = coveredSessions(e.groupId, e.plan, first.id);
    const g = groupFx(e.groupId);
    s.enrolments.push({
      id: e.id,
      reference: e.reference,
      groupId: e.groupId,
      studentId: e.studentId,
      plan: e.plan,
      status: 'confirmed',
      method: 'card',
      pricePt: e.plan === 'per_session' ? g.sessionFeePt : g.monthlyFeePt,
      holdExpiresAt: null,
      sessionIds: covered,
      firstSessionId: first.id,
      phoneShared: true,
      periodStart: first.date,
      planCancelled: false,
      payment: {
        amountPt: g.monthlyFeePt,
        method: 'card',
        cardLast4: '4242',
        paidAt: cairoToUtc(addDays(first.date, -2), '10:00'),
      },
      lastPaymentFailed: false,
      fawry: null,
      refund: null,
      reviewedTargets: [],
      pendingWebhook: null,
      createdAt: cairoToUtc(addDays(first.date, -2), '10:00'),
    });
  }
  return s;
}

let state: State | null = null;

function load(): State {
  if (state) return state;
  if (hasStorage()) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        state = JSON.parse(raw) as State;
        return state;
      }
    } catch {
      /* fall through to fixtures */
    }
  }
  state = fresh();
  return state;
}

function save() {
  if (state && hasStorage()) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked: keep in memory */
    }
  }
}

export function resetMockDb() {
  state = fresh();
  save();
}

/** Tests and the dev panel can preset settings before the app loads (localStorage `link.mock.overrides`). */
function overrides(): Partial<State['settings']> {
  if (!hasStorage()) return {};
  try {
    return JSON.parse(localStorage.getItem('link.mock.overrides') ?? '{}');
  } catch {
    return {};
  }
}

export function mockSettings(): State['settings'] {
  return { ...load().settings, ...overrides() };
}
export function setMockSettings(patch: Partial<State['settings']>) {
  const s = load();
  s.settings = { ...s.settings, ...patch };
  save();
}

// ── helpers ────────────────────────────────────────────────────────────────────
const t = (l: fx.L, lang: Lang) => l[lang];
const money = (amountPt: number): Money => ({ amountPt, currency: 'EGP' });
const groupFx = (id: string) => fx.groups.find((g) => g.id === id)!;
const centreFx = (id: string) => fx.centres.find((c) => c.id === id)!;
const teacherFx = (id: string) => fx.teachers.find((x) => x.id === id)!;

export const curriculumRef = (id: string, lang: Lang): CurriculumRef => {
  const c = fx.curricula.find((x) => x.id === id)!;
  return { id: c.id, code: c.code, name: t(c.name, lang) };
};
export const schoolYearRef = (id: string, lang: Lang): SchoolYearRef => {
  const y = fx.schoolYears.find((x) => x.id === id)!;
  return { id: y.id, code: y.code, name: t(y.name, lang), shortName: t(y.short, lang) };
};
export const subjectRef = (id: string, lang: Lang): SubjectRef => {
  const s = fx.subjects.find((x) => x.id === id)!;
  return { id: s.id, code: s.code, name: t(s.name, lang) };
};

function ratingFrom(dist: [number, number, number, number, number]): RatingSummary | null {
  const count = dist.reduce((a, b) => a + b, 0);
  if (!count) return null;
  const sum = dist.reduce((a, n, i) => a + n * (5 - i), 0);
  return { avg: (sum / count).toFixed(1), count };
}

/** Sessions of a group: from 5 weeks ago to 9 weeks ahead, on its weekdays (Cairo dates). */
export function sessionsOf(groupId: string) {
  const g = groupFx(groupId);
  const today = cairoToday();
  const out: { id: string; date: string; startsAt: string; endsAt: string }[] = [];
  for (let d = -35; d <= 63; d++) {
    const date = addDays(today, d);
    if (g.weekdays.includes(isoWeekday(date))) {
      out.push({
        id: `${groupId}~${date}`,
        date,
        startsAt: cairoToUtc(date, g.startTime),
        endsAt: cairoToUtc(date, g.endTime),
      });
    }
  }
  return out;
}

function coveredSessions(groupId: string, plan: PaymentPlan, firstSessionId: string): string[] {
  const all = sessionsOf(groupId);
  const first = all.find((s) => s.id === firstSessionId);
  if (!first) return [];
  if (plan === 'per_session') return [first.id];
  const end = addMonth(first.date);
  return all.filter((s) => s.date >= first.date && s.date < end).map((s) => s.id);
}

const LIVE: EnrolmentStatus[] = ['pending_payment', 'awaiting_teacher', 'confirmed', 'past_due'];

/** BR-ENR-02: seats used(s) = live enrolments + live holds (+ offered waitlist entries) covering s. */
function seatsLeft(groupId: string, sessionId: string, now = Date.now()): number {
  const g = groupFx(groupId);
  const upcoming = sessionsOf(groupId).filter((s) => new Date(s.startsAt).getTime() > now);
  const idx = upcoming.findIndex((s) => s.id === sessionId);
  const taken = g.takenUpcoming[Math.max(0, Math.min(idx, g.takenUpcoming.length - 1))] ?? 0;
  const live = load().enrolments.filter(
    (e) =>
      e.groupId === groupId &&
      e.sessionIds.includes(sessionId) &&
      LIVE.includes(e.status) &&
      (e.status !== 'pending_payment' ||
        (e.holdExpiresAt && new Date(e.holdExpiresAt).getTime() > now)),
  ).length;
  return Math.max(0, g.seatCap - taken - live);
}

export function groupDto(id: string, lang: Lang): GroupSummary {
  const g = groupFx(id);
  const c = centreFx(g.centreId);
  const tc = teacherFx(g.teacherId);
  const now = Date.now();
  const upcomingSessions: SessionSeats[] = sessionsOf(id)
    .filter((s) => new Date(s.startsAt).getTime() > now)
    .slice(0, 9)
    .map((s) => ({
      id: s.id,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      seatCap: g.seatCap,
      seatsLeft: seatsLeft(id, s.id, now),
    }));
  return {
    id: g.id,
    teacher: {
      id: tc.id,
      slug: tc.slug,
      displayName: t(tc.name, lang),
      rating: ratingFrom(tc.ratingDist),
    },
    centre: {
      id: c.id,
      slug: c.slug,
      name: t(c.name, lang),
      area: t(c.area, lang),
      address: t(c.address, lang),
    },
    room: { name: t(g.room, lang) },
    subject: subjectRef(g.subjectId, lang),
    curriculum: curriculumRef(g.curriculumId, lang),
    schoolYear: schoolYearRef(g.schoolYearId, lang),
    weekdays: g.weekdays,
    startTime: g.startTime,
    endTime: g.endTime,
    sessionFee: money(g.sessionFeePt),
    monthlyFee: money(g.monthlyFeePt),
    sessionsPerMonth: g.sessionsPerMonth,
    offersMonthlyRecurring: g.offersMonthlyRecurring,
    seatCap: g.seatCap,
    status: 'published',
    upcomingSessions,
  };
}

function groupSeatState(id: string): SeatState {
  const next = groupDto(id, 'en').upcomingSessions[0];
  return next && next.seatsLeft > 0 ? 'open' : 'waitlist';
}

// ── discovery ──────────────────────────────────────────────────────────────────
export interface SearchArgs {
  subjectId?: string;
  curriculumId?: string;
  schoolYearId?: string;
  radiusKm?: number;
  minRating?: number;
  seatsOpen?: boolean;
  verifiedOnly?: boolean;
  maxFeePt?: number;
  sort?: string;
  q?: string;
}

function matchingGroups(a: SearchArgs) {
  return fx.groups.filter(
    (g) =>
      (!a.subjectId || g.subjectId === a.subjectId) &&
      (!a.curriculumId || g.curriculumId === a.curriculumId) &&
      (!a.schoolYearId || g.schoolYearId === a.schoolYearId) &&
      (!a.maxFeePt || g.sessionFeePt <= a.maxFeePt),
  );
}

export function searchCentres(a: SearchArgs, lang: Lang) {
  const radius = a.radiusKm ?? 5; // MKT-DSC-02 default ≤ 5 km
  const gs = matchingGroups(a);
  let cards: CentreCard[] = fx.centres
    .filter((c) => c.distanceKm <= radius)
    .map((c) => {
      const mine = gs.filter((g) => g.centreId === c.id);
      if (!mine.length) return null;
      const states = mine.map((g) => groupSeatState(g.id));
      const card: CentreCard = {
        id: c.id,
        slug: c.slug,
        name: t(c.name, lang),
        area: t(c.area, lang),
        distanceKm: c.distanceKm,
        rating: ratingFrom(c.ratingDist),
        teacherCount: new Set(mine.map((g) => g.teacherId)).size,
        fromSessionFee: money(Math.min(...mine.map((g) => g.sessionFeePt))),
        seatState: states.includes('open') ? 'open' : 'waitlist',
        verified: c.verified,
        lat: c.lat,
        lng: c.lng,
      };
      return card;
    })
    .filter((x): x is CentreCard => x !== null);
  if (a.q) cards = cards.filter((c) => c.name.toLowerCase().includes(a.q!.toLowerCase()));
  if (a.minRating) cards = cards.filter((c) => Number(c.rating?.avg ?? 0) >= a.minRating!);
  if (a.seatsOpen) cards = cards.filter((c) => c.seatState === 'open');
  if (a.verifiedOnly) cards = cards.filter((c) => c.verified);
  const sorts: Record<string, (x: CentreCard, y: CentreCard) => number> = {
    distance: (x, y) => (x.distanceKm ?? 99) - (y.distanceKm ?? 99),
    rating: (x, y) => Number(y.rating?.avg ?? 0) - Number(x.rating?.avg ?? 0),
    fee: (x, y) => (x.fromSessionFee?.amountPt ?? 0) - (y.fromSessionFee?.amountPt ?? 0),
    // Best match (OD-29 open): seats open first, then distance.
    best_match: (x, y) =>
      Number(y.seatState === 'open') - Number(x.seatState === 'open') ||
      (x.distanceKm ?? 99) - (y.distanceKm ?? 99),
  };
  cards.sort(sorts[a.sort ?? 'best_match'] ?? sorts.best_match);
  const teacherIds = new Set(
    gs.filter((g) => cards.some((c) => c.id === g.centreId)).map((g) => g.teacherId),
  );
  return {
    data: cards,
    nextCursor: null,
    totals: { centres: cards.length, teachers: teacherIds.size },
  };
}

function teacherCard(
  id: string,
  lang: Lang,
  gs = fx.groups.filter((g) => g.teacherId === id),
): TeacherCard {
  const tc = teacherFx(id);
  return {
    id: tc.id,
    slug: tc.slug,
    displayName: t(tc.name, lang),
    subjects: [...new Set(gs.map((g) => subjectRef(g.subjectId, lang).name))],
    rating: ratingFrom(tc.ratingDist),
    fromSessionFee: gs.length ? money(Math.min(...gs.map((g) => g.sessionFeePt))) : null,
    centreNames: [...new Set(gs.map((g) => t(centreFx(g.centreId).name, lang)))],
    verified: tc.verified,
  };
}

export function searchTeachers(a: SearchArgs, lang: Lang) {
  const radius = a.radiusKm ?? 5;
  const gs = matchingGroups(a).filter((g) => centreFx(g.centreId).distanceKm <= radius);
  const ids = [...new Set(gs.map((g) => g.teacherId))];
  const data = ids
    .map((id) =>
      teacherCard(
        id,
        lang,
        gs.filter((g) => g.teacherId === id),
      ),
    )
    .sort((x, y) => Number(y.rating?.avg ?? 0) - Number(x.rating?.avg ?? 0));
  return { data, nextCursor: null };
}

function reviewDto(r: fx.ReviewFx, lang: Lang): PublicReview {
  return {
    id: r.id,
    stars: r.stars,
    tags: r.tags,
    body: t(r.body, lang),
    schoolYearName: schoolYearRef(r.schoolYearId, lang).shortName,
    publishedAt: cairoToUtc(r.publishedOn, '12:00'),
    reply: r.reply ? { body: t(r.reply.body, lang), authorName: t(r.reply.author, lang) } : null,
  };
}

export function centreProfile(
  slug: string,
  lang: Lang,
  q: { schoolYearId?: string; subjectId?: string },
) {
  const c = fx.centres.find((x) => x.slug === slug);
  if (!c) return null;
  const gs = fx.groups.filter((g) => g.centreId === c.id);
  const bySubject = new Map<string, fx.GroupFx[]>();
  for (const g of gs)
    bySubject.set(`${g.subjectId}|${g.curriculumId}`, [
      ...(bySubject.get(`${g.subjectId}|${g.curriculumId}`) ?? []),
      g,
    ]);
  const profile: CentreProfile & { groupsForChild: GroupSummary[] } = {
    id: c.id,
    slug: c.slug,
    name: t(c.name, lang),
    area: t(c.area, lang),
    governorate: t(c.governorate, lang),
    address: t(c.address, lang),
    distanceKm: c.distanceKm,
    verified: c.verified,
    hours: c.hours,
    rating: ratingFrom(c.ratingDist),
    ratingDistribution: c.ratingDist.map((count, i) => ({ stars: 5 - i, count })),
    trustBadges: c.verified ? ['verified'] : [],
    subjects: [...bySubject.values()].map((list) => ({
      subject: subjectRef(list[0]!.subjectId, lang),
      curriculum: curriculumRef(list[0]!.curriculumId, lang),
      yearsLabel: [...new Set(list.map((g) => schoolYearRef(g.schoolYearId, lang).shortName))].join(
        lang === 'ar' ? '، ' : ', ',
      ),
    })),
    teachers: [...new Set(gs.map((g) => g.teacherId))].map((id) => {
      const mine = gs.filter((g) => g.teacherId === id);
      return {
        ...teacherCard(id, lang, mine),
        subjectLabel: `${subjectRef(mine[0]!.subjectId, lang).name} • ${[...new Set(mine.map((g) => schoolYearRef(g.schoolYearId, lang).shortName))].join(lang === 'ar' ? '، ' : ', ')}`,
      };
    }),
    reviews: fx.reviews
      .filter((r) => r.targetType === 'centre' && r.targetId === c.id)
      .map((r) => reviewDto(r, lang)),
    lat: c.lat,
    lng: c.lng,
    groupsForChild: gs
      .filter(
        (g) =>
          (!q.schoolYearId || g.schoolYearId === q.schoolYearId) &&
          (!q.subjectId || g.subjectId === q.subjectId),
      )
      .map((g) => groupDto(g.id, lang)),
  };
  return profile;
}

export function teacherProfile(slug: string, lang: Lang): TeacherProfile | null {
  const tc = fx.teachers.find((x) => x.slug === slug);
  if (!tc) return null;
  const gs = fx.groups.filter(
    (g) => g.teacherId === tc.id && centreFx(g.centreId).distanceKm <= 20,
  );
  return {
    id: tc.id,
    slug: tc.slug,
    displayName: t(tc.name, lang),
    subjects: [...new Set(gs.map((g) => g.subjectId))].map((s) => subjectRef(s, lang)),
    curricula: [...new Set(gs.map((g) => g.curriculumId))].map((c) => curriculumRef(c, lang)),
    yearsExperience: tc.yearsExperience,
    bio: t(tc.bio, lang),
    verified: tc.verified,
    rating: ratingFrom(tc.ratingDist),
    centreCount: new Set(gs.map((g) => g.centreId)).size,
    tagCounts: tc.tagCounts,
    recordedPct: 96, // Phase 2 badge; the UI hides it while the flag is off.
    groups: gs.map((g) => groupDto(g.id, lang)),
    reviews: fx.reviews
      .filter((r) => r.targetType === 'teacher' && r.targetId === tc.id)
      .map((r) => reviewDto(r, lang)),
  };
}

// ── accounts ───────────────────────────────────────────────────────────────────
export function childrenOf(userId: string, lang: Lang): Child[] {
  const base =
    userId === fx.parent.id
      ? fx.children.map((c) => ({
          id: c.id,
          name: t(c.name, lang),
          curriculumId: c.curriculumId,
          schoolYearId: c.schoolYearId,
        }))
      : [];
  const extra = load().extraChildren.filter((c) => c.ownerId === userId);
  return [...base, ...extra].map((c) => ({
    id: c.id,
    displayName: c.name,
    curriculum: curriculumRef(c.curriculumId, lang),
    schoolYear: schoolYearRef(c.schoolYearId, lang),
  }));
}

export function addChild(
  userId: string,
  body: { displayName: string; curriculumId: string; schoolYearId: string },
  lang: Lang,
) {
  const s = load();
  const row = {
    id: `chd-${++s.seq}`,
    ownerId: userId,
    name: body.displayName.trim(),
    curriculumId: body.curriculumId,
    schoolYearId: body.schoolYearId,
  };
  s.extraChildren.push(row);
  save();
  return childrenOf(userId, lang).find((c) => c.id === row.id)!;
}

export function userByPhone(phone: string) {
  return load().users[phone] ?? null;
}
export function userById(id: string) {
  return Object.values(load().users).find((u) => u.id === id) ?? null;
}
export function registerUser(phone: string) {
  const s = load();
  s.users[phone] ??= { id: `usr-${++s.seq}`, name: null, roles: [] };
  save();
  return s.users[phone]!;
}
export function addRole(userId: string, role: string) {
  const u = userById(userId);
  if (u && !u.roles.includes(role)) u.roles.push(role);
  save();
  return u;
}
export function otpState(phone: string) {
  const s = load();
  return (s.otp[phone] ??= { attempts: 0, sentAt: Date.now() });
}
export function otpReset(phone: string) {
  load().otp[phone] = { attempts: 0, sentAt: Date.now() };
  save();
}
export function persist() {
  save();
}
export const parentName = (lang: Lang) => t(fx.parent.name, lang);

// ── enrolment ──────────────────────────────────────────────────────────────────
/** Apply due mock webhooks and hold expiry. Status changes ONLY here (BR-MNY-12). */
function tick(now = Date.now()) {
  const s = load();
  let changed = false;
  for (const e of s.enrolments) {
    if (e.pendingWebhook && e.pendingWebhook.dueAt <= now) {
      const w = e.pendingWebhook;
      e.pendingWebhook = null;
      if (w.result === 'succeeded' && (e.status === 'pending_payment' || e.status === 'expired')) {
        e.payment = {
          amountPt: e.pricePt,
          method: w.method,
          cardLast4: w.method === 'card' ? '4242' : null,
          paidAt: new Date(now).toISOString(),
        };
        e.method = w.method;
        e.lastPaymentFailed = false;
        e.holdExpiresAt = null;
        const reviewOn =
          s.settings.reviewEachEnrolment[groupFx(e.groupId).teacherId] ??
          teacherFx(groupFx(e.groupId).teacherId).reviewEachEnrolment;
        e.status = reviewOn ? 'awaiting_teacher' : 'confirmed';
        if (e.plan !== 'per_session')
          e.periodStart =
            sessionsOf(e.groupId).find((x) => x.id === e.firstSessionId)?.date ?? null;
      } else if (w.result === 'failed' && e.status === 'pending_payment') {
        e.lastPaymentFailed = true; // stays pending_payment, hold keeps running (BR-ENR-05)
      }
      changed = true;
    }
    if (
      e.status === 'pending_payment' &&
      e.holdExpiresAt &&
      new Date(e.holdExpiresAt).getTime() <= now
    ) {
      e.status = 'expired';
      changed = true;
    }
  }
  if (changed) save();
}

function enrolmentDto(e: EnrolmentRow, lang: Lang, viewerId: string): Enrolment {
  const g = groupFx(e.groupId);
  const first = sessionsOf(e.groupId).find((x) => x.id === e.firstSessionId)!;
  const firstSessionStarted = Date.now() >= new Date(first.startsAt).getTime();
  const student = childrenOf(viewerId, lang).find((c) => c.id === e.studentId)!;
  return {
    id: e.id,
    reference: e.reference,
    status: e.status,
    plan: e.plan,
    method: e.method,
    group: groupDto(e.groupId, lang),
    student,
    price: money(e.pricePt),
    holdExpiresAt: e.status === 'pending_payment' ? e.holdExpiresAt : null,
    sessionIds: e.sessionIds,
    firstSession: { id: first.id, startsAt: first.startsAt },
    phoneShared: e.phoneShared,
    teacherReviewsEnrolments:
      load().settings.reviewEachEnrolment[g.teacherId] ??
      teacherFx(g.teacherId).reviewEachEnrolment,
    renewsOn:
      e.plan === 'monthly_recurring' &&
      !e.planCancelled &&
      e.periodStart &&
      ['confirmed', 'awaiting_teacher'].includes(e.status)
        ? addMonth(e.periodStart)
        : null,
    payment: e.payment
      ? {
          amount: money(e.payment.amountPt),
          method: e.payment.method,
          cardLast4: e.payment.cardLast4,
          paidAt: e.payment.paidAt,
        }
      : null,
    lastPaymentFailed: e.lastPaymentFailed,
    fawry: e.status === 'pending_payment' ? e.fawry : null,
    refund: e.refund
      ? {
          id: e.refund.id,
          status: e.refund.status,
          policy: e.refund.policy,
          createdAt: e.refund.createdAt,
          amount: money(e.refund.amountPt),
        }
      : null,
    firstSessionStarted,
    // BR-REV-01: verified parent of a confirmed enrolment, after the first session. BR-REV-02: once per target per term.
    canReview:
      firstSessionStarted &&
      ['confirmed', 'past_due', 'ended'].includes(e.status) &&
      e.reviewedTargets.length < 2,
  };
}

export class MockProblem extends Error {
  constructor(
    public status: number,
    public code: string,
    public detail: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

const ownsStudent = (userId: string, studentId: string) =>
  childrenOf(userId, 'en').some((c) => c.id === studentId);

export function getEnrolment(id: string, userId: string, lang: Lang) {
  tick();
  const e = load().enrolments.find((x) => x.id === id);
  // 404 also when it exists but belongs to someone else (07 §1: nothing leaks).
  if (!e || !ownsStudent(userId, e.studentId))
    throw new MockProblem(404, 'not_found', 'Enrolment not found.');
  return enrolmentDto(e, lang, userId);
}

export function myEnrolments(userId: string, lang: Lang) {
  tick();
  return load()
    .enrolments.filter((e) => ownsStudent(userId, e.studentId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((e) => enrolmentDto(e, lang, userId));
}

export function createEnrolment(
  userId: string,
  body: {
    groupId: string;
    studentId: string;
    paymentPlan: PaymentPlan;
    firstSessionId?: string;
    sessionId?: string;
    sharePhone: boolean;
  },
  key: string,
  lang: Lang,
) {
  tick();
  const s = load();
  const prior = s.idem[key];
  if (prior?.kind === 'enrolment')
    return { replayed: true, dto: getEnrolment(prior.id, userId, lang) };
  if (!ownsStudent(userId, body.studentId))
    throw new MockProblem(404, 'not_found', 'Child not found.');
  const g = fx.groups.find((x) => x.id === body.groupId);
  if (!g) throw new MockProblem(404, 'not_found', 'Group not found.');
  if (body.paymentPlan === 'monthly_recurring' && !g.offersMonthlyRecurring)
    throw new MockProblem(
      422,
      'plan_not_offered',
      'This teacher does not offer the monthly plan for this group.',
    );
  if (
    s.enrolments.some(
      (e) => e.groupId === g.id && e.studentId === body.studentId && LIVE.includes(e.status),
    )
  )
    throw new MockProblem(409, 'already_enrolled', 'This child already has a place in this group.'); // BR-ENR-08
  const firstId = body.paymentPlan === 'per_session' ? body.sessionId : body.firstSessionId;
  if (!firstId) throw new MockProblem(422, 'validation_failed', 'Choose the first session.');
  const covered = coveredSessions(g.id, body.paymentPlan, firstId);
  if (!covered.length) throw new MockProblem(422, 'validation_failed', 'Unknown session.');
  // BR-ENR-02: hold only if every covered session has a seat. Name the full one (AC7).
  const full = covered.find((sid) => seatsLeft(g.id, sid) <= 0);
  if (full) {
    const sess = sessionsOf(g.id).find((x) => x.id === full)!;
    throw new MockProblem(
      409,
      'seat_unavailable',
      'A session this plan covers is full. You can join the waitlist.',
      {
        errors: [{ field: 'sessionId', code: 'full', sessionId: full, startsAt: sess.startsAt }],
      },
    );
  }
  const row: EnrolmentRow = {
    id: `enr-${++s.seq}`,
    reference: `LNK-${s.seq}`,
    groupId: g.id,
    studentId: body.studentId,
    plan: body.paymentPlan,
    status: 'pending_payment',
    method: null,
    pricePt: body.paymentPlan === 'per_session' ? g.sessionFeePt : g.monthlyFeePt, // snapshot (OD-39)
    holdExpiresAt: new Date(Date.now() + mockSettings().holdSeconds * 1000).toISOString(),
    sessionIds: covered,
    firstSessionId: firstId,
    phoneShared: body.sharePhone,
    periodStart: null,
    planCancelled: false,
    payment: null,
    lastPaymentFailed: false,
    fawry: null,
    refund: null,
    reviewedTargets: [],
    pendingWebhook: null,
    createdAt: new Date().toISOString(),
  };
  s.enrolments.push(row);
  s.idem[key] = { kind: 'enrolment', id: row.id };
  save();
  return { replayed: false, dto: enrolmentDto(row, lang, userId) };
}

const ALLOWED: Record<PaymentPlan, PaymentMethod[]> = {
  monthly_recurring: ['card'],
  single_month: ['card', 'fawry', 'wallet'],
  per_session: ['card', 'fawry', 'wallet'],
};

export function checkout(enrolmentId: string, userId: string, method: PaymentMethod) {
  tick();
  const s = load();
  const e = s.enrolments.find((x) => x.id === enrolmentId);
  if (!e || !ownsStudent(userId, e.studentId))
    throw new MockProblem(404, 'not_found', 'Enrolment not found.');
  if (e.status !== 'pending_payment')
    throw new MockProblem(409, 'hold_expired', 'The seat hold has ended. Start again.');
  if (!ALLOWED[e.plan].includes(method))
    throw new MockProblem(422, 'method_not_allowed', 'Monthly plans can only be paid by card.');
  if (method === 'fawry') {
    e.method = 'fawry';
    e.holdExpiresAt = new Date(Date.now() + FAWRY_HOLD_SECONDS * 1000).toISOString(); // 24 h (OD-09)
    e.fawry = {
      reference: String(84520000 + (s.seq % 9999) * 7).slice(0, 8),
      expiresAt: e.holdExpiresAt,
    };
    save();
    return {
      kind: 'fawry' as const,
      fawryReference: e.fawry.reference,
      expiresAt: e.fawry.expiresAt,
    };
  }
  const p: PaymentRow = {
    id: `pay-${++s.seq}`,
    enrolmentId: e.id,
    method,
    amountPt: e.pricePt,
    status: 'pending',
  };
  s.payments.push(p);
  e.method = method;
  save();
  return { kind: 'redirect' as const, checkoutUrl: `/mock-checkout/${p.id}` };
}

/** The mock provider's hosted page reads this. */
export function mockPayment(paymentId: string) {
  const p = load().payments.find((x) => x.id === paymentId);
  if (!p) return null;
  const e = load().enrolments.find((x) => x.id === p.enrolmentId)!;
  return { ...p, reference: e.reference, holdExpiresAt: e.holdExpiresAt };
}

/** The provider finished: the "webhook" lands a few seconds later (BR-MNY-12: only it changes status). */
export function completeMockPayment(paymentId: string, result: 'succeeded' | 'failed') {
  const s = load();
  const p = s.payments.find((x) => x.id === paymentId);
  if (!p) throw new MockProblem(404, 'not_found', 'Payment not found.');
  p.status = result;
  const e = s.enrolments.find((x) => x.id === p.enrolmentId)!;
  e.pendingWebhook = { result, dueAt: Date.now() + WEBHOOK_DELAY_MS, method: p.method };
  save();
  return { enrolmentId: e.id };
}

export function payFawryAtOutlet(enrolmentId: string) {
  const s = load();
  const e = s.enrolments.find((x) => x.id === enrolmentId);
  if (!e || e.method !== 'fawry') throw new MockProblem(404, 'not_found', 'No Fawry reference.');
  e.pendingWebhook = { result: 'succeeded', dueAt: Date.now() + WEBHOOK_DELAY_MS, method: 'fawry' };
  save();
}

export function cancelEnrolment(enrolmentId: string, userId: string, lang: Lang) {
  tick();
  const s = load();
  const e = s.enrolments.find((x) => x.id === enrolmentId);
  if (!e || !ownsStudent(userId, e.studentId))
    throw new MockProblem(404, 'not_found', 'Enrolment not found.');
  const dto = enrolmentDto(e, lang, userId);
  if (e.status === 'pending_payment') {
    e.status = 'cancelled'; // nothing to refund
  } else if (['confirmed', 'awaiting_teacher'].includes(e.status) && !dto.firstSessionStarted) {
    e.status = 'cancelled'; // BR-REF-02: full refund requested, auto-eligible; ops approve (OD-42)
    e.planCancelled = true;
    e.refund = {
      id: `ref-${++s.seq}`,
      status: 'requested',
      policy: 'before_first_session',
      createdAt: new Date().toISOString(),
      amountPt: e.payment?.amountPt ?? e.pricePt,
    };
  } else {
    throw new MockProblem(
      409,
      'after_first_session',
      'After the first session, ask Link to review a refund instead.',
    );
  }
  save();
  return enrolmentDto(e, lang, userId);
}

/** BR-REF-03: after the first session, a refund request goes to ops as a dispute. */
export function refundRequest(enrolmentId: string, userId: string, lang: Lang) {
  const s = load();
  const e = s.enrolments.find((x) => x.id === enrolmentId);
  if (!e || !ownsStudent(userId, e.studentId))
    throw new MockProblem(404, 'not_found', 'Enrolment not found.');
  e.refund ??= {
    id: `ref-${++s.seq}`,
    status: 'requested',
    policy: 'dispute',
    createdAt: new Date().toISOString(),
    amountPt: e.payment?.amountPt ?? e.pricePt,
  };
  save();
  return enrolmentDto(e, lang, userId);
}

export function cancelPlan(enrolmentId: string, userId: string, lang: Lang) {
  const e = load().enrolments.find((x) => x.id === enrolmentId);
  if (!e || !ownsStudent(userId, e.studentId))
    throw new MockProblem(404, 'not_found', 'Enrolment not found.');
  e.planCancelled = true; // BR-PMT-05: stops the next renewal, keeps the paid month
  save();
  return enrolmentDto(e, lang, userId);
}

export function joinWaitlist(groupId: string, userId: string, studentId: string) {
  if (!ownsStudent(userId, studentId)) throw new MockProblem(404, 'not_found', 'Child not found.');
  const s = load();
  const existing = s.waitlist.find((w) => w.groupId === groupId && w.studentId === studentId);
  const row = existing ?? { id: `wl-${++s.seq}`, groupId, studentId };
  if (!existing) s.waitlist.push(row);
  save();
  // Fixture: 3 families already waiting ahead (sample data).
  return {
    id: row.id,
    status: 'waiting' as const,
    position: 3 + s.waitlist.filter((w) => w.groupId === groupId).indexOf(row) + 1,
  };
}

const CONTACT_PATTERN = /(\+?2?0?1[0125][\s-]?\d{3,4}[\s-]?\d{4})|([٠-٩]{8,})|(@\w)|(wa\.me)/;

export function createReview(
  userId: string,
  body: {
    enrolmentId: string;
    targetType: 'centre' | 'teacher';
    stars: number;
    tags: ReviewTag[];
    body: string;
    visibility: 'public' | 'private';
  },
  key: string,
) {
  tick();
  const s = load();
  const prior = s.idem[key];
  if (prior?.kind === 'review') {
    const r = s.reviews.find((x) => x.id === prior.id)!;
    return { replayed: true, dto: { id: r.id, status: r.status } };
  }
  const e = s.enrolments.find((x) => x.id === body.enrolmentId);
  if (!e || !ownsStudent(userId, e.studentId))
    throw new MockProblem(404, 'not_found', 'Enrolment not found.');
  const dto = enrolmentDto(e, 'en', userId);
  if (!dto.firstSessionStarted || !['confirmed', 'past_due', 'ended'].includes(e.status))
    throw new MockProblem(403, 'not_verified_parent', 'Reviews open after the first session.'); // BR-REV-01
  if (e.reviewedTargets.includes(body.targetType))
    throw new MockProblem(409, 'already_reviewed', 'You already reviewed this term.'); // BR-REV-02
  if (body.stars < 1 || body.stars > 5)
    throw new MockProblem(422, 'validation_failed', 'Choose 1 to 5 stars.');
  if (body.body.length > 600)
    throw new MockProblem(422, 'body_too_long', 'Use 600 characters or fewer.');
  // BR-REV-04 rule-based checks: a review with contact details is held for ops (L02).
  const status = CONTACT_PATTERN.test(body.body) ? 'held' : 'published';
  const row = { id: `rvw-${++s.seq}`, ...body, status: status as 'held' | 'published' };
  s.reviews.push(row);
  e.reviewedTargets.push(body.targetType);
  s.idem[key] = { kind: 'review', id: row.id };
  save();
  return { replayed: false, dto: { id: row.id, status: row.status } };
}
