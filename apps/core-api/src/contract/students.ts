import { z } from 'zod';
import { IdParams, Ok } from './market';
import type { RouteDef } from './routes';
import { CurriculumRef, SchoolYearRef, SubjectRef, Uuid } from './schemas';

/**
 * Database v2 (docs/plan/database-v2.md §8): student accounts and what students and parents read
 * — schedule changes, "what you missed", homework, approved teacher notes, topic scores, the
 * weekly focus checklist — and the teacher and centre sides that write them. A student session
 * answers only `/v1/me/*` student routes; a parent reads the same views of their own child under
 * `/v1/children/{id}/*` (the parent sees everything the child sees). Nothing here compares a
 * student with classmates.
 */
const named = <T extends z.ZodType>(id: string, s: T) => s.meta({ id });
const def = <T extends RouteDef>(r: T) => r;
const iso = z.string().describe('ISO 8601');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ChildParams = z.object({ id: Uuid });
const STUDENT_ONLY = { status: 403, code: 'students_only' };

// ── Student accounts ───────────────────────────────────────────────────────────
export const StudentDevice = named(
  'StudentDevice',
  z.object({
    id: z.string(),
    platform: z.enum(['web', 'ios', 'android']),
    label: z.string().describe('Generated from the browser or app ("Chrome on Android")'),
    pinSet: z.boolean(),
    lastUsedAt: iso.nullable(),
    addedAt: iso,
  }),
);
export const StudentAccount = named(
  'StudentAccount',
  z.object({
    account: z
      .object({
        studentId: z.string(),
        status: z.enum(['awaiting_device', 'active', 'paused', 'locked', 'closed']),
        failedPinCount: z.number().int(),
        lockedAt: iso.nullable(),
        pausedAt: iso.nullable(),
        devices: z.array(StudentDevice).describe('Live devices (at most 2)'),
        maxDevices: z.number().int(),
        createdAt: iso,
      })
      .nullable(),
  }),
);
export const StudentAccessCode = named(
  'StudentAccessCode',
  z.object({
    code: z.string().describe('Shown once, e.g. K7QM-3XPD; one use; 10 minutes'),
    expiresAt: iso,
  }),
);
export const RedeemBody = named(
  'StudentRedeemBody',
  z.object({
    code: z.string().min(4).max(20),
    platform: z.enum(['web', 'ios', 'android']),
    label: z.string().trim().min(1).max(60).optional(),
    deviceId: Uuid.optional().describe('A device already bound to this account: resets its PIN'),
    deviceSecret: z.string().min(20).max(200).optional(),
  }),
);
export const RedeemResult = named(
  'StudentRedeemResult',
  z.object({
    deviceId: z.string(),
    deviceSecret: z
      .string()
      .optional()
      .describe('A new device only: shown once; keep it in secure storage'),
    pinSetupToken: z.string(),
    expiresInSeconds: z.number().int(),
  }),
);
const Pin = z.string().regex(/^[0-9٠-٩]{4}$/, 'four digits');
export const PinBody = named('StudentPinBody', z.object({ pinSetupToken: z.string(), pin: Pin }));
export const StudentSignInBody = named(
  'StudentSignInBody',
  z.object({ deviceId: Uuid, deviceSecret: z.string().min(20).max(200), pin: Pin }),
);
export const StudentMe = named(
  'StudentMe',
  z.object({
    studentId: z.string(),
    displayName: z.string(),
    curriculum: CurriculumRef,
    schoolYear: SchoolYearRef,
    groups: z.array(
      z.object({
        groupId: z.string(),
        subject: SubjectRef,
        teacherName: z.string(),
        centreName: z.string(),
      }),
    ),
  }),
);
export const StudentTokens = named(
  'StudentTokens',
  z.object({
    accessToken: z.string().optional().describe('App only; the web gets cookies'),
    refreshToken: z.string().optional(),
    student: StudentMe,
  }),
);

