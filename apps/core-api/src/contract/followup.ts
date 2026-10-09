import { z } from 'zod';
import { PersonRef } from './schemas';

/**
 * R3 follow-up contract (07 §2b, §2c, §2d): records, voice notes, rules, flags, cases, parent
 * messages, the owner's dashboards and the parent's feed. Names are the api-client type names, so
 * the teacher app and the web keep their imports (the client re-exports these generated types).
 */
const named = <T extends z.ZodType>(id: string, s: T, description?: string) =>
  s.meta({ id, ...(description ? { description } : {}) });

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ── Records (FUP-REC) ──────────────────────────────────────────────────────────
export const Attendance = named(
  'Attendance',
  z.enum(['present', 'absent', 'late', 'not_recorded']),
  '`not_recorded` is the default: missing data is never absence (BR-APR-07).',
);
export const Participation = named(
  'Participation',
  z.enum(['low', 'normal', 'high', 'not_recorded']),
);
export const NoteTag = named(
  'NoteTag',
  z.enum(['understanding', 'needs_revisit', 'behaviour', 'positive', 'absence_context']),
);
export const RecordStatus = named('RecordStatus', z.enum(['draft', 'confirmed']));
const AttendanceOrNone = z.union([Attendance, z.literal('none')]);

export const Assessment = named(
  'Assessment',
  z.object({
    id: z.string(),
    title: z.string(),
    series: z.string().nullable().describe('Comparable results share a series (FUP-REC-03 AC4)'),
    maxScore: z.number(),
  }),
);
export const RecordEntry = named(
  'RecordEntry',
  z.object({
    id: z.string(),
    student: PersonRef,
    attendance: Attendance,
    lateMinutes: z.number().int().nullable(),
    score: z.number().nullable().describe('null = not entered; never 0 for an absent student'),
    participation: Participation,
    observation: z.string().nullable().describe('Internal teaching note (BR-APR-13)'),
    observationTag: NoteTag.nullable(),
    source: z.enum(['tap', 'voice']),
  }),
);
export const Correction = named(
  'Correction',
  z.object({
    id: z.string(),
    entryId: z.string(),
    student: PersonRef,
    field: z.enum(['attendance', 'score', 'participation', 'observation']),
    oldValue: z.string().nullable(),
    newValue: z.string().nullable(),
    reason: z.string(),
    author: PersonRef,
    at: z.string(),
  }),
);
export const CorrectionRequest = named(
  'CorrectionRequest',
  z.object({
    id: z.string(),
    recordId: z.string(),
    groupId: z.string(),
    groupName: z.string(),
    sessionDate: day,
    student: PersonRef.nullable(),
    text: z.string(),
    requestedBy: PersonRef,
    at: z.string(),
    status: z.enum(['open', 'done']),
  }),
  'CF-34: teachers correct confirmed records; the owner asks them to.',
);
export const RuleCode = named(
  'RuleCode',
  z.enum(['consecutive_absences', 'score_decline', 'low_participation', 'repeated_concern']),
);
export const SignalSummary = named(
  'SignalSummary',
  z.object({
    id: z.string(),
    student: PersonRef,
    rule: RuleCode,
    ruleVersion: z.number().int(),
    explanation: z.string().describe('Readable reason (BR-APR-04)'),
    status: z.enum(['open', 'case_opened', 'dismissed', 'resolved_by_correction']),
    caseId: z.string().nullable(),
  }),
);
export const SessionRecord = named(
  'SessionRecord',
  z.object({
    id: z.string(),
    groupId: z.string(),
    groupSessionId: z.string(),
    sessionDate: day,
    startsAt: z.string(),
    status: RecordStatus,
    source: z.enum(['tap', 'voice', 'mixed']),
    assessment: Assessment.nullable(),
    entries: z.array(RecordEntry),
    groupObservation: z.string().nullable(),
    confirmedBy: PersonRef.nullable(),
    confirmedAt: z.string().nullable(),
    createdAt: z.string(),
    corrections: z.array(Correction),
    signals: z.array(SignalSummary).describe('Flags this record raised or added evidence to'),
    correctionRequests: z.array(CorrectionRequest),
  }),
);
export const SessionRecordList = z.array(SessionRecord);
export const EntryInput = named(
  'EntryInput',
  z.object({
    studentId: z.string(),
    attendance: Attendance,
    lateMinutes: z.number().int().min(0).max(600).nullable().optional(),
    score: z.number().nullable().optional(),
    participation: Participation.optional(),
    observation: z.string().max(1000).nullable().optional(),
    observationTag: NoteTag.nullable().optional(),
    source: z.enum(['tap', 'voice']).optional(),
  }),
);
export const SaveRecordBody = named(
  'SaveRecordBody',
  z.object({
    assessment: z
      .object({
        title: z.string().min(1).max(120),
        series: z.string().max(80).nullable(),
        maxScore: z.number(),
      })
      .nullable()
      .optional(),
    entries: z.array(EntryInput),
    groupObservation: z.string().max(1000).nullable().optional(),
  }),
);
export const OpenRecordBody = z.object({ groupSessionId: z.string() });
export const CorrectionBody = named(
  'CorrectionBody',
  z.object({
    field: z.enum(['attendance', 'score', 'participation', 'observation']),
    newValue: z.string().nullable(),
    reason: z.string(),
  }),
);
export const CorrectionRequestBody = z.object({
  studentId: z.string().nullable().optional(),
  text: z.string(),
});

