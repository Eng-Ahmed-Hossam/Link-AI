import { z } from 'zod';
import { CurriculumRef, SchoolYearRef, SubjectRef, Uuid } from './schemas';

/**
 * R2a marketplace contract (07 §2): halls, schedule, room requests, bookings, groups, search and
 * profiles. Names match the api-client types, which become aliases of these.
 */
const named = <T extends z.ZodType>(id: string, s: T) => s.meta({ id });

export const Money = named(
  'Money',
  z.object({
    amountPt: z.number().int().describe('Integer piasters (BR-MNY)'),
    currency: z.literal('EGP'),
  }),
);
const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
/** ISO weekday: 1 = Monday … 7 = Sunday. */
const weekday = z.number().int().min(1).max(7);

export const Facility = named(
  'Facility',
  z.enum(['ac', 'fan', 'projector', 'sound', 'whiteboard', 'smart_board', 'wheelchair']),
);
export const RentBasis = named(
  'RentBasis',
  z.enum(['fixed_per_session', 'per_student_per_session', 'percent_of_fees']),
);
export const RentRule = named(
  'RentRule',
  z.object({ basis: RentBasis, amount: Money.nullable(), percent: z.number().nullable() }),
);
export const WeeklySlot = named('WeeklySlot', z.object({ weekday, start: hhmm, end: hhmm }));
export const SlotState = named('SlotState', z.enum(['free', 'taken', 'closed']));

export const Hall = named(
  'Hall',
  z.object({
    id: z.string(),
    centreId: z.string(),
    name: z.string(),
    capacity: z.number().int(),
    facilities: z.array(Facility),
    rentRule: RentRule,
    listed: z.boolean().describe('Shown on the Link map; an unlisted hall takes no requests'),
    slots: z.array(WeeklySlot.extend({ state: SlotState })),
    freeSlotsPerWeek: z.number().int(),
    photo: z.number().int(),
  }),
);
export const HallList = z.array(Hall);

const RentRuleInput = z.object({
  basis: RentBasis,
  amountPt: z.number().int().nullable().optional(),
  percent: z.number().int().nullable().optional(),
});
export const HallPatch = named(
  'HallPatch',
  z.object({
    name: z.string().max(60).optional(),
    capacity: z.number().int().optional(),
    facilities: z.array(Facility).optional(),
    rentRule: RentRuleInput.optional(),
    listed: z.boolean().optional(),
    closedSlots: z.array(WeeklySlot).optional().describe('Slots the owner keeps closed'),
  }),
);
export const NewHallBody = named(
  'NewHallBody',
  z.object({
    name: z.string().max(60),
    capacity: z.number().int(),
    facilities: z.array(Facility),
    rentRule: RentRuleInput,
  }),
);

export const AutoApproveRules = named(
  'AutoApproveRules',
  z.object({
    enabled: z.boolean(),
    verifiedId: z.boolean(),
    minRating: z.number(),
    fitsCapacity: z.boolean(),
  }),
);

export const CentreLocation = named(
  'CentreLocation',
  z.object({ lat: z.number(), lng: z.number(), address: z.string(), underReview: z.boolean() }),
);
export const CentreProfileEdit = named(
  'CentreProfileEdit',
  z.object({
    id: z.string(),
    slug: z.string(),
    distanceKm: z.number(),
    name: z.string(),
    area: z.string(),
    address: z.string(),
    about: z.string(),
    photos: z.number().int(),
    hours: z.string(),
    liveOnMap: z.boolean(),
    verified: z.boolean(),
    completeness: z.number().int(),
    badges: z.array(z.string()),
    rating: z.object({ avg: z.number(), count: z.number().int() }),
    teachers: z.number().int(),
    halls: z.array(Hall),
    location: CentreLocation,
  }),
);
export const CentrePatch = named(
  'CentrePatch',
  z.object({
    about: z.string().max(600).optional(),
    photos: z.number().int().min(0).max(12).optional(),
    location: z
      .object({ lat: z.number(), lng: z.number(), address: z.string().max(200) })
      .optional()
      .describe('CF-44: a moved pin is under review until Link ops verify it'),
  }),
);

export const ScheduleCell = named(
  'ScheduleCell',
  z.object({
    hallId: z.string(),
    weekday,
    start: hhmm,
    end: hhmm,
    kind: z.enum(['teaching', 'booked', 'free']),
    teacher: z.string().nullable(),
    group: z.string().nullable(),
    seats: z.object({ filled: z.number().int(), cap: z.number().int() }).nullable(),
    startsOn: z.string().nullable(),
    rentRule: RentRule.nullable(),
  }),
);
export const CentreSchedule = named(
  'CentreSchedule',
  z.object({
    days: z.array(weekday),
    dates: z.record(z.string(), z.string()),
    halls: z.array(z.object({ id: z.string(), name: z.string(), capacity: z.number().int() })),
    cells: z.array(ScheduleCell),
    stats: z.object({
      roomUsePercent: z.number().int(),
      freeSlots: z.number().int(),
      averageSeatsFilledPercent: z.number().int(),
      teachersRenting: z.number().int(),
    }),
  }),
);

