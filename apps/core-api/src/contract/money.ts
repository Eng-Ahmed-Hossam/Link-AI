import { z } from 'zod';
import { GroupSummary, Money, RentRule, ReviewTag } from './market';
import { Child, Uuid } from './schemas';

/**
 * R2b contract (07 §2): enrolment and payment, waitlist, the teacher's enrolments and earnings,
 * the centre's rent income, reviews. Names match the api-client types, which become aliases.
 */
const named = <T extends z.ZodType>(id: string, s: T) => s.meta({ id });

export const EnrolmentStatus = named(
  'EnrolmentStatus',
  z
    .enum([
      'pending_payment',
      'awaiting_teacher',
      'confirmed',
      'past_due',
      'cancelled',
      'expired',
      'declined',
      'ended',
    ])
    .describe('The 8 states of 08 §4; refund state lives on the refund (BR-ENR-14)'),
);
export const PaymentPlan = named(
  'PaymentPlan',
  z.enum(['monthly_recurring', 'single_month', 'per_session']),
);
export const PaymentMethod = named('PaymentMethod', z.enum(['card', 'fawry', 'wallet']));
export const RefundStatus = named(
  'RefundStatus',
  z.enum(['requested', 'approved', 'processing', 'succeeded', 'failed', 'rejected']),
);
export const Refund = named(
  'Refund',
  z.object({
    id: z.string(),
    status: RefundStatus,
    amount: Money,
    policy: z.enum([
      'before_first_session',
      'dispute',
      'teacher_declined',
      'group_cancelled',
      'late_payment_no_seat',
    ]),
    createdAt: z.string(),
  }),
);

export const Enrolment = named(
  'Enrolment',
  z.object({
    id: z.string(),
    reference: z.string().describe('Human reference, e.g. LNK-20931 (MKT-ENR-06)'),
    status: EnrolmentStatus,
    plan: PaymentPlan,
    method: PaymentMethod.nullable(),
    group: GroupSummary,
    student: Child,
    price: Money.describe('Fee snapshot at reservation (OD-39)'),
    holdExpiresAt: z.string().nullable(),
    sessionIds: z.array(z.string()).describe('Sessions of the paid period (BR-ENR-13)'),
    firstSession: z.object({ id: z.string(), startsAt: z.string() }),
    phoneShared: z.boolean(),
    teacherReviewsEnrolments: z.boolean(),
    renewsOn: z.string().nullable(),
    payment: z
      .object({
        amount: Money,
        method: PaymentMethod,
        cardLast4: z.string().nullable(),
        paidAt: z.string(),
      })
      .nullable()
      .describe(
        'Receipt once the webhook confirmed the payment (never from a redirect, BR-MNY-12)',
      ),
    lastPaymentFailed: z.boolean(),
    fawry: z.object({ reference: z.string(), expiresAt: z.string() }).nullable(),
    refund: Refund.nullable(),
    firstSessionStarted: z.boolean(),
    canReview: z.boolean(),
  }),
);
export const EnrolmentPage = named(
  'EnrolmentPage',
  z.object({ data: z.array(Enrolment), nextCursor: z.string().nullable() }),
);
export const CreateEnrolmentBody = named(
  'CreateEnrolmentBody',
  z.object({
    groupId: Uuid,
    studentId: Uuid,
    paymentPlan: PaymentPlan,
    firstSessionId: Uuid.optional().describe('Monthly and single-month plans'),
    sessionId: Uuid.optional().describe('Per-session plan'),
    sharePhone: z.boolean(),
  }),
);
export const CheckoutBody = named('CheckoutBody', z.object({ method: PaymentMethod }));
export const CheckoutResult = named(
  'CheckoutResult',
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('redirect'),
      checkoutUrl: z.string().describe("The provider's hosted page (no card field in Link)"),
    }),
    z.object({ kind: z.literal('fawry'), fawryReference: z.string(), expiresAt: z.string() }),
  ]),
);
export const RefundRequestBody = named(
  'RefundRequestBody',
  z.object({ reason: z.string().max(600).optional() }).optional(),
);

export const WaitlistBody = named('WaitlistBody', z.object({ studentId: Uuid }));
export const WaitlistEntry = named(
  'WaitlistEntry',
  z.object({
    id: z.string(),
    status: z.enum(['waiting', 'offered', 'converted', 'expired', 'left']),
    position: z.number().int().describe('1-based place in line (MKT-ENR-09 AC1)'),
  }),
);
export const WaitlistAcceptBody = named(
  'WaitlistAcceptBody',
  z.object({ paymentPlan: PaymentPlan, method: PaymentMethod }),
);