// ── Teacher Today, roster, students ────────────────────────────────────────────
export const RosterRow = named(
  'RosterRow',
  z.object({
    student: PersonRef,
    lastSessions: z
      .array(AttendanceOrNone)
      .describe('Oldest → newest; `none` = no confirmed record'),
    latestScore: z
      .object({ score: z.number(), maxScore: z.number(), title: z.string() })
      .nullable(),
    noteCount: z.number().int(),
    flags: z.array(SignalSummary),
  }),
);
export const RosterList = z.array(RosterRow);
export const TeacherToday = named(
  'TeacherToday',
  z.object({
    teacher: PersonRef,
    nextSession: z
      .object({
        groupId: z.string(),
        groupName: z.string(),
        sessionId: z.string(),
        startsAt: z.string(),
        studentCount: z.number().int(),
      })
      .nullable(),
    reminders: z.array(
      z.object({
        text: z.string(),
        student: PersonRef.nullable(),
        source: z.object({ recordId: z.string(), sessionDate: day }),
      }),
    ),
    recordDue: z
      .object({
        groupId: z.string(),
        groupName: z.string(),
        sessionId: z.string(),
        sessionDate: day,
        startsAt: z.string(),
        endsAt: z.string(),
        studentCount: z.number().int(),
        recordId: z.string().nullable(),
      })
      .nullable(),
    needsYou: z.array(
      z.object({
        kind: z.enum(['draft', 'missing']),
        groupId: z.string(),
        groupName: z.string(),
        sessionId: z.string(),
        sessionDate: day,
        recordId: z.string().nullable(),
      }),
    ),
    correctionRequests: z.array(CorrectionRequest),
  }),
);
export const Note = named(
  'Note',
  z.object({
    id: z.string(),
    student: PersonRef,
    groupId: z.string(),
    tag: NoteTag,
    body: z.string(),
    visibility: z.enum(['internal', 'suggested_for_parent']),
    author: PersonRef,
    at: z.string(),
  }),
);
export const NoteBody = z.object({
  groupId: z.string(),
  tag: z.string(),
  body: z.string(),
});
export const StudentDetail = named(
  'StudentDetail',
  z.object({
    student: PersonRef,
    group: z.object({ id: z.string(), name: z.string() }),
    attended: z.object({ present: z.number().int(), of: z.number().int() }),
    latestScore: z
      .object({ score: z.number(), maxScore: z.number(), title: z.string() })
      .nullable(),
    notesThisMonth: z.number().int(),
    attendance: z.array(z.object({ sessionDate: day, value: AttendanceOrNone })),
    trends: z.array(
      z.object({
        series: z.string(),
        points: z.array(
          z.object({
            sessionDate: day,
            score: z.number(),
            maxScore: z.number(),
            title: z.string(),
          }),
        ),
      }),
    ),
    notes: z.array(Note),
    flags: z.array(SignalSummary),
  }),
);