// ── Schedule and its changes ───────────────────────────────────────────────────
export const ScheduleSession = named(
  'ScheduleSession',
  z.object({
    sessionId: z.string(),
    groupId: z.string(),
    subject: SubjectRef,
    startsAt: iso,
    endsAt: iso,
    status: z.enum(['scheduled', 'held', 'cancelled', 'not_held']),
    hall: z.string().nullable(),
    makeup: z.boolean().describe('An accepted make-up in another group'),
  }),
);
export const SessionChange = named(
  'SessionChange',
  z.object({
    id: z.string(),
    sessionId: z.string(),
    groupId: z.string(),
    subject: SubjectRef,
    kind: z.enum(['moved', 'cancelled', 'room_changed']),
    oldStartsAt: iso,
    newStartsAt: iso,
    oldEndsAt: iso,
    newEndsAt: iso,
    oldHall: z.string().nullable(),
    newHall: z.string().nullable(),
    reason: z.string().nullable(),
    changedAt: iso,
  }),
);
export const Notification = named(
  'InAppNotification',
  z.object({
    id: z.string(),
    kind: z.enum([
      'session_moved',
      'session_cancelled',
      'session_room_changed',
      'makeup_requested',
      'makeup_decided',
      'note_approved',
      'homework_set',
    ]),
    objectType: z.string(),
    objectId: z.string(),
    studentId: z.string().nullable(),
    groupId: z.string().nullable(),
    readAt: iso.nullable(),
    createdAt: iso,
  }),
);
export const MoveSessionBody = named(
  'MoveSessionBody',
  z
    .object({
      startsAt: iso.optional(),
      endsAt: iso.optional(),
      roomId: Uuid.nullable()
        .optional()
        .describe('A one-off hall of the centre; null = the usual hall'),
      reason: z.string().trim().min(1).max(300),
    })
    .refine((b) => b.startsAt !== undefined || b.roomId !== undefined, 'nothing to change'),
);
export const MovedSession = named(
  'MovedSession',
  z.object({
    sessionId: z.string(),
    startsAt: iso,
    endsAt: iso,
    roomId: z.string().nullable(),
    changes: z.array(z.enum(['moved', 'room_changed'])),
  }),
);

// ── What you missed and homework ───────────────────────────────────────────────
export const HomeworkView = named(
  'HomeworkItemView',
  z.object({
    id: z.string(),
    groupId: z.string(),
    subject: SubjectRef,
    sessionId: z.string(),
    title: z.string(),
    details: z.string().nullable(),
    dueSessionId: z.string().nullable(),
    dueAt: iso.nullable(),
    setAt: iso,
    status: z
      .enum(['set', 'handed_in', 'late'])
      .describe('`set` after its due session = "Not marked yet", never "missing"'),
    markedAt: iso.nullable(),
  }),
);
export const MissedSession = named(
  'MissedSession',
  z.object({
    sessionId: z.string(),
    groupId: z.string(),
    subject: SubjectRef,
    sessionDate: day,
    topicCovered: z.string().nullable().describe('null = "Not recorded"'),
    homeworkSet: z.string().nullable(),
    topics: z.array(z.object({ id: z.string(), name: z.string() })),
    homework: z.array(HomeworkView),
    makeupRequestId: z.string().nullable(),
  }),
);
export const SessionLearning = named(
  'SessionLearning',
  z.object({
    recordId: z.string(),
    status: z.enum(['draft', 'confirmed']),
    topicCovered: z.string().nullable(),
    homeworkSet: z.string().nullable(),
    topicIds: z.array(z.string()),
    homework: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        details: z.string().nullable(),
        dueSessionId: z.string().nullable(),
        source: z.enum(['tap', 'voice']),
      }),
    ),
  }),
);
export const SessionLearningBody = named(
  'SessionLearningBody',
  z.object({
    topicCovered: z.string().trim().min(1).max(300).nullable().optional(),
    homeworkSet: z.string().trim().min(1).max(500).nullable().optional(),
    topicIds: z.array(Uuid).max(20).optional(),
    homework: z
      .array(
        z.object({
          id: Uuid.optional().describe(
            'An existing item to keep or edit; items left out are removed',
          ),
          title: z.string().trim().min(1).max(200),
          details: z.string().trim().max(500).nullable().optional(),
          dueSessionId: Uuid.nullable().optional(),
          source: z.enum(['tap', 'voice']).optional(),
        }),
      )
      .max(10)
      .optional(),
  }),
);
export const HomeworkMarksBody = named(
  'HomeworkMarksBody',
  z.object({
    marks: z
      .array(
        z.object({
          homeworkItemId: Uuid,
          studentId: Uuid,
          status: z.enum(['handed_in', 'late', 'set']),
        }),
      )
      .min(1)
      .max(200),
  }),
);
export const HomeworkMarks = named(
  'HomeworkMarks',
  z.object({
    recordId: z.string(),
    marks: z.array(
      z.object({
        homeworkItemId: z.string(),
        studentId: z.string(),
        status: z.enum(['set', 'handed_in', 'late']),
      }),
    ),
  }),
);
export const LearningCorrectionBody = named(
  'LearningCorrectionBody',
  z.object({
    field: z.enum(['topic_covered', 'homework_set']),
    newValue: z.string().trim().min(1).max(500).nullable(),
    reason: z.string().trim().min(1).max(500),
  }),
);

