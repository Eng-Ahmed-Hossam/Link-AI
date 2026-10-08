/**
 * Phase 1 marketplace operations (Batches 2 and 3): halls and rent, room requests, the centre's
 * schedule, rent income, reviews received, the teacher's rooms, groups, enrolments and earnings.
 * Endpoint names follow docs/07; amounts are piasters (`Money`). Every net amount is computed
 * from the data on the server side (CF-13), never typed in.
 */
import type { Money } from './types';

import type { components } from './generated/openapi';

type Schemas = components['schemas'];

/** Generated from the core-api contract (`pnpm openapi:generate`); edit apps/core-api/src/contract, not here. */
export type CentreApplicationBody = Schemas['CentreApplicationBody'];
export type CentreFeatures = Schemas['CentreFeatures'];

export type Facility =
  'ac' | 'fan' | 'projector' | 'sound' | 'whiteboard' | 'smart_board' | 'wheelchair';

/** One rent rule per hall (C05). `percent` is a whole percentage of the fees parents paid. */
export type RentBasis = 'fixed_per_session' | 'per_student_per_session' | 'percent_of_fees';
export interface RentRule {
  basis: RentBasis;
  amount: Money | null;
  percent: number | null;
}

/** A weekly 2-hour slot (Cairo time). */
export interface WeeklySlot {
  weekday: number;
  start: string;
  end: string;
}

export type SlotState = 'free' | 'taken' | 'closed';

export interface Hall {
  id: string;
  centreId: string;
  name: string;
  capacity: number;
  facilities: Facility[];
  rentRule: RentRule;
  /** Shown on the Link map; an unlisted hall takes no requests. */
  listed: boolean;
  /** Every weekly slot of the grid (Sat–Thu × 2, 4, 6, 8 PM) and its state. */
  slots: (WeeklySlot & { state: SlotState })[];
  freeSlotsPerWeek: number;
  photo: number;
}

export interface HallPatch {
  name?: string;
  capacity?: number;
  facilities?: Facility[];
  rentRule?: { basis: RentBasis; amountPt?: number | null; percent?: number | null };
  listed?: boolean;
  /** Slots the owner closes (not offered to teachers). */
  closedSlots?: WeeklySlot[];
}

/** Auto-approve (MKT-HAL-05): off by default; when on, a request meeting every rule is approved. */
export interface AutoApproveRules {
  enabled: boolean;
  verifiedId: boolean;
  minRating: number;
  fitsCapacity: boolean;
}

export type RequestStage =
  'requested' | 'phone_call' | 'meeting' | 'approved' | 'declined' | 'withdrawn';

export interface RequestTeacher {
  id: string;
  name: string;
  rating: number | null;
  reviewCount: number;
  verifiedId: boolean;
  isNew: boolean;
}

export interface RoomRequest {
  id: string;
  centre: { id: string; name: string; area: string };
  hall: { id: string; name: string; capacity: number };
  teacher: RequestTeacher;
  subject: string;
  schoolYear: string;
  weekdays: number[];
  start: string;
  end: string;
  expectedStudents: number;
  startsOn: string;
  stage: RequestStage;
  /** The booked call or meeting (C06 "Call booked Thu 2 PM"). */
  stageAt: string | null;
  /** Each auto-approve rule, checked from the data. */
  checks: { verifiedId: boolean; rating: boolean; fitsCapacity: boolean; slotFree: boolean };
  meetsRules: boolean;
  rentRule: RentRule;
  declinedReason: string | null;
  createdAt: string;
}

export type ScheduleCellKind = 'teaching' | 'booked' | 'free';
export interface ScheduleCell {
  hallId: string;
  weekday: number;
  start: string;
  end: string;
  kind: ScheduleCellKind;
  teacher: string | null;
  group: string | null;
  seats: { filled: number; cap: number } | null;
  startsOn: string | null;
  rentRule: RentRule | null;
}

export interface CentreSchedule {
  /** Sat–Thu, ISO weekdays. */
  days: number[];
  dates: Record<number, string>;
  halls: { id: string; name: string; capacity: number }[];
  cells: ScheduleCell[];
  stats: {
    roomUsePercent: number;
    freeSlots: number;
    averageSeatsFilledPercent: number;
    teachersRenting: number;
  };
}

export interface RentIncomeRow {
  teacher: { id: string; name: string };
  hall: { id: string; name: string };
  sessions: number;
  /** Students counted across those sessions (per-student rule). */
  studentSessions: number;
  rentRule: RentRule;
  /** The fees the percent rule is applied to (percent rule only). */
  feesBase: Money | null;
  rent: Money;
  linkFee: Money;
  net: Money;
  paidVia: 'link' | 'due';
  dueOn: string | null;
}

export interface RentIncome {
  month: string;
  /** Link's marketing fee on rent, a whole percentage (OD-01). */
  feePercent: number;
  rows: RentIncomeRow[];
  totals: {
    rentDue: Money;
    collected: Money;
    outstanding: Money;
    linkFee: Money;
    net: Money;
  };
  teachers: number;
  halls: number;
  roomUsePercent: number;
  nextTransfer: { on: string; amount: Money; account: string };
}

export type ReviewTab = 'public' | 'private' | 'reported';
export interface ReviewReceived {
  id: string;
  target: { kind: 'centre' | 'teacher'; name: string };
  stars: number;
  body: string;
  schoolYear: string;
  createdAt: string;
  visibility: 'public' | 'private';
  reply: { body: string; at: string } | null;
  reported: { reason: string; at: string } | null;
}
export interface ReviewsReceived {
  summary: {
    centre: { rating: number; count: number };
    teachers: { name: string; rating: number; count: number }[];
    privateThisMonth: number;
  };
  counts: Record<ReviewTab, number>;
  mentions: { tag: string; count: number }[];
  items: ReviewReceived[];
}