// ── Voice (FUP-VOI) ─────────────────────────────────────────────────────────────
export const VoiceStatus = named(
  'VoiceStatus',
  z.enum(['queued', 'uploaded', 'transcribing', 'extracting', 'ready', 'failed']),
);
export const VoiceNote = named(
  'VoiceNote',
  z.object({
    id: z.string(),
    sessionRecordId: z.string(),
    status: VoiceStatus,
    durationS: z.number().int(),
    uploadUrl: z.string().describe('Where the app PUTs the audio (core-api stores it encrypted)'),
  }),
);
export const VoiceNoteBody = z.object({
  sessionRecordId: z.string(),
  durationS: z.number().min(0).max(900),
});
export const ConfidenceBand = named('ConfidenceBand', z.enum(['high', 'medium', 'low']));
export const VoiceField = named(
  'VoiceField',
  z.enum([
    'attendance',
    'late_minutes',
    'score',
    'participation',
    'observation',
    'observation_tag',
  ]),
);
export const VoiceItem = named(
  'VoiceItem',
  z.object({
    id: z.string(),
    identity: z.enum(['matched', 'ambiguous', 'unknown', 'group']),
    student: PersonRef.nullable(),
    candidates: z.array(PersonRef).describe('For `ambiguous`: never a default (FUP-VOI-04)'),
    suggestions: z.array(PersonRef).describe('For `unknown`: shown first, never pre-selected'),
    mention: z.string().nullable(),
    field: VoiceField,
    value: z.union([z.string(), z.number()]).nullable(),
    confidence: z.number(),
    band: ConfidenceBand,
    span: z.object({ start: z.number().int(), end: z.number().int() }),
    sourceText: z.string(),
    outOfRange: z.boolean().describe('Score above the maximum: blocking, never capped'),
  }),
);
export const VoiceExtraction = named(
  'VoiceExtraction',
  z.object({
    id: z.string(),
    voiceNoteId: z.string(),
    status: z.enum(['proposed', 'clarification_needed', 'accepted']),
    transcript: z.string().describe('Receipt only (BR-APR-05). Parents never see it.'),
    audioUrl: z.string().nullable(),
    items: z.array(VoiceItem),
    discardedItemIds: z.array(z.string()),
    unmentioned: z.array(PersonRef),
    assessment: z.object({ title: z.string(), maxScore: z.number() }).nullable(),
  }),
);
export const VoicePending = named(
  'VoicePending',
  z.object({ status: z.literal('transcribing'), etaSeconds: z.number().int().nullable() }),
);
export const ResolveIdentityBody = z.object({ itemId: z.string(), studentId: z.string() });
export const DiscardItemBody = z.object({ itemId: z.string() });
/** What ai-service posts back for a note (09 §2; internal route). */
export const VoiceResultBody = z.object({
  jobId: z.string().optional(),
  status: z.enum(['ready', 'failed']),
  code: z.string().optional(),
  detail: z.string().optional(),
  result: z
    .object({
      transcript: z.string().max(20_000),
      items: z.array(
        z.object({
          id: z.string(),
          identity: z.enum(['matched', 'ambiguous', 'unknown', 'group']),
          studentId: z.string().nullable(),
          candidates: z.array(z.string()),
          suggestions: z.array(z.string()).optional(),
          mention: z.string().nullable(),
          field: VoiceField,
          value: z.union([z.string(), z.number()]).nullable(),
          confidence: z.number(),
          band: ConfidenceBand.optional(),
          span: z.object({ start: z.number().int(), end: z.number().int() }),
          sourceText: z.string(),
          outOfRange: z.boolean(),
        }),
      ),
      unmentioned: z.array(z.string()).optional(),
      modelVersion: z.string(),
      latencyMs: z.record(z.string(), z.number()).optional(),
    })
    .loose()
    .optional(),
});

// ── Flags and cases (FUP-RUL, FUP-CAS) ─────────────────────────────────────────
export const Signal = named(
  'Signal',
  SignalSummary.extend({
    group: z.object({ id: z.string(), name: z.string() }),
    evidence: z.array(
      z.object({
        recordId: z.string(),
        sessionDate: day,
        attendance: Attendance,
        confirmedBy: PersonRef,
      }),
    ),
    ruleText: z.string(),
    raisedAt: z.string(),
  }),
);
export const CaseStatus = named(
  'CaseStatus',
  z.enum(['open', 'in_progress', 'awaiting_confirmation', 'resolved', 'dismissed']),
);
export const CaseAttempt = named(
  'CaseAttempt',
  z.object({
    id: z.string(),
    channel: z.enum(['phone', 'whatsapp', 'whatsapp_manual', 'sms', 'meeting']),
    result: z.enum(['reached', 'no_answer', 'wrong_number', 'message_sent', 'replied']),
    learned: z.string().nullable(),
    nextAction: z.string().nullable(),
    followUpOn: z.string().nullable(),
    messageId: z.string().nullable(),
    createdBy: PersonRef,
    at: z.string(),
  }),
);
export const FollowupCase = named(
  'FollowupCase',
  z.object({
    id: z.string(),
    signal: Signal,
    student: PersonRef,
    assignee: PersonRef.extend({ role: z.string() }),
    status: CaseStatus,
    dueOn: day,
    overdue: z.boolean(),
    dismissReason: z.string().nullable(),
    attempts: z.array(CaseAttempt),
    messageIds: z.array(z.string()),
    timeline: z.array(
      z.object({ at: z.string(), kind: z.string(), text: z.string(), actor: PersonRef.nullable() }),
    ),
  }),
);
export const FollowupCasePage = named(
  'FollowupCasePage',
  z.object({ data: z.array(FollowupCase), nextCursor: z.string().nullable() }),
);
export const AttemptBody = z.object({
  channel: z.enum(['phone', 'whatsapp', 'sms', 'meeting']).optional(),
  result: z.enum(['reached', 'no_answer', 'wrong_number', 'message_sent', 'replied']).optional(),
  learned: z.string().max(1000).nullable().optional(),
  nextAction: z.string().max(500).nullable().optional(),
  followUpOn: day.nullable().optional(),
  keepOpen: z.boolean().optional(),
});
export const DismissBody = z.object({ reason: z.string().max(500) });
export const SeatCheck = named(
  'SeatCheck',
  z.object({ text: z.string(), seatsLeft: z.number().int(), groupId: z.string().nullable() }),
);