// ── Make-up requests ───────────────────────────────────────────────────────────
export const MakeupRequest = named(
  'MakeupRequest',
  z.object({
    id: z.string(),
    studentId: z.string(),
    studentName: z.string(),
    groupId: z.string(),
    subject: SubjectRef,
    missedSessionId: z.string(),
    missedStartsAt: iso,
    requestedBy: z.enum(['student', 'parent']),
    note: z.string().nullable(),
    status: z.enum(['requested', 'accepted', 'declined', 'withdrawn']),
    parentSeenAt: iso.nullable(),
    decidedAt: iso.nullable(),
    decisionNote: z.string().nullable(),
    makeupSessionId: z.string().nullable(),
    makeupStartsAt: iso.nullable(),
    createdAt: iso,
  }),
);
export const NewMakeupBody = named(
  'NewMakeupBody',
  z.object({
    missedSessionId: Uuid,
    studentId: Uuid.optional().describe('Parent only: which child'),
    note: z.string().trim().max(300).optional(),
  }),
);
export const AcceptMakeupBody = named(
  'AcceptMakeupBody',
  z.object({ makeupSessionId: Uuid, note: z.string().trim().max(300).optional() }),
);
export const DeclineMakeupBody = named(
  'DeclineMakeupBody',
  z.object({ note: z.string().trim().max(300).optional() }),
);

// ── Teacher notes for the student ──────────────────────────────────────────────
export const StudentNote = named(
  'StudentNote',
  z.object({
    id: z.string(),
    studentId: z.string(),
    studentName: z.string(),
    groupId: z.string(),
    subject: SubjectRef,
    teacherName: z.string(),
    body: z.string(),
    status: z.enum(['draft', 'submitted', 'approved', 'rejected']),
    rejectedReason: z.string().nullable(),
    approvedAt: iso.nullable(),
    createdAt: iso,
  }),
);
export const NewStudentNoteBody = named(
  'NewStudentNoteBody',
  z.object({ studentId: Uuid, body: z.string().trim().min(1).max(500) }),
);
export const RejectNoteBody = named(
  'RejectNoteBody',
  z.object({ reason: z.string().trim().min(1).max(300) }),
);

// ── Topic map, tagging, scores ─────────────────────────────────────────────────
export const TopicMap = named(
  'TopicMap',
  z.object({
    id: z.string(),
    subjectId: z.string(),
    academicYear: z.string(),
    name: z.string(),
    confirmed: z.boolean().describe('false = sample map until OD-07 is decided'),
    units: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        topics: z.array(z.object({ id: z.string(), name: z.string() })),
      }),
    ),
  }),
);
export const ItemTopicsBody = named(
  'ItemTopicsBody',
  z.union([
    z.object({ mode: z.literal('whole_quiz'), topicIds: z.array(Uuid).min(1).max(10) }),
    z.object({
      mode: z.literal('per_question'),
      questions: z
        .array(
          z.object({
            label: z.string().trim().min(1).max(40),
            maxMarks: z.number().positive().max(1000),
            topicIds: z.array(Uuid).min(1).max(5),
          }),
        )
        .min(1)
        .max(50),
    }),
  ]),
);
export const ItemTopics = named(
  'ItemTopics',
  z.object({
    assessmentId: z.string(),
    mode: z.enum(['none', 'whole_quiz', 'per_question']),
    questions: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        maxMarks: z.number(),
        topicIds: z.array(z.string()),
      }),
    ),
  }),
);
export const QuestionMarksBody = named(
  'QuestionMarksBody',
  z.object({
    marks: z
      .array(z.object({ questionId: Uuid, studentId: Uuid, marks: z.number().min(0) }))
      .min(1)
      .max(2000),
  }),
);
const Band = z.enum([
  'mastered',
  'improving',
  'needs_practice',
  'not_enough_data',
  'not_taught_yet',
]);
export const TopicScore = named(
  'TopicScore',
  z.object({
    topicId: z.string(),
    name: z.string(),
    unitId: z.string(),
    quizCount: z.number().int(),
    score: z.number().int().nullable().describe('0–100; null under 2 quizzes'),
    band: Band,
    stars: z.number().int().min(0).max(3),
    lastMonth: z
      .object({ score: z.number().int().nullable(), band: Band })
      .nullable()
      .describe('The snapshot of the month before'),
  }),
);
export const SubjectProgress = named(
  'SubjectProgress',
  z.object({
    groupId: z.string(),
    subject: SubjectRef,
    level: z.number().int().describe('1 + floor(stars ÷ 10), per subject (ANL-STU-01)'),
    stars: z.number().int(),
    topics: z.array(TopicScore),
  }),
);
export const StudentProgress = named(
  'StudentProgress',
  z.object({ studentId: z.string(), subjects: z.array(SubjectProgress) }),
);
export const TeacherTopicScores = named(
  'TeacherTopicScores',
  z.object({
    groupId: z.string(),
    students: z.array(
      z.object({ studentId: z.string(), name: z.string(), topics: z.array(TopicScore) }),
    ),
  }),
);