/** CF-44: the owner moves the pin; the location shows "under review" until Link ops verifies it. */
export interface CentreLocation {
  lat: number;
  lng: number;
  address: string;
  underReview: boolean;
}

export interface NewHallBody {
  name: string;
  capacity: number;
  facilities: Facility[];
  rentRule: { basis: RentBasis; amountPt?: number | null; percent?: number | null };
}

export interface CentreProfileEdit {
  id: string;
  /** The public page: /{lang}/centres/{slug}. */
  slug: string;
  distanceKm: number;
  name: string;
  area: string;
  address: string;
  about: string;
  photos: number;
  hours: string;
  liveOnMap: boolean;
  verified: boolean;
  completeness: number;
  /** Earned from Link's data; not editable (C02). */
  badges: string[];
  rating: { avg: number; count: number };
  teachers: number;
  halls: Hall[];
  location: CentreLocation;
}

/** `GET /v1/rooms/search` query (07 §2, MKT-HAL-01). Without `lat`/`lng` the teacher's area is used. */
export interface RoomSearchQuery {
  /** Seats needed: halls smaller than this are listed with `fits: false`. */
  minCapacity?: number;
  /** Comma-separated weekdays, 0 = Sunday … 6 = Saturday. */
  weekday?: string;
  radiusKm?: number;
  lat?: number;
  lng?: number;
}

export interface RoomSearchResult {
  hall: { id: string; name: string; capacity: number; facilities: Facility[] };
  centre: { id: string; name: string; area: string; distanceKm: number };
  freeSlots: WeeklySlot[];
  rentRule: RentRule;
  /** Seats ≥ the expected students. */
  fits: boolean;
}

export interface RentEstimateBody {
  hallId: string;
  slots: WeeklySlot[];
  students: number;
  monthlyFeePt: number;
}
export interface RentEstimate {
  sessionsPerMonth: number;
  fees: Money;
  rent: Money;
  /** Illustrative (OD-02): the rate comes from commission rules. */
  commission: Money;
  commissionPercent: number;
  keep: Money;
  /** The centre's auto-approve rules, checked for this teacher. */
  autoApprove: { enabled: boolean; meets: boolean };
}

export interface RoomRequestBody {
  hallId: string;
  slots: WeeklySlot[];
  groupId: string | null;
  subjectId: string;
  schoolYearId: string;
  expectedStudents: number;
  startsOn: string;
}

export type Verification = 'verified' | 'pending' | 'missing';
export interface TeacherSelf {
  id: string;
  name: string;
  subjects: string;
  yearsExperience: number;
  rating: number | null;
  reviewCount: number;
  openToSlots: boolean;
  about: string;
  /** Public only after the national ID is verified (OD-19). */
  verification: {
    nationalId: Verification;
    degree: Verification;
    references: { added: number; needed: number };
  };
  /** Sat–Thu, AM / PM. */
  availability: { weekday: number; am: boolean; pm: boolean }[];
  reviewEachEnrolment: boolean;
  payoutAccount: string;
  /** What the teacher teaches now (J02 "For which group?"): one entry per group. */
  teaches: {
    groupId: string;
    subjectId: string;
    schoolYearId: string;
    label: string;
    /** "Al Nour Centre • Room 2 • Sat & Wed 5:00 PM" — tells same-subject groups apart. */
    where: string;
    students: number;
    monthlyFee: Money;
  }[];
}
export interface TeacherSelfPatch {
  about?: string;
  openToSlots?: boolean;
  availability?: { weekday: number; am: boolean; pm: boolean }[];
  reviewEachEnrolment?: boolean;
}

export interface GroupPatch {
  monthlyFeePt?: number;
  sessionFeePt?: number;
  seatCap?: number;
  offersMonthlyRecurring?: boolean;
}
export interface NewGroupBody {
  bookingId: string;
  subjectId: string;
  schoolYearId: string;
  monthlyFeePt: number;
  sessionFeePt: number;
  seatCap: number;
  offersMonthlyRecurring: boolean;
}
/** A booked hall slot the teacher can open a group in (J05 "New group"). */
export interface TeacherBooking {
  id: string;
  centre: { id: string; name: string };
  hall: { id: string; name: string; capacity: number };
  weekdays: number[];
  start: string;
  end: string;
  startsOn: string;
  groupId: string | null;
  /** From the room request that booked it: what the new group will teach. */
  subjectId: string | null;
  schoolYearId: string | null;
  /** "Physics • Sec 2". */
  label: string | null;
}

export interface TeacherEnrolment {
  id: string;
  student: string;
  parent: string;
  group: { id: string; name: string; centre: string; room: string };
  plan: 'monthly_recurring' | 'single_month' | 'per_session';
  method: 'card' | 'fawry' | 'wallet' | null;
  status: string;
  paid: Money | null;
  createdAt: string;
  /** Only with `reviewEachEnrolment` on (OD-08). */
  canDecide: boolean;
}

export interface Earnings {
  month: string;
  /** What the teacher keeps this month, after Link's commission and rent. */
  keep: Money;
  nextPayout: { on: string; amount: Money; account: string };
  parentsPaid: Money;
  commission: Money;
  commissionPercent: number;
  rent: { centre: string; hall: string; rule: RentRule; amount: Money }[];
  rentTotal: Money;
  byGroup: { id: string; name: string; students: number; amount: Money }[];
  methods: { method: 'card' | 'fawry' | 'wallet'; percent: number }[];
}