export const TeacherEnrolment = named(
  'TeacherEnrolment',
  z.object({
    id: z.string(),
    student: z.string(),
    parent: z.string(),
    group: z.object({ id: z.string(), name: z.string(), centre: z.string(), room: z.string() }),
    plan: PaymentPlan,
    method: PaymentMethod.nullable(),
    status: z.string(),
    paid: Money.nullable(),
    createdAt: z.string(),
    canDecide: z.boolean().describe('Only with reviewEachEnrolment on (OD-08)'),
  }),
);
export const TeacherEnrolmentList = z.array(TeacherEnrolment);

export const Earnings = named(
  'Earnings',
  z.object({
    month: z.string(),
    keep: Money.describe('What the teacher keeps this month, after Link commission and rent'),
    nextPayout: z.object({ on: z.string(), amount: Money, account: z.string() }),
    parentsPaid: Money,
    commission: Money,
    commissionPercent: z.number(),
    rent: z.array(
      z.object({ centre: z.string(), hall: z.string(), rule: RentRule, amount: Money }),
    ),
    rentTotal: Money,
    byGroup: z.array(
      z.object({ id: z.string(), name: z.string(), students: z.number().int(), amount: Money }),
    ),
    methods: z.array(z.object({ method: PaymentMethod, percent: z.number() })),
  }),
);

export const RentIncomeRow = named(
  'RentIncomeRow',
  z.object({
    teacher: z.object({ id: z.string(), name: z.string() }),
    hall: z.object({ id: z.string(), name: z.string() }),
    sessions: z.number().int(),
    studentSessions: z.number().int(),
    rentRule: RentRule,
    feesBase: Money.nullable(),
    rent: Money,
    linkFee: Money,
    net: Money,
    paidVia: z.enum(['link', 'due']),
    dueOn: z.string().nullable(),
  }),
);
export const RentIncome = named(
  'RentIncome',
  z.object({
    month: z.string(),
    feePercent: z.number(),
    rows: z.array(RentIncomeRow),
    totals: z.object({
      rentDue: Money,
      collected: Money,
      outstanding: Money,
      linkFee: Money,
      net: Money,
    }),
    teachers: z.number().int(),
    halls: z.number().int(),
    roomUsePercent: z.number(),
    nextTransfer: z.object({ on: z.string(), amount: Money, account: z.string() }),
  }),
);

export const CreateReviewBody = named(
  'CreateReviewBody',
  z.object({
    enrolmentId: Uuid,
    targetType: z.enum(['centre', 'teacher']),
    stars: z.number().int().min(1).max(5),
    tags: z.array(ReviewTag).max(8),
    body: z.string().max(600),
    visibility: z.enum(['public', 'private']),
  }),
);
export const ReviewCreated = named(
  'ReviewCreated',
  z.object({ id: z.string(), status: z.enum(['pending_checks', 'published', 'held']) }),
);
export const ReviewReceived = named(
  'ReviewReceived',
  z.object({
    id: z.string(),
    target: z.object({ kind: z.enum(['centre', 'teacher']), name: z.string() }),
    stars: z.number().int(),
    body: z.string(),
    schoolYear: z.string(),
    createdAt: z.string(),
    visibility: z.enum(['public', 'private']),
    reply: z.object({ body: z.string(), at: z.string() }).nullable(),
    reported: z.object({ reason: z.string(), at: z.string() }).nullable(),
  }),
);
export const ReviewsReceived = named(
  'ReviewsReceived',
  z.object({
    summary: z.object({
      centre: z.object({ rating: z.number(), count: z.number().int() }),
      teachers: z.array(
        z.object({ name: z.string(), rating: z.number(), count: z.number().int() }),
      ),
      privateThisMonth: z.number().int(),
    }),
    counts: z.object({
      public: z.number().int(),
      private: z.number().int(),
      reported: z.number().int(),
    }),
    mentions: z.array(z.object({ tag: z.string(), count: z.number().int() })),
    items: z.array(ReviewReceived),
  }),
);
export const ReviewsReceivedQuery = z.object({
  centreId: Uuid.optional(),
  visibility: z.enum(['public', 'private']).optional(),
  status: z.enum(['reported']).optional(),
});
export const ReplyBody = named('ReplyBody', z.object({ body: z.string().max(600) }));
export const ReportBody = named('ReportBody', z.object({ reason: z.string().max(600) }));
export const WebhookAck = named(
  'WebhookAck',
  z.object({ received: z.literal(true), outcome: z.string() }),
);
export const ProviderParams = z.object({ provider: z.string().max(20) });