// ── Weekly focus checklist ─────────────────────────────────────────────────────
export const FocusPlan = named(
  'FocusPlan',
  z.object({
    id: z.string(),
    studentId: z.string(),
    groupId: z.string(),
    subject: SubjectRef,
    weekOf: day,
    status: z.enum(['drafted', 'approved', 'skipped']),
    items: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        topicId: z.string().nullable(),
        tickedAt: iso.nullable(),
      }),
    ),
  }),
);
export const NewFocusPlanBody = named(
  'NewFocusPlanBody',
  z.object({
    studentId: Uuid,
    weekOf: day,
    items: z
      .array(
        z.object({
          textAr: z.string().trim().min(1).max(200),
          textEn: z.string().trim().min(1).max(200).optional(),
          topicId: Uuid.optional(),
        }),
      )
      .min(1)
      .max(7),
  }),
);
export const TickBody = named('TickBody', z.object({ ticked: z.boolean() }));

const page = <T extends z.ZodType>(id: string, item: T) =>
  named(id, z.object({ items: z.array(item) }));
export const ScheduleSessionPage = page('ScheduleSessionPage', ScheduleSession);
export const SessionChangePage = page('SessionChangePage', SessionChange);
export const NotificationPage = page('InAppNotificationPage', Notification);
export const MissedSessionPage = page('MissedSessionPage', MissedSession);
export const HomeworkPage = page('HomeworkPage', HomeworkView);
export const MakeupRequestPage = page('MakeupRequestPage', MakeupRequest);
export const StudentNotePage = page('StudentNotePage', StudentNote);
export const FocusPlanPage = page('FocusPlanPage', FocusPlan);

const DeviceParams = z.object({ id: Uuid, deviceId: Uuid });
const GroupQuery = z.object({ groupId: Uuid.optional() });
const RangeQuery = z.object({ from: day.optional(), to: day.optional() });

const parentAccount = (
  name: string,
  method: RouteDef['method'],
  suffix: string,
  summary: string,
  extra: { status?: number; errors?: RouteDef['errors'] } = {},
) =>
  def({
    name,
    method,
    path: `/v1/children/{id}/student-account${suffix}`,
    summary,
    tag: 'students',
    rules: ['STU-ACC-01'],
    auth: 'user',
    params: ChildParams,
    response: StudentAccount,
    ...(method === 'get' ? {} : { idempotent: true }),
    ...extra,
  });

