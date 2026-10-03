/**
 * DRAFT. Hand-written from docs/07-api.md for the mock-data frontend.
 * The client generated from OpenAPI replaces this file in E0-13. Do not extend it with
 * anything the docs do not define; mark placeholders with `// PLACEHOLDER`.
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
}

/** Cursor pagination (07 §1). */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** The 8 enrolment states (08 §4). Refund state lives on `refunds`, not here. */
export type EnrolmentStatus =
  | 'pending_payment'
  | 'awaiting_teacher'
  | 'confirmed'
  | 'past_due'
  | 'cancelled'
  | 'expired'
  | 'declined'
  | 'ended';

/** Seat availability shown on pins and cards (P02, P03, P06). */
export type SeatState = 'open' | 'few' | 'full_waitlist' | 'none';

// GET /v1/search/teachers  (MKT-DSC-01) — PLACEHOLDER shape: fields chosen for P02/P03 cards.
export interface TeacherSummary {
  id: string;
  slug: string;
  displayName: string;
  subjects: string[];
  curricula: Curriculum[];
  verified: boolean;
  /** Ratings come only from verified parents of enrolled students. */
  ratingAvg: number | null;
  ratingCount: number;
  /** "set by each teacher" — the per-session fee of the cheapest open group. */
  fromSessionFee: Money | null;
  distanceKm: number | null;
  seatState: SeatState;
  lat: number;
  lng: number;
}

export interface SearchTeachersQuery {
  curriculumId?: Curriculum;
  schoolYearId?: string;
  subjectId?: string;
  /** Default 5 (P02/P03). */
  radiusKm?: number;
  cursor?: string;
}
