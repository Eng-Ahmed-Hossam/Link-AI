/**
 * DRAFT. Hand-written from docs/07-api.md for the mock-data frontend.
 * The client generated from OpenAPI replaces this file in E0-13. Fields the docs do not define
 * are marked `// PLACEHOLDER (<screen>)` and listed in the batch report.
 */

/** BR-MNY: money is always integer piasters. */
export interface Money {
  amountPt: number;
  currency: 'EGP';
}

export type Curriculum = 'NATIONAL' | 'IGCSE' | 'AMERICAN' | 'NILE';

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
export type Role = 'parent' | 'teacher' | 'centre_owner' | 'centre_staff';

export interface OtpRequestResult {
  /** Seconds until "Resend" is allowed (AC2: 60). */
  resendAfterSeconds: number;
  /** Code lifetime (AC2: 5 minutes). */
  expiresInSeconds: number;
}

export interface OtpVerifyResult {
  accessToken: string;
  refreshToken: string;
  user: Me;
  /** True when the phone had no account: the client then adds the chosen role (MKT-ACC-02). */
  isNewUser: boolean;
}

export interface Me {
  id: string;
  name: string | null;
  language: 'ar' | 'en';
  roles: Role[];
}

/** PATCH /v1/me (07 §2a P-1). PLACEHOLDER (Account). */
export interface UpdateMeBody {
  name?: string;
  language?: 'ar' | 'en';
}

/** `consent_events.kind` (06). */
export type ConsentKind =
  | 'terms'
  | 'privacy'
  | 'child_data_processing'
  | 'share_phone_with_teacher'
  | 'whatsapp_updates'
  | 'sms_updates'
  | 'focus_plans'
  | 'ai_training_use';

/** PUT /v1/me/consents (07 §2a P-2). PLACEHOLDER (Account). */
export interface PutConsentBody {
  kind: ConsentKind;
  granted: boolean;
  /** Text version the person saw. */
  version: string;
  studentId?: string;
}

/** Current state: the latest consent_events row per (person, student, kind). Never cached. */
export interface ConsentState {
  kind: ConsentKind;
  studentId: string | null;
  granted: boolean;
  version: string;
  at: string;
}

export interface CurriculumRef {
  id: string;
  code: Curriculum;
  name: string;
}
export interface SchoolYearRef {
  id: string;
  code: string;
  name: string;
  /** Short form for chips: "Sec 2". PLACEHOLDER (P02) — ref data has only `name`. */
  shortName: string;
}
export interface SubjectRef {
  id: string;
  code: string;
  name: string;
}

export interface Child {
  id: string;
  displayName: string;
  curriculum: CurriculumRef;
  schoolYear: SchoolYearRef;
}

// ── Discovery (MKT-DSC) ────────────────────────────────────────────────────────
export interface RatingSummary {
  /** Average of published public reviews (BR-REV-07), one decimal: "4.7". */
  avg: string;
  count: number;
}

/** Seat availability shown on pins and cards (P02, P03, P06). */
/** CF-28 (closed): every full group accepts a waitlist, so there is no "No seats" state in Phase 1. */
export type SeatState = 'open' | 'waitlist';

export interface CentreCard {
  id: string;
  slug: string;
  name: string;
  area: string;
  distanceKm: number | null;
  rating: RatingSummary | null;
  /** Teachers for the searched subject at this centre. */
  teacherCount: number;
  /** Lowest per-session fee among matching groups. */
  fromSessionFee: Money | null;
  seatState: SeatState;
  verified: boolean;
  lat: number;
  lng: number;
}

export interface TeacherCard {
  id: string;
  slug: string;
  displayName: string;
  subjects: string[];
  rating: RatingSummary | null;
  fromSessionFee: Money | null;
  centreNames: string[];
  verified: boolean;
}

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

export interface SearchCentresResult extends Page<CentreCard> {
  /** "12 centres • 31 Maths teachers within 5 km" (MKT-DSC-02 AC3). PLACEHOLDER (P03). */
  totals: { centres: number; teachers: number };
}

export interface SessionSeats {
  id: string;
  startsAt: string;
  endsAt: string;
  /** seat_cap − seats used(s), per session (BR-ENR-02). */
  seatsLeft: number;
  seatCap: number;
}

export interface GroupSummary {
  id: string;
  teacher: { id: string; slug: string; displayName: string; rating: RatingSummary | null };
  centre: { id: string; slug: string; name: string; area: string; address: string };
  room: { name: string };
  subject: SubjectRef;
  curriculum: CurriculumRef;
  schoolYear: SchoolYearRef;
  /** ISO weekdays (1 = Monday … 7 = Sunday). */
  weekdays: number[];
  /** Local Cairo times, "17:00". */
  startTime: string;
  endTime: string;
  sessionFee: Money;
  monthlyFee: Money;
  /** For information only (BR-PMT-04). */
  sessionsPerMonth: number;
  offersMonthlyRecurring: boolean;
  seatCap: number;
  status: 'published' | 'closed';
  /** Upcoming sessions with seats left (07: GET /v1/groups/{id}). */
  upcomingSessions: SessionSeats[];
}

export type ReviewTag =
  | 'communication'
  | 'organised'
  | 'location'
  | 'good_value'
  | 'explains_clearly'
  | 'patient'
  | 'homework_feedback'
  | 'exam_prep';

export interface PublicReview {
  id: string;
  stars: number;
  tags: ReviewTag[];
  body: string;
  /** Shown as "Verified parent • <school year>" (BR-REV-03). */
  schoolYearName: string;
  publishedAt: string;
  reply: { body: string; authorName: string } | null;
}

/** Trust badges come from Link's data, never from the owner (MKT-DSC-04). */
export type TrustBadge = 'verified';

export interface CentreProfile {
  id: string;
  slug: string;
  name: string;
  area: string;
  governorate: string;
  address: string;
  distanceKm: number | null;
  verified: boolean;
  /** Opening hours per weekday (ISO), Cairo local. */
  hours: { weekday: number; opens: string; closes: string }[];
  rating: RatingSummary | null;
  /** Star → count, for the distribution bars. PLACEHOLDER (P04). */
  ratingDistribution: { stars: number; count: number }[];
  trustBadges: TrustBadge[];
  subjects: { subject: SubjectRef; curriculum: CurriculumRef; yearsLabel: string }[];
  teachers: (TeacherCard & { subjectLabel: string })[];
  reviews: PublicReview[];
  lat: number;
  lng: number;
}

export interface TeacherProfile {
  id: string;
  slug: string;
  displayName: string;
  subjects: SubjectRef[];
  curricula: CurriculumRef[];
  yearsExperience: number | null;
  bio: string | null;
  verified: boolean;
  rating: RatingSummary | null;
  centreCount: number;
  /** "What parents mention most" (MKT-DSC-05 AC1). */
  tagCounts: { tag: ReviewTag; count: number }[];
  /** Phase 2 "% recorded" badge (flag `teacher.recorded_badge`). Null in Phase 1. */
  recordedPct: number | null;
  groups: GroupSummary[];
  reviews: PublicReview[];
}

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