// ── Room requests (J01–J03, C06) ───────────────────────────────────────────────
export const RequestStage = named(
  'RequestStage',
  z.enum(['requested', 'phone_call', 'meeting', 'approved', 'declined', 'withdrawn']),
);
export const RequestTeacher = named(
  'RequestTeacher',
  z.object({
    id: z.string(),
    name: z.string(),
    rating: z.number().nullable(),
    reviewCount: z.number().int(),
    verifiedId: z.boolean(),
    isNew: z.boolean(),
  }),
);
export const RoomRequest = named(
  'RoomRequest',
  z.object({
    id: z.string(),
    centre: z.object({ id: z.string(), name: z.string(), area: z.string() }),
    hall: z.object({ id: z.string(), name: z.string(), capacity: z.number().int() }),
    teacher: RequestTeacher,
    subject: z.string(),
    schoolYear: z.string(),
    weekdays: z.array(weekday),
    start: hhmm,
    end: hhmm,
    expectedStudents: z.number().int(),
    startsOn: z.string(),
    stage: RequestStage,
    stageAt: z.string().nullable(),
    checks: z.object({
      verifiedId: z.boolean(),
      rating: z.boolean(),
      fitsCapacity: z.boolean(),
      slotFree: z.boolean(),
    }),
    meetsRules: z.boolean(),
    rentRule: RentRule,
    declinedReason: z.string().nullable(),
    createdAt: z.string(),
  }),
);
export const RoomRequestList = z.array(RoomRequest);
export const RoomRequestBody = named(
  'RoomRequestBody',
  z.object({
    hallId: Uuid,
    slots: z.array(WeeklySlot).max(7),
    groupId: z.string().nullable(),
    subjectId: Uuid,
    schoolYearId: Uuid,
    expectedStudents: z.number().int(),
    startsOn: z.iso.date(),
  }),
);
export const RoomRequestsQuery = z.object({
  scope: z.enum(['mine']).optional(),
  centreId: Uuid.optional(),
});
export const StageBody = named(
  'StageBody',
  z.object({ stage: z.enum(['phone_call', 'meeting']), at: z.string().optional() }),
);
export const DeclineBody = named('DeclineBody', z.object({ reason: z.string().max(300) }));
export const EmptyBody = z.object({}).optional();

export const RoomSearchQuery = named(
  'RoomSearchQuery',
  z.object({
    minCapacity: z.coerce.number().int().optional().describe('Seats needed'),
    weekday: z
      .string()
      .regex(/^[1-7](,[1-7])*$/)
      .optional()
      .describe('Comma-separated ISO weekdays: 1 = Monday … 7 = Sunday'),
    radiusKm: z.coerce.number().optional(),
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
  }),
);
export const RoomSearchResult = named(
  'RoomSearchResult',
  z.object({
    hall: z.object({
      id: z.string(),
      name: z.string(),
      capacity: z.number().int(),
      facilities: z.array(Facility),
    }),
    centre: z.object({
      id: z.string(),
      name: z.string(),
      area: z.string(),
      distanceKm: z.number(),
    }),
    freeSlots: z.array(WeeklySlot),
    rentRule: RentRule,
    fits: z.boolean(),
  }),
);
export const RoomSearchList = z.array(RoomSearchResult);
export const RentEstimateBody = named(
  'RentEstimateBody',
  z.object({
    hallId: z.string(),
    slots: z.array(WeeklySlot),
    students: z.number().int().min(0),
    monthlyFeePt: z.number().int().min(0),
  }),
);
export const RentEstimate = named(
  'RentEstimate',
  z.object({
    sessionsPerMonth: z.number().int(),
    fees: Money,
    rent: Money,
    commission: Money,
    commissionPercent: z.number(),
    keep: Money,
    autoApprove: z.object({ enabled: z.boolean(), meets: z.boolean() }),
  }),
);
export const TeacherBooking = named(
  'TeacherBooking',
  z.object({
    id: z.string(),
    centre: z.object({ id: z.string(), name: z.string() }),
    hall: z.object({ id: z.string(), name: z.string(), capacity: z.number().int() }),
    weekdays: z.array(weekday),
    start: hhmm,
    end: hhmm,
    startsOn: z.string(),
    groupId: z.string().nullable(),
    subjectId: z.string().nullable(),
    schoolYearId: z.string().nullable(),
    label: z.string().nullable(),
  }),
);
export const TeacherBookingList = z.array(TeacherBooking);
export const BookingsQuery = z.object({ scope: z.enum(['mine']) });