export const studentRoutes = {
  // ── Parent: the child's student account ──────────────────────────────────────
  createStudentAccount: parentAccount(
    'createStudentAccount',
    'post',
    '',
    'Create the child’s student account (only a parent; records the student_account consent)',
    { status: 201, errors: [{ status: 409, code: 'student_account_exists' }] },
  ),
  getStudentAccount: parentAccount('getStudentAccount', 'get', '', 'The child’s student account'),
  newStudentAccessCode: def({
    name: 'newStudentAccessCode',
    method: 'post',
    path: '/v1/children/{id}/student-account/access-codes',
    summary: 'A one-time code for one device (10 minutes); cancels the previous code',
    tag: 'students',
    rules: ['STU-ACC-01'],
    auth: 'user',
    idempotent: true,
    params: ChildParams,
    response: StudentAccessCode,
    status: 201,
    errors: [{ status: 409, code: 'student_account_closed' }],
  }),
  pauseStudentAccount: parentAccount(
    'pauseStudentAccount',
    'post',
    '/pause',
    'Pause: every session stops at its next request',
  ),
  resumeStudentAccount: parentAccount(
    'resumeStudentAccount',
    'post',
    '/resume',
    'Resume a paused account',
  ),
  signOutStudentEverywhere: parentAccount(
    'signOutStudentEverywhere',
    'post',
    '/sign-out-everywhere',
    'Sign out of every device and unbind them all (a new code is needed)',
  ),
  removeStudentDevice: def({
    name: 'removeStudentDevice',
    method: 'delete',
    path: '/v1/children/{id}/student-account/devices/{deviceId}',
    summary: 'Remove one device: it stops working on its next request',
    tag: 'students',
    rules: ['STU-ACC-01'],
    auth: 'user',
    idempotent: true,
    params: DeviceParams,
    response: StudentAccount,
  }),
  // ── Student device sign-in (public) ──────────────────────────────────────────
  redeemStudentCode: def({
    name: 'redeemStudentCode',
    method: 'post',
    path: '/v1/auth/student/redeem',
    summary: 'Use the parent’s one-time code on this device; then set the PIN',
    tag: 'auth',
    rules: ['STU-ACC-01'],
    auth: 'public',
    body: RedeemBody,
    response: RedeemResult,
    errors: [
      { status: 422, code: 'code_invalid' },
      { status: 409, code: 'student_device_limit' },
      { status: 403, code: 'student_paused' },
      { status: 429, code: 'rate_limited' },
    ],
  }),
  setStudentPin: def({
    name: 'setStudentPin',
    method: 'post',
    path: '/v1/auth/student/pin',
    summary: 'Set the 4-digit PIN on this device; signs the student in',
    tag: 'auth',
    rules: ['STU-ACC-01'],
    auth: 'public',
    body: PinBody,
    response: StudentTokens,
    errors: [{ status: 422, code: 'pin_setup_expired' }],
  }),
  studentSignIn: def({
    name: 'studentSignIn',
    method: 'post',
    path: '/v1/auth/student/sign-in',
    summary: 'Sign in with this device and its PIN',
    tag: 'auth',
    rules: ['STU-ACC-01'],
    auth: 'public',
    body: StudentSignInBody,
    response: StudentTokens,
    errors: [
      { status: 401, code: 'wrong_pin' },
      { status: 401, code: 'student_device_unknown' },
      { status: 423, code: 'student_locked' },
      { status: 403, code: 'student_paused' },
      { status: 429, code: 'rate_limited' },
    ],
  }),
  // ── Student reads ────────────────────────────────────────────────────────────
  studentMe: def({
    name: 'getStudentMe',
    method: 'get',
    path: '/v1/me/student',
    summary: 'The signed-in student: name, curriculum, school year, groups',
    tag: 'students',
    rules: ['STU-ACC-01'],
    auth: 'user',
    response: StudentMe,
    errors: [STUDENT_ONLY],
  }),
  mySchedule: def({
    name: 'getMySchedule',
    method: 'get',
    path: '/v1/me/schedule',
    summary: 'The student’s sessions (default: the next 14 days)',
    tag: 'students',
    rules: ['STU-SCH-01'],
    auth: 'user',
    query: RangeQuery,
    response: ScheduleSessionPage,
    errors: [STUDENT_ONLY],
  }),
  myScheduleChanges: def({
    name: 'getMyScheduleChanges',
    method: 'get',
    path: '/v1/me/schedule-changes',
    summary: 'Moved, cancelled and hall-changed sessions (last 30 days and coming)',
    tag: 'students',
    rules: ['STU-SCH-01'],
    auth: 'user',
    response: SessionChangePage,
    errors: [STUDENT_ONLY],
  }),
  childScheduleChanges: def({
    name: 'getChildScheduleChanges',
    method: 'get',
    path: '/v1/children/{id}/schedule-changes',
    summary: 'The child’s schedule changes (as the student sees them)',
    tag: 'students',
    rules: ['STU-SCH-01'],
    auth: 'user',
    params: ChildParams,
    response: SessionChangePage,
  }),
  myNotifications: def({
    name: 'listMyNotifications',
    method: 'get',
    path: '/v1/me/notifications',
    summary: 'In-app notifications (newest first, 90 days)',
    tag: 'account',
    rules: ['STU-SCH-01'],
    auth: 'user',
    response: NotificationPage,
  }),
  readNotification: def({
    name: 'readNotification',
    method: 'post',
    path: '/v1/me/notifications/{id}/read',
    summary: 'Mark one notification read',
    tag: 'account',
    rules: ['STU-SCH-01'],
    auth: 'user',
    params: IdParams,
    response: Ok,
  }),
  myMissed: def({
    name: 'getMyMissed',
    method: 'get',
    path: '/v1/me/missed',
    summary: 'What you missed: confirmed records of sessions marked absent',
    tag: 'students',
    rules: ['STU-MIS-01'],
    auth: 'user',
    response: MissedSessionPage,
    errors: [STUDENT_ONLY],
  }),
  childMissed: def({
    name: 'getChildMissed',
    method: 'get',
    path: '/v1/children/{id}/missed',
    summary: 'What the child missed (as the student sees it)',
    tag: 'students',
    rules: ['STU-MIS-01'],
    auth: 'user',
    params: ChildParams,
    response: MissedSessionPage,
  }),
  myHomework: def({
    name: 'getMyHomework',
    method: 'get',
    path: '/v1/me/homework',
    summary: 'Homework items and their status (confirmed records only)',
    tag: 'students',
    rules: ['STU-HW-01'],
    auth: 'user',
    response: HomeworkPage,
    errors: [STUDENT_ONLY],
  }),
  childHomework: def({
    name: 'getChildHomework',
    method: 'get',
    path: '/v1/children/{id}/homework',
    summary: 'The child’s homework (as the student sees it)',
    tag: 'students',
    rules: ['STU-HW-01'],
    auth: 'user',
    params: ChildParams,
    response: HomeworkPage,
  }),
  myStudentNotes: def({
    name: 'getMyStudentNotes',
    method: 'get',
    path: '/v1/me/student-notes',
    summary: 'Teacher notes for me (approved by the centre only)',
    tag: 'students',
    rules: ['STU-NOTE-01'],
    auth: 'user',
    response: StudentNotePage,
    errors: [STUDENT_ONLY],
  }),
  childStudentNotes: def({
    name: 'getChildStudentNotes',
    method: 'get',
    path: '/v1/children/{id}/student-notes',
    summary: 'Teacher notes for the child (approved only)',
    tag: 'students',
    rules: ['STU-NOTE-01'],
    auth: 'user',
    params: ChildParams,
    response: StudentNotePage,
  }),
  myTopics: def({
    name: 'getMyTopics',
    method: 'get',
    path: '/v1/me/topics',
    summary: 'Topic scores, bands, stars and level per subject (the same view for every role)',
    tag: 'students',
    rules: ['STU-TOP-01', 'CF-58', 'ANL-STU-01'],
    auth: 'user',
    query: GroupQuery,
    response: StudentProgress,
    errors: [STUDENT_ONLY],
  }),
  childTopics: def({
    name: 'getChildTopics',
    method: 'get',
    path: '/v1/children/{id}/topics',
    summary: 'The child’s topic scores (exactly what the student sees)',
    tag: 'students',
    rules: ['STU-TOP-01', 'CF-58', 'ANL-STU-01'],
    auth: 'user',
    params: ChildParams,
    query: GroupQuery,
    response: StudentProgress,
  }),
  myFocusPlan: def({
    name: 'getMyFocusPlans',
    method: 'get',
    path: '/v1/me/focus-plans',
    summary: 'This week’s approved focus checklists (needs the parent’s focus_plans consent)',
    tag: 'students',
    rules: ['STU-TOP-01', 'STU-FOC-01', 'BR-DAT-03'],
    auth: 'user',
    response: FocusPlanPage,
    errors: [STUDENT_ONLY],
  }),
  childFocusPlan: def({
    name: 'getChildFocusPlans',
    method: 'get',
    path: '/v1/children/{id}/focus-plans',
    summary: 'The child’s approved focus checklists, with ticks',
    tag: 'students',
    rules: ['STU-TOP-01', 'STU-FOC-01', 'BR-DAT-03'],
    auth: 'user',
    params: ChildParams,
    response: FocusPlanPage,
  }),
  tickFocusItem: def({
    name: 'tickFocusItem',
    method: 'put',
    path: '/v1/focus-plan-items/{id}/tick',
    summary: 'The student ticks (or unticks) an item of their approved plan',
    tag: 'students',
    rules: ['STU-FOC-01'],
    auth: 'user',
    idempotent: true,
    params: IdParams,
    body: TickBody,
    response: Ok,
    errors: [STUDENT_ONLY],
  }),
  // ── Make-up requests ─────────────────────────────────────────────────────────
  newMakeupRequest: def({
    name: 'createMakeupRequest',
    method: 'post',
    path: '/v1/makeup-requests',
    summary: 'Ask to make up a missed session (the student, or the parent for a child)',
    tag: 'students',
    rules: ['STU-MIS-01'],
    auth: 'user',
    idempotent: true,
    body: NewMakeupBody,
    response: MakeupRequest,
    status: 201,
    errors: [{ status: 409, code: 'makeup_already_requested' }],
  }),
  withdrawMakeup: def({
    name: 'withdrawMakeupRequest',
    method: 'post',
    path: '/v1/makeup-requests/{id}/withdraw',
    summary: 'Withdraw a request not yet decided',
    tag: 'students',
    rules: ['STU-MIS-01'],
    auth: 'user',
    idempotent: true,
    params: IdParams,
    response: MakeupRequest,
  }),
  seenMakeup: def({
    name: 'markMakeupRequestSeen',
    method: 'post',
    path: '/v1/makeup-requests/{id}/seen',
    summary: 'The parent has seen the child’s request',
    tag: 'students',
    rules: ['STU-MIS-01'],
    auth: 'user',
    params: IdParams,
    response: MakeupRequest,
  }),
  myMakeups: def({
    name: 'getMyMakeupRequests',
    method: 'get',
    path: '/v1/me/makeup-requests',
    summary: 'My make-up requests',
    tag: 'students',
    rules: ['STU-MIS-01'],
    auth: 'user',
    response: MakeupRequestPage,
    errors: [STUDENT_ONLY],
  }),
  childMakeups: def({
    name: 'getChildMakeupRequests',
    method: 'get',
    path: '/v1/children/{id}/makeup-requests',
    summary: 'The child’s make-up requests',
    tag: 'students',
    rules: ['STU-MIS-01'],
    auth: 'user',
    params: ChildParams,
    response: MakeupRequestPage,
  }),
  centreMakeups: def({
    name: 'getCentreMakeupRequests',
    method: 'get',
    path: '/v1/centres/{id}/makeup-requests',
    summary: 'Make-up requests at the centre (bookings.manage)',
    tag: 'students',
    rules: ['STU-MIS-01'],
    auth: 'user',
    params: IdParams,
    response: MakeupRequestPage,
  }),
  acceptMakeup: def({
    name: 'acceptMakeupRequest',
    method: 'post',
    path: '/v1/makeup-requests/{id}/accept',
    summary: 'Accept into one session: holds one seat there (no enrolment, no payment)',
    tag: 'students',
    rules: ['STU-MIS-01', 'INV-05'],
    auth: 'user',
    idempotent: true,
    params: IdParams,
    body: AcceptMakeupBody,
    response: MakeupRequest,
    errors: [
      { status: 409, code: 'session_full' },
      { status: 409, code: 'makeup_decided' },
      { status: 422, code: 'makeup_session_invalid' },
    ],
  }),
  declineMakeup: def({
    name: 'declineMakeupRequest',
    method: 'post',
    path: '/v1/makeup-requests/{id}/decline',
    summary: 'Decline, with a note for the family',
    tag: 'students',
    rules: ['STU-MIS-01'],
    auth: 'user',
    idempotent: true,
    params: IdParams,
    body: DeclineMakeupBody,
    response: MakeupRequest,
  }),
  // ── Teacher and centre ───────────────────────────────────────────────────────
  moveSession: def({
    name: 'moveSession',
    method: 'patch',
    path: '/v1/sessions/{id}',
    summary: 'Move a session (teacher or bookings.manage) or change its hall (the centre)',
    tag: 'groups',
    rules: ['STU-SCH-01'],
    auth: 'user',
    idempotent: true,
    params: IdParams,
    body: MoveSessionBody,
    response: MovedSession,
    errors: [
      { status: 409, code: 'hall_taken' },
      { status: 409, code: 'session_not_scheduled' },
      { status: 422, code: 'hall_not_of_centre' },
    ],
  }),
  getSessionLearning: def({
    name: 'getSessionLearning',
    method: 'get',
    path: '/v1/session-records/{id}/learning',
    summary: 'What was covered, the homework set and the topics, for one record',
    tag: 'records',
    rules: ['STU-MIS-01', 'STU-HW-01'],
    auth: 'user',
    params: IdParams,
    response: SessionLearning,
  }),
  putSessionLearning: def({
    name: 'putSessionLearning',
    method: 'put',
    path: '/v1/session-records/{id}/learning',
    summary: 'Draft only: what was covered, the homework set, the topics, the homework items',
    tag: 'records',
    rules: ['STU-MIS-01', 'STU-HW-01', 'BR-APR-01'],
    auth: 'user',
    idempotent: true,
    params: IdParams,
    body: SessionLearningBody,
    response: SessionLearning,
    errors: [{ status: 409, code: 'record_confirmed' }],
  }),
  putHomeworkMarks: def({
    name: 'putHomeworkMarks',
    method: 'put',
    path: '/v1/session-records/{id}/homework-marks',
    summary: 'Mark earlier homework in this (draft) record: handed in, late, or back to set',
    tag: 'records',
    rules: ['STU-HW-01'],
    auth: 'user',
    idempotent: true,
    params: IdParams,
    body: HomeworkMarksBody,
    response: HomeworkMarks,
    errors: [{ status: 409, code: 'record_confirmed' }],
  }),
  correctLearning: def({
    name: 'correctSessionLearning',
    method: 'post',
    path: '/v1/session-records/{id}/learning-corrections',
    summary: 'Correct what was covered or the homework set of a confirmed record (with a reason)',
    tag: 'records',
    rules: ['STU-MIS-01', 'INV-09'],
    auth: 'user',
    idempotent: true,
    params: IdParams,
    body: LearningCorrectionBody,
    response: SessionLearning,
  }),
  newStudentNote: def({
    name: 'createStudentNote',
    method: 'post',
    path: '/v1/groups/{id}/student-notes',
    summary: 'Draft a note for a student of the group',
    tag: 'records',
    rules: ['STU-NOTE-01'],
    auth: 'user',
    idempotent: true,
    params: IdParams,
    body: NewStudentNoteBody,
    response: StudentNote,
    status: 201,
  }),
  groupStudentNotes: def({
    name: 'getGroupStudentNotes',
    method: 'get',
    path: '/v1/groups/{id}/student-notes',
    summary: 'The teacher’s notes for the group’s students, every status',
    tag: 'records',
    rules: ['STU-NOTE-01'],
    auth: 'user',
    params: IdParams,
    response: StudentNotePage,
  }),
  submitStudentNote: def({
    name: 'submitStudentNote',
    method: 'post',
    path: '/v1/student-notes/{id}/submit',
    summary: 'Send the draft to the centre for approval',
    tag: 'records',
    rules: ['STU-NOTE-01'],
    auth: 'user',
    idempotent: true,
    params: IdParams,
    response: StudentNote,
  }),
  centreStudentNotes: def({
    name: 'getCentreStudentNotes',
    method: 'get',
    path: '/v1/centres/{id}/student-notes',
    summary: 'Notes waiting for approval and decided ones (messages.approve)',
    tag: 'records',
    rules: ['STU-NOTE-01'],
    auth: 'user',
    params: IdParams,
    response: StudentNotePage,
  }),
  approveStudentNote: def({
    name: 'approveStudentNote',
    method: 'post',
    path: '/v1/student-notes/{id}/approve',
    summary: 'Approve: the student and the parent see it; it is locked from now on',
    tag: 'records',
    rules: ['STU-NOTE-01'],
    auth: 'user',
    idempotent: true,
    params: IdParams,
    response: StudentNote,
  }),
  rejectStudentNote: def({
    name: 'rejectStudentNote',
    method: 'post',
    path: '/v1/student-notes/{id}/reject',
    summary: 'Send back to the teacher with a reason',
    tag: 'records',
    rules: ['STU-NOTE-01'],
    auth: 'user',
    idempotent: true,
    params: IdParams,
    body: RejectNoteBody,
    response: StudentNote,
  }),
  topicMap: def({
    name: 'getTopicMap',
    method: 'get',
    path: '/v1/topic-maps',
    summary: 'The published topic map of a subject',
    tag: 'reference',
    rules: ['STU-TOP-01'],
    auth: 'public',
    query: z.object({ subjectId: Uuid }),
    response: TopicMap,
  }),
  putItemTopics: def({
    name: 'putAssessmentTopics',
    method: 'put',
    path: '/v1/assessments/{id}/topics',
    summary: 'Tag a quiz: the whole quiz, or each question, to topics (draft records only)',
    tag: 'records',
    rules: ['STU-TOP-01'],
    auth: 'user',
    idempotent: true,
    params: IdParams,
    body: ItemTopicsBody,
    response: ItemTopics,
  }),
  putQuestionMarks: def({
    name: 'putQuestionMarks',
    method: 'put',
    path: '/v1/assessments/{id}/question-marks',
    summary:
      'Marks per question for a per-question quiz (draft records only; never above a maximum)',
    tag: 'records',
    rules: ['STU-TOP-01', 'BR-APR-09'],
    auth: 'user',
    idempotent: true,
    params: IdParams,
    body: QuestionMarksBody,
    response: Ok,
  }),
  groupTopicScores: def({
    name: 'getGroupTopicScores',
    method: 'get',
    path: '/v1/groups/{id}/topic-scores',
    summary: 'The teacher’s view: the same scores students and parents see, per student',
    tag: 'records',
    rules: ['STU-TOP-01', 'CF-58'],
    auth: 'user',
    params: IdParams,
    response: TeacherTopicScores,
  }),
  newFocusPlan: def({
    name: 'createFocusPlan',
    method: 'post',
    path: '/v1/groups/{id}/focus-plans',
    summary: 'Draft a weekly focus checklist for a student',
    tag: 'records',
    rules: ['STU-TOP-01'],
    auth: 'user',
    idempotent: true,
    params: IdParams,
    body: NewFocusPlanBody,
    response: FocusPlan,
    status: 201,
  }),
  groupFocusPlans: def({
    name: 'getGroupFocusPlans',
    method: 'get',
    path: '/v1/groups/{id}/focus-plans',
    summary: 'The group’s focus checklists, with the students’ ticks',
    tag: 'records',
    rules: ['STU-TOP-01'],
    auth: 'user',
    params: IdParams,
    response: FocusPlanPage,
  }),
  approveFocusPlan: def({
    name: 'approveFocusPlan',
    method: 'post',
    path: '/v1/focus-plans/{id}/approve',
    summary: 'The teacher approves the plan (the student sees it with the parent’s consent)',
    tag: 'records',
    rules: ['STU-TOP-01'],
    auth: 'user',
    idempotent: true,
    params: IdParams,
    response: FocusPlan,
  }),
} satisfies Record<string, RouteDef>;
