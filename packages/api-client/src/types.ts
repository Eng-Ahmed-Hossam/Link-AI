/**
 * Client types. The ones core-api already serves are aliases of the generated contract
 * (`./generated/openapi`, from apps/core-api/src/contract). The rest are still DRAFT, hand-written
 * from docs/07-api.md; they move to the contract as their endpoints land (R2, R3). Fields the docs
 * do not define are marked `// PLACEHOLDER (<screen>)`.
 */
import type { components } from './generated/openapi';

type Schemas = components['schemas'];

/** Generated from the core-api contract (`pnpm openapi:generate`); edit apps/core-api/src/contract, not here. */
export type Curriculum = Schemas['Curriculum'];
export type Role = Schemas['Role'];
export type OtpRequestResult = Schemas['OtpRequestResult'];
export type OtpVerifyResult = Schemas['OtpVerifyResult'];
export type Me = Schemas['Me'];
export type UpdateMeBody = Schemas['UpdateMeBody'];
export type ConsentKind = Schemas['ConsentKind'];
export type PutConsentBody = Schemas['PutConsentBody'];
export type ConsentState = Schemas['ConsentState'];
export type CurriculumRef = Schemas['CurriculumRef'];
export type SchoolYearRef = Schemas['SchoolYearRef'];
export type SubjectRef = Schemas['SubjectRef'];
export type Child = Schemas['Child'];
export type Invite = Schemas['Invite'];
export type Money = Schemas['Money'];
export type RatingSummary = Schemas['RatingSummary'];
export type SeatState = Schemas['SeatState'];
export type CentreCard = Schemas['CentreCard'];
export type TeacherCard = Schemas['TeacherCard'];
export type SearchCentresResult = Schemas['SearchCentresResult'];
export type SessionSeats = Schemas['SessionSeats'];
export type GroupSummary = Schemas['GroupSummary'];
export type ReviewTag = Schemas['ReviewTag'];
export type PublicReview = Schemas['PublicReview'];
export type CentreProfile = Schemas['CentreProfile'];
export type TeacherProfile = Schemas['TeacherProfile'];

/** RFC 9457 problem details with a stable `code` (07 §1). */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: string;
  errors?: { field: string; code: string; [k: string]: unknown }[];
  [k: string]: unknown;
}

/** Cursor pagination (07 §1): `{ data, nextCursor }`. */
export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

// ── Auth and account (MKT-ACC) ─────────────────────────────────────────────────

// ── Discovery (MKT-DSC) ────────────────────────────────────────────────────────

export interface SearchQuery {
  curriculumId?: string;
  schoolYearId?: string;
  subjectId?: string;
  /** Default 5 km (MKT-DSC-02). */
  radiusKm?: number;
  minRating?: number;
  maxFeePt?: number;
  seatsOpen?: boolean;
  verifiedOnly?: boolean;
  sort?: 'best_match' | 'distance' | 'rating' | 'fee';
  q?: string;
  cursor?: string;
  /** The browser's location, only after the parent shares it; rounded, never stored (2026-10-09). */
  lat?: number;
  lng?: number;
}

/** Trust badges come from Link's data, never from the owner (MKT-DSC-04). */
export type TrustBadge = 'verified';

// ── Enrolment and payment (MKT-ENR) ────────────────────────────────────────────
/** The 8 enrolment states (08 §4). Refund state lives on `refunds`, never here (BR-ENR-14). */
export type EnrolmentStatus = Schemas['EnrolmentStatus'];
export type PaymentPlan = Schemas['PaymentPlan'];
export type PaymentMethod = Schemas['PaymentMethod'];

/** Methods allowed per plan (BR-PMT-02, BR-PMT-03, OD-10). */
export const METHODS_FOR_PLAN: Record<PaymentPlan, PaymentMethod[]> = {
  monthly_recurring: ['card'],
  single_month: ['card', 'fawry', 'wallet'],
  per_session: ['card', 'fawry', 'wallet'],
};

export type RefundStatus = Schemas['RefundStatus'];
export type Refund = Schemas['Refund'];
export type Enrolment = Schemas['Enrolment'];
export type CreateEnrolmentBody = Schemas['CreateEnrolmentBody'];
export type CheckoutResult = Schemas['CheckoutResult'];
export type WaitlistEntry = Schemas['WaitlistEntry'];
export type WaitlistAcceptBody = Schemas['WaitlistAcceptBody'];

// ── Reviews (MKT-REV) ──────────────────────────────────────────────────────────
export type CreateReviewBody = Schemas['CreateReviewBody'];
export type ReviewCreated = Schemas['ReviewCreated'];