// ── Teacher profile and groups (J04, J05) ──────────────────────────────────────
export const Verification = named('Verification', z.enum(['verified', 'pending', 'missing']));
const Availability = z.array(z.object({ weekday, am: z.boolean(), pm: z.boolean() }));
export const TeacherSelf = named(
  'TeacherSelf',
  z.object({
    id: z.string(),
    name: z.string(),
    subjects: z.string(),
    yearsExperience: z.number().int(),
    rating: z.number().nullable(),
    reviewCount: z.number().int(),
    openToSlots: z.boolean(),
    about: z.string(),
    verification: z.object({
      nationalId: Verification,
      degree: Verification,
      references: z.object({ added: z.number().int(), needed: z.number().int() }),
    }),
    availability: Availability,
    reviewEachEnrolment: z.boolean(),
    payoutAccount: z.string(),
    teaches: z.array(
      z.object({
        groupId: z.string(),
        subjectId: z.string(),
        schoolYearId: z.string(),
        label: z.string(),
        where: z.string(),
        students: z.number().int(),
        monthlyFee: Money,
      }),
    ),
    profileStatus: z
      .enum(['invited', 'incomplete', 'active'])
      .describe('Parents see the teacher only when active (name and a subject, invite accepted)'),
  }),
);
export const TeacherSelfPatch = named(
  'TeacherSelfPatch',
  z.object({
    displayName: z.string().trim().min(1).max(80).optional(),
    subjectIds: z.array(Uuid).max(12).optional().describe('What the teacher teaches (07 §2)'),
    about: z.string().max(600).optional(),
    openToSlots: z.boolean().optional(),
    availability: Availability.optional(),
    reviewEachEnrolment: z.boolean().optional(),
  }),
);
export const NewGroupBody = named(
  'NewGroupBody',
  z.object({
    bookingId: Uuid,
    subjectId: Uuid,
    schoolYearId: Uuid,
    monthlyFeePt: z.number().int(),
    sessionFeePt: z.number().int(),
    seatCap: z.number().int(),
    offersMonthlyRecurring: z.boolean(),
  }),
);
export const GroupPatch = named(
  'GroupPatch',
  z.object({
    monthlyFeePt: z.number().int().optional(),
    sessionFeePt: z.number().int().optional(),
    seatCap: z.number().int().optional(),
    offersMonthlyRecurring: z.boolean().optional(),
  }),
);
export const Created = named('Created', z.object({ id: z.string() }));
export const Ok = named('Ok', z.object({ ok: z.literal(true) }));

export const TeacherGroup = named(
  'TeacherGroup',
  z.object({
    id: z.string(),
    name: z.string(),
    centre: z.object({ id: z.string(), displayName: z.string() }),
    room: z.string(),
    weekdays: z.array(weekday),
    startTime: hhmm,
    endTime: hhmm,
    sessionFee: Money,
    monthlyFee: Money,
    offersMonthlyRecurring: z.boolean(),
    seatCap: z.number().int(),
    seatsFilled: z.number().int(),
    nextSession: z.object({ id: z.string(), startsAt: z.string() }).nullable(),
    followup: z
      .object({
        studentCount: z.number().int(),
        recordsComplete: z.object({ confirmed: z.number().int(), eligible: z.number().int() }),
        openFollowUps: z.number().int(),
      })
      .nullable(),
  }),
);
export const TeacherGroupList = z.array(TeacherGroup);

