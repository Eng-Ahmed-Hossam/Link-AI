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
}

/** Trust badges come from Link's data, never from the owner (MKT-DSC-04). */
export type TrustBadge = 'verified';

// ── Enrolment and payment (MKT-ENR) ────────────────────────────────────────────
/** The 8 enrolment states (08 §4). Refund state lives on `refunds`, never here (BR-ENR-14). */
export type EnrolmentStatus =
  | 'pending_payment'
  | 'awaiting_teacher'
  | 'confirmed'
  | 'past_due'
  | 'cancelled'
  | 'expired'
  | 'declined'
  | 'ended';

export type PaymentPlan = 'monthly_recurring' | 'single_month' | 'per_session';
export type PaymentMethod = 'card' | 'fawry' | 'wallet';

/** Methods allowed per plan (BR-PMT-02, BR-PMT-03, OD-10). */
export const METHODS_FOR_PLAN: Record<PaymentPlan, PaymentMethod[]> = {
  monthly_recurring: ['card'],
  single_month: ['card', 'fawry', 'wallet'],
  per_session: ['card', 'fawry', 'wallet'],
};

export type RefundStatus =
  'requested' | 'approved' | 'processing' | 'succeeded' | 'failed' | 'rejected';

export interface Refund {
  id: string;
  status: RefundStatus;
  amount: Money;
  policy:
    | 'before_first_session'
    | 'dispute'
    | 'teacher_declined'
    | 'group_cancelled'
    | 'late_payment_no_seat';
  createdAt: string;
}

export interface Enrolment {
  id: string;
  /** Human reference, e.g. LNK-20931 (MKT-ENR-06). LTR isolate in the UI. */
  reference: string;
  status: EnrolmentStatus;
  plan: PaymentPlan;
  method: PaymentMethod | null;
  group: GroupSummary;
  student: Child;
  /** Fee snapshot at reservation (OD-39). */
  price: Money;
  /** While `pending_payment`; passing it makes the enrolment `expired` (BR-ENR-01, BR-ENR-05). */
  holdExpiresAt: string | null;
  /** Sessions this enrolment covers (BR-ENR-13). */
  sessionIds: string[];
  firstSession: { id: string; startsAt: string };
  phoneShared: boolean;
  /** Teacher's `reviewEachEnrolment` (OD-08): show the confirmation step. */
  teacherReviewsEnrolments: boolean;
  renewsOn: string | null;
  /** Receipt once the webhook confirmed the payment (never from a redirect, BR-MNY-12). */
  payment: {
    amount: Money;
    method: PaymentMethod;
    cardLast4: string | null;
    paidAt: string;
  } | null;
  /** Last attempt failed; the hold keeps running and the parent can retry (BR-ENR-05). */
  lastPaymentFailed: boolean;
  fawry: { reference: string; expiresAt: string } | null;
  /** Shown separately from the enrolment status (MKT-ENR-08). */
  refund: Refund | null;
  firstSessionStarted: boolean;
  /** Verified parent after the first session (BR-REV-01), and not yet reviewed this term (BR-REV-02). */
  canReview: boolean;
}

export interface CreateEnrolmentBody {
  groupId: string;
  studentId: string;
  paymentPlan: PaymentPlan;
  /** Monthly and single-month plans. */
  firstSessionId?: string;
  /** Per-session plan. */
  sessionId?: string;
  sharePhone: boolean;
}

export type CheckoutResult =
  | { kind: 'redirect'; checkoutUrl: string }
  | { kind: 'fawry'; fawryReference: string; expiresAt: string };

export interface WaitlistEntry {
  id: string;
  status: 'waiting' | 'offered' | 'converted' | 'expired' | 'left';
  /** 1-based position in line (MKT-ENR-09 AC1). */
  position: number;
}

// ── Reviews (MKT-REV) ──────────────────────────────────────────────────────────
export interface CreateReviewBody {
  enrolmentId: string;
  targetType: 'centre' | 'teacher';
  stars: number;
  tags: ReviewTag[];
  /** ≤ 600 characters (06 reviews.body). */
  body: string;
  visibility: 'public' | 'private';
}

export interface ReviewCreated {
  id: string;
  status: 'pending_checks' | 'published' | 'held';
}
