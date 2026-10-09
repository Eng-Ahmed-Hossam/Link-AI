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
export type Facility = Schemas['Facility'];
export type RentBasis = Schemas['RentBasis'];
export type RentRule = Schemas['RentRule'];
export type WeeklySlot = Schemas['WeeklySlot'];
export type SlotState = Schemas['SlotState'];
export type Hall = Schemas['Hall'];
export type HallPatch = Schemas['HallPatch'];
export type AutoApproveRules = Schemas['AutoApproveRules'];
export type RequestStage = Schemas['RequestStage'];
export type RequestTeacher = Schemas['RequestTeacher'];
export type RoomRequest = Schemas['RoomRequest'];
export type ScheduleCell = Schemas['ScheduleCell'];
export type CentreSchedule = Schemas['CentreSchedule'];
export type CentreLocation = Schemas['CentreLocation'];
export type NewHallBody = Schemas['NewHallBody'];
export type CentreProfileEdit = Schemas['CentreProfileEdit'];
export type RoomSearchQuery = Schemas['RoomSearchQuery'];
export type RoomSearchResult = Schemas['RoomSearchResult'];
export type RentEstimateBody = Schemas['RentEstimateBody'];
export type RentEstimate = Schemas['RentEstimate'];
export type RoomRequestBody = Schemas['RoomRequestBody'];
export type Verification = Schemas['Verification'];
export type TeacherSelf = Schemas['TeacherSelf'];
export type TeacherSelfPatch = Schemas['TeacherSelfPatch'];
export type GroupPatch = Schemas['GroupPatch'];
export type NewGroupBody = Schemas['NewGroupBody'];
export type TeacherBooking = Schemas['TeacherBooking'];

export type ScheduleCellKind = 'teaching' | 'booked' | 'free';

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