// ── Discovery (P02–P06) ────────────────────────────────────────────────────────
export const RatingSummary = named(
  'RatingSummary',
  z.object({ avg: z.string().describe('One decimal: "4.7"'), count: z.number().int() }),
);
export const SeatState = named('SeatState', z.enum(['open', 'waitlist']));
export const SessionSeats = named(
  'SessionSeats',
  z.object({
    id: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    seatsLeft: z.number().int(),
    seatCap: z.number().int(),
  }),
);
export const GroupSummary = named(
  'GroupSummary',
  z.object({
    id: z.string(),
    teacher: z.object({
      id: z.string(),
      slug: z.string(),
      displayName: z.string(),
      rating: RatingSummary.nullable(),
    }),
    centre: z.object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      area: z.string(),
      address: z.string(),
    }),
    room: z.object({ name: z.string() }),
    subject: SubjectRef,
    curriculum: CurriculumRef,
    schoolYear: SchoolYearRef,
    weekdays: z.array(weekday),
    startTime: hhmm,
    endTime: hhmm,
    sessionFee: Money,
    monthlyFee: Money,
    sessionsPerMonth: z.number().int(),
    offersMonthlyRecurring: z.boolean(),
    seatCap: z.number().int(),
    status: z.enum(['published', 'closed']),
    upcomingSessions: z.array(SessionSeats),
  }),
);
export const CentreCard = named(
  'CentreCard',
  z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    area: z.string(),
    distanceKm: z.number().nullable(),
    rating: RatingSummary.nullable(),
    teacherCount: z.number().int(),
    fromSessionFee: Money.nullable(),
    seatState: SeatState,
    verified: z.boolean(),
    lat: z.number(),
    lng: z.number(),
  }),
);
export const TeacherCard = named(
  'TeacherCard',
  z.object({
    id: z.string(),
    slug: z.string(),
    displayName: z.string(),
    subjects: z.array(z.string()),
    rating: RatingSummary.nullable(),
    fromSessionFee: Money.nullable(),
    centreNames: z.array(z.string()),
    verified: z.boolean(),
  }),
);
export const SearchQuery = named(
  'SearchQuery',
  z.object({
    curriculumId: Uuid.optional(),
    schoolYearId: Uuid.optional(),
    subjectId: Uuid.optional(),
    radiusKm: z.coerce.number().positive().max(50).optional(),
    minRating: z.coerce.number().optional(),
    maxFeePt: z.coerce.number().int().optional(),
    seatsOpen: z.stringbool().optional(),
    verifiedOnly: z.stringbool().optional(),
    sort: z.enum(['best_match', 'distance', 'rating', 'fee']).optional(),
    q: z.string().max(80).optional(),
    cursor: z.string().optional(),
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
  }),
);
export const SearchCentresResult = named(
  'SearchCentresResult',
  z.object({
    data: z.array(CentreCard),
    nextCursor: z.string().nullable(),
    totals: z.object({ centres: z.number().int(), teachers: z.number().int() }),
  }),
);
export const TeacherCardPage = named(
  'TeacherCardPage',
  z.object({ data: z.array(TeacherCard), nextCursor: z.string().nullable() }),
);
export const ReviewTag = named(
  'ReviewTag',
  z.enum([
    'communication',
    'organised',
    'location',
    'good_value',
    'explains_clearly',
    'patient',
    'homework_feedback',
    'exam_prep',
  ]),
);
export const PublicReview = named(
  'PublicReview',
  z.object({
    id: z.string(),
    stars: z.number().int(),
    tags: z.array(ReviewTag),
    body: z.string(),
    schoolYearName: z.string(),
    publishedAt: z.string(),
    reply: z.object({ body: z.string(), authorName: z.string() }).nullable(),
  }),
);
export const CentreProfile = named(
  'CentreProfile',
  z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    area: z.string(),
    governorate: z.string(),
    address: z.string(),
    distanceKm: z.number().nullable(),
    verified: z.boolean(),
    hours: z.array(z.object({ weekday, opens: hhmm, closes: hhmm })),
    rating: RatingSummary.nullable(),
    ratingDistribution: z.array(z.object({ stars: z.number().int(), count: z.number().int() })),
    trustBadges: z.array(z.literal('verified')),
    subjects: z.array(
      z.object({ subject: SubjectRef, curriculum: CurriculumRef, yearsLabel: z.string() }),
    ),
    teachers: z.array(TeacherCard.extend({ subjectLabel: z.string() })),
    reviews: z.array(PublicReview),
    lat: z.number(),
    lng: z.number(),
    locationUnderReview: z.boolean(),
  }),
);
export const CentreProfileWithGroups = named(
  'CentreProfileWithGroups',
  CentreProfile.extend({ groupsForChild: z.array(GroupSummary) }),
);
export const CentreBySlugQuery = z.object({
  schoolYearId: Uuid.optional(),
  subjectId: Uuid.optional(),
});
export const TeacherProfile = named(
  'TeacherProfile',
  z.object({
    id: z.string(),
    slug: z.string(),
    displayName: z.string(),
    subjects: z.array(SubjectRef),
    curricula: z.array(CurriculumRef),
    yearsExperience: z.number().int().nullable(),
    bio: z.string().nullable(),
    verified: z.boolean(),
    rating: RatingSummary.nullable(),
    centreCount: z.number().int(),
    tagCounts: z.array(z.object({ tag: ReviewTag, count: z.number().int() })),
    recordedPct: z.number().nullable(),
    groups: z.array(GroupSummary),
    reviews: z.array(PublicReview),
  }),
);

// ── Teacher invites (decided 2026-10-09) ───────────────────────────────────────
export const Invite = named(
  'Invite',
  z.object({
    id: z.string(),
    centre: z.object({ id: z.string(), name: z.string() }),
    role: z.enum(['teacher', 'reception']),
    invitedAt: z.string(),
  }),
);
export const InviteList = z.array(Invite);

export const IdParams = z.object({ id: Uuid });
export const SlugParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/) });