// ── Messages (FUP-MSG) ─────────────────────────────────────────────────────────
export const DeliveryStatus = named(
  'DeliveryStatus',
  z.enum(['draft', 'approved', 'queued', 'sent', 'delivered', 'read', 'failed', 'not_sendable']),
);
export const GuardianContact = named(
  'GuardianContact',
  z.object({
    id: z.string(),
    displayName: z.string(),
    phoneMasked: z.string().describe('Masked only: "+20 10 •••• 0001"'),
    whatsappOptIn: z.boolean(),
    smsConsent: z.boolean(),
    stopped: z.boolean().describe('Replied STOP / إيقاف: takes effect at once (BR-DAT-02)'),
  }),
);
export const InboundMessage = named(
  'InboundMessage',
  z.object({
    id: z.string(),
    body: z.string(),
    summary: z.string(),
    intent: z.string(),
    receivedAt: z.string(),
    suggestions: z.array(z.enum(['record_outcome', 'check_seat', 'draft_reply'])),
  }),
);
export const ParentMessage = named(
  'ParentMessage',
  z.object({
    id: z.string(),
    caseId: z.string().nullable(),
    student: PersonRef,
    guardian: GuardianContact,
    purpose: z.string(),
    draft: z.string(),
    finalText: z.string().nullable(),
    tone: z.enum(['warm', 'neutral', 'formal']),
    groundedFacts: z.array(
      z.object({ text: z.string(), source: z.string(), recordId: z.string() }),
    ),
    status: DeliveryStatus,
    channel: z.enum(['whatsapp', 'sms']).nullable(),
    blockedReason: z.enum(['not_opted_in', 'stopped']).nullable(),
    approvedBy: PersonRef.nullable(),
    approvedAt: z.string().nullable(),
    failureReason: z.string().nullable(),
    replies: z.array(InboundMessage),
    history: z.array(z.object({ status: DeliveryStatus, at: z.string() })),
    sentManually: z.object({ by: PersonRef, at: z.string() }).nullable(),
  }),
);
export const ParentMessagePage = named(
  'ParentMessagePage',
  z.object({ data: z.array(ParentMessage), nextCursor: z.string().nullable() }),
);
export const DraftBody = z.object({
  caseId: z.string(),
  tone: z.enum(['warm', 'neutral', 'formal']).optional(),
});
export const EditMessageBody = z.object({
  text: z.string().max(2000).optional(),
  tone: z.enum(['warm', 'neutral', 'formal']).optional(),
});
export const ApproveBody = z.object({
  checked: z.boolean().optional(),
  channel: z.enum(['whatsapp', 'sms']).optional(),
});

