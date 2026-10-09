/**
 * Phase 1 marketplace operations (Batches 2 and 3): halls and rent, room requests, the centre's
 * schedule, rent income, reviews received, the teacher's rooms, groups, enrolments and earnings.
 * Endpoint names follow docs/07; amounts are piasters (`Money`). Every net amount is computed
 * from the data on the server side (CF-13), never typed in.
 */

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

export type RentIncomeRow = Schemas['RentIncomeRow'];
export type RentIncome = Schemas['RentIncome'];

export type ReviewTab = 'public' | 'private' | 'reported';
export type ReviewReceived = Schemas['ReviewReceived'];
export type ReviewsReceived = Schemas['ReviewsReceived'];
export type TeacherEnrolment = Schemas['TeacherEnrolment'];
export type Earnings = Schemas['Earnings'];