// ── Owner web (07 §2c) ─────────────────────────────────────────────────────────
export const OwnerToday = named(
  'OwnerToday',
  z.object({
    date: day,
    dueToday: z.number().int(),
    overdue: z.object({ count: z.number().int(), owners: z.array(PersonRef) }),
    missingRecords: z.object({ missing: z.number().int(), eligible: z.number().int() }),
    recordsComplete: z.object({ confirmed: z.number().int(), eligible: z.number().int() }),
    followUpToday: z.array(FollowupCase),
    keepComplete: z.array(
      z.object({
        groupId: z.string(),
        groupName: z.string(),
        teacher: PersonRef,
        sessionDate: day,
        startsAt: z.string(),
        status: z.enum(['draft', 'missing']),
      }),
    ),
  }),
);
export const CentreStudentRow = named(
  'CentreStudentRow',
  z.object({
    student: PersonRef,
    group: z.object({ id: z.string(), name: z.string() }),
    lastSessions: z.array(AttendanceOrNone),
    latestScore: z.object({ score: z.number(), maxScore: z.number() }).nullable(),
    followUp: z.object({ caseId: z.string(), status: CaseStatus, overdue: z.boolean() }).nullable(),
    latestNote: z.object({ body: z.string(), author: PersonRef, at: z.string() }).nullable(),
    guardian: z.object({
      status: z.enum(['verified', 'missing_phone', 'kept_by_centre']),
      name: z.string().nullable(),
    }),
  }),
);
export const CentreStudentPage = named(
  'CentreStudentPage',
  z.object({ data: z.array(CentreStudentRow), nextCursor: z.string().nullable() }),
);
export const CentreSessionRow = named(
  'CentreSessionRow',
  z.object({
    groupId: z.string(),
    groupName: z.string(),
    teacher: PersonRef,
    sessionDate: day,
    startsAt: z.string(),
    recordId: z.string().nullable(),
    status: z.enum(['confirmed', 'draft', 'not_started']),
    attendance: z
      .object({
        present: z.number().int(),
        absent: z.number().int(),
        late: z.number().int(),
        notRecorded: z.number().int(),
      })
      .nullable(),
  }),
);
export const CentreSessionPage = named(
  'CentreSessionPage',
  z.object({ data: z.array(CentreSessionRow), nextCursor: z.string().nullable() }),
);
export const RuleView = named(
  'RuleView',
  z.object({
    code: RuleCode,
    active: z.boolean(),
    params: z.record(z.string(), z.number()),
    scope: z.string(),
    version: z.number().int(),
    example: z.string(),
    text: z.string(),
    proposal: z
      .object({
        active: z.boolean(),
        params: z.record(z.string(), z.number()),
        scope: z.string(),
        proposedBy: PersonRef,
        at: z.string(),
      })
      .nullable(),
    history: z.array(
      z.object({ version: z.number().int(), approvedBy: PersonRef.nullable(), at: z.string() }),
    ),
  }),
);
export const RuleViewList = z.array(RuleView);
export const RuleChangeBody = named(
  'RuleChangeBody',
  z.object({
    active: z.boolean(),
    params: z.record(z.string(), z.unknown()),
    scope: z.string(),
  }),
);
export const ActivityKind = named(
  'ActivityKind',
  z.enum(['records', 'followups', 'messages', 'corrections', 'access']),
);
export const ActivityEvent = named(
  'ActivityEvent',
  z.object({
    id: z.string(),
    at: z.string(),
    kind: ActivityKind,
    text: z.string(),
    actor: PersonRef.nullable(),
  }),
);
export const ActivityLog = named(
  'ActivityLog',
  z.object({
    events: z.array(ActivityEvent),
    week: z.object({
      recordsConfirmed: z.number().int(),
      followUpsOpened: z.number().int(),
      outcomesRecorded: z.number().int(),
      corrections: z.number().int(),
    }),
  }),
);
export const ParentUpdate = named(
  'ParentUpdate',
  z.object({
    id: z.string(),
    studentId: z.string(),
    kind: z.literal('message'),
    text: z.string(),
    from: z.string(),
    at: z.string(),
  }),
  'P09: approved messages only (FUP-MSG-08, OD-41).',
);
export const ParentUpdatePage = named(
  'ParentUpdatePage',
  z.object({ data: z.array(ParentUpdate), nextCursor: z.string().nullable() }),
);
export const CentreGroup = named(
  'CentreGroup',
  z.object({
    childId: z.string(),
    groupId: z.string(),
    groupName: z.string(),
    centreName: z.string(),
    teacher: PersonRef,
    weekdays: z.array(z.number().int().min(1).max(7)),
    startTime: hhmm,
    endTime: hhmm,
  }),
);
export const CentreGroupList = z.array(CentreGroup);

// ── Provider webhook (whatsapp-fake → Link) ────────────────────────────────────
export const MessagingWebhookBody = z.object({
  eventId: z.string().min(1).max(200),
  type: z.enum(['status', 'inbound']),
  messageId: z.string().max(200).optional(),
  status: z.enum(['sent', 'delivered', 'read', 'failed']).optional(),
  reason: z.string().max(300).optional(),
  from: z.string().max(40).optional(),
  body: z.string().max(4000).optional(),
  inReplyTo: z.string().max(200).optional(),
  at: z.string().optional(),
});
