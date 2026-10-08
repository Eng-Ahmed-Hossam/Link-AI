/**
 * Phase 2 (follow-up) draft types. docs/07 §3 lists the endpoints in outline only, so every shape
 * here is PLACEHOLDER until the backend team writes OpenAPI. Field names follow docs/06 §6–§8.
 */

// ── Records (FUP-REC) ──────────────────────────────────────────────────────────
/** `not_recorded` is the default: missing data is never absence (BR-APR-07). */
export type Attendance = 'present' | 'absent' | 'late' | 'not_recorded';
export type Participation = 'low' | 'normal' | 'high' | 'not_recorded';
export type NoteTag =
  'understanding' | 'needs_revisit' | 'behaviour' | 'positive' | 'absence_context';
export type RecordStatus = 'draft' | 'confirmed';

export interface PersonRef {
  id: string;
  displayName: string;
}

export interface Assessment {
  id: string;
  title: string;
  /** Comparable results share a series (FUP-REC-03 AC4). */
  series: string | null;
  maxScore: number;
}

export interface RecordEntry {
  id: string;
  student: PersonRef;
  attendance: Attendance;
  lateMinutes: number | null;
  /** null = not entered. Never 0 for an absent student (FUP-REC-03 AC2). */
  score: number | null;
  participation: Participation;
  /** Internal teaching note (BR-APR-13). */
  observation: string | null;
  observationTag: NoteTag | null;
  source: 'tap' | 'voice';
}

export interface Correction {
  id: string;
  entryId: string;
  student: PersonRef;
  field: 'attendance' | 'score' | 'participation' | 'observation';
  oldValue: string | null;
  newValue: string | null;
  reason: string;
  author: PersonRef;
  at: string;
}

export interface SessionRecord {
  id: string;
  groupId: string;
  groupSessionId: string;
  sessionDate: string;
  startsAt: string;
  status: RecordStatus;
  source: 'tap' | 'voice' | 'mixed';
  assessment: Assessment | null;
  entries: RecordEntry[];
  /** "Next time" plan for the whole group. */
  groupObservation: string | null;
  confirmedBy: PersonRef | null;
  confirmedAt: string | null;
  /** When the draft was created (A14 record status timeline). */
  createdAt: string;
  corrections: Correction[];
  /** Flags this record raised or added evidence to (A14). */
  signals: SignalSummary[];
  /** CF-34: the owner's requests for the teacher to correct this record. */
  correctionRequests: CorrectionRequest[];
}

/** CF-34: teachers correct confirmed records; the owner asks them to (A14 → teacher Today). */
export interface CorrectionRequest {
  id: string;
  recordId: string;
  groupId: string;
  groupName: string;
  sessionDate: string;
  student: PersonRef | null;
  text: string;
  requestedBy: PersonRef;
  at: string;
  /** `done` when the teacher adds a correction to the record, or closes the request. */
  status: 'open' | 'done';
}

export interface EntryInput {
  studentId: string;
  attendance: Attendance;
  lateMinutes?: number | null;
  score?: number | null;
  participation?: Participation;
  observation?: string | null;
  observationTag?: NoteTag | null;
  source?: 'tap' | 'voice';
}

export interface SaveRecordBody {
  assessment?: { title: string; series: string | null; maxScore: number } | null;
  entries: EntryInput[];
  groupObservation?: string | null;
}

export interface CorrectionBody {
  field: Correction['field'];
  newValue: string | null;
  reason: string;
}

// ── Groups and students (teacher side) ─────────────────────────────────────────
export interface RosterRow {
  student: PersonRef;
  /** Oldest → newest; `none` = no confirmed record for that session. */
  lastSessions: (Attendance | 'none')[];
  latestScore: { score: number; maxScore: number; title: string } | null;
  noteCount: number;
  flags: SignalSummary[];
}

/** T09 merged with J05 (CF-30): marketplace parts always; `followup` only with the Phase 2 flag. */
export interface TeacherGroup {
  id: string;
  name: string;
  centre: PersonRef;
  room: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  sessionFee: { amountPt: number; currency: 'EGP' };
  monthlyFee: { amountPt: number; currency: 'EGP' };
  offersMonthlyRecurring: boolean;
  seatCap: number;
  /** Seats filled in the next session. */
  seatsFilled: number;
  nextSession: { id: string; startsAt: string } | null;
  /** Null when the group has no follow-up subscription. */
  followup: {
    studentCount: number;
    /** Confirmed / eligible past sessions in the last 5 weeks ("6 / 7"). */
    recordsComplete: { confirmed: number; eligible: number };
    openFollowUps: number;
  } | null;
}

export interface TeacherToday {
  teacher: PersonRef;
  nextSession: {
    groupId: string;
    groupName: string;
    sessionId: string;
    startsAt: string;
    studentCount: number;
  } | null;
  /** Only from confirmed observations, each with its source (FUP-REC-01 AC1). */
  reminders: {
    text: string;
    student: PersonRef | null;
    source: { recordId: string; sessionDate: string };
  }[];
  /** The latest session that has taken place (or is today) without a confirmed record. */
  recordDue: {
    groupId: string;
    groupName: string;
    sessionId: string;
    sessionDate: string;
    startsAt: string;
    endsAt: string;
    studentCount: number;
    recordId: string | null;
  } | null;
  /** Older records not confirmed yet, and past sessions without a record (FUP-REC-01 AC3). */
  needsYou: {
    kind: 'draft' | 'missing';
    groupId: string;
    groupName: string;
    sessionId: string;
    sessionDate: string;
    recordId: string | null;
  }[];
  /** Open requests from the owner to correct a confirmed record (CF-34). */
  correctionRequests: CorrectionRequest[];
}

export interface Note {
  id: string;
  student: PersonRef;
  groupId: string;
  tag: NoteTag;
  body: string;
  /** Always internal; `suggested_for_parent` goes to staff only (FUP-REC-10 AC3). */
  visibility: 'internal' | 'suggested_for_parent';
  author: PersonRef;
  at: string;
}

export interface StudentDetail {
  student: PersonRef;
  group: { id: string; name: string };
  attended: { present: number; of: number };
  latestScore: { score: number; maxScore: number; title: string } | null;
  notesThisMonth: number;
  attendance: { sessionDate: string; value: Attendance | 'none' }[];
  /** One line per series; same series only (FUP-REC-11 AC2). */
  trends: {
    series: string;
    points: { sessionDate: string; score: number; maxScore: number; title: string }[];
  }[];
  notes: Note[];
  flags: SignalSummary[];
}

// ── Voice (FUP-VOI) ─────────────────────────────────────────────────────────────
export type VoiceStatus =
  'queued' | 'uploaded' | 'transcribing' | 'extracting' | 'ready' | 'failed';

export interface VoiceNote {
  id: string;
  sessionRecordId: string;
  status: VoiceStatus;
  durationS: number;
  /** Signed upload URL (mock). */
  uploadUrl: string;
}

export type ConfidenceBand = 'high' | 'medium' | 'low';
export type VoiceField =
  'attendance' | 'late_minutes' | 'score' | 'participation' | 'observation' | 'observation_tag';

export interface VoiceItem {
  id: string;
  /** `group` = a statement about the whole session (no student). */
  identity: 'matched' | 'ambiguous' | 'unknown' | 'group';
  student: PersonRef | null;
  /** For `ambiguous`: the close roster candidates. Never a default (FUP-VOI-04). */
  candidates: PersonRef[];
  /**
   * For `unknown`: roster students the misheard name sounds like ("ليلة" → ليلى). Suggestions only:
   * shown first in "Who is this?", never pre-selected or attached (AI-02).
   */
  suggestions: PersonRef[];
  /** How the name was said ("أحمد"). */
  mention: string | null;
  field: VoiceField;
  value: string | number | null;
  confidence: number;
  /** OD-36: ≥ 0.85 high, 0.60–0.85 medium ("check"), < 0.60 low (left blank). */
  band: ConfidenceBand;
  span: { start: number; end: number };
  /** The words the item came from. */
  sourceText: string;
  /** Score above the maximum: a blocking error, never capped (AI-06). */
  outOfRange: boolean;
}

export interface VoiceExtraction {
  id: string;
  voiceNoteId: string;
  status: 'proposed' | 'clarification_needed' | 'accepted';
  /** Receipt only (BR-APR-05). Parents never see it. */
  transcript: string;
  audioUrl: string | null;
  items: VoiceItem[];
  /** Items the teacher discarded: never saved to anyone. */
  discardedItemIds: string[];
  /** Roster students with no matched item. */
  unmentioned: PersonRef[];
  assessment: { title: string; maxScore: number } | null;
}

// ── Flags and cases (FUP-RUL, FUP-CAS) ─────────────────────────────────────────
export type RuleCode =
  'consecutive_absences' | 'score_decline' | 'low_participation' | 'repeated_concern';

export interface SignalSummary {
  id: string;
  student: PersonRef;
  rule: RuleCode;
  ruleVersion: number;
  /** Readable reason (BR-APR-04). */
  explanation: string;
  status: 'open' | 'case_opened' | 'dismissed' | 'resolved_by_correction';
  caseId: string | null;
}

export interface Signal extends SignalSummary {
  group: { id: string; name: string };
  /** The numbers and source records (BR-APR-04). */
  evidence: {
    recordId: string;
    sessionDate: string;
    attendance: Attendance;
    confirmedBy: PersonRef;
  }[];
  ruleText: string;
  raisedAt: string;
}

export type CaseStatus =
  'open' | 'in_progress' | 'awaiting_confirmation' | 'resolved' | 'dismissed';

export interface CaseAttempt {
  id: string;
  /** `whatsapp_manual`: sent by staff from the centre's own WhatsApp (pilot, A6). */
  channel: 'phone' | 'whatsapp' | 'whatsapp_manual' | 'sms' | 'meeting';
  result: 'reached' | 'no_answer' | 'wrong_number' | 'message_sent' | 'replied';
  learned: string | null;
  nextAction: string | null;
  followUpOn: string | null;
  messageId: string | null;
  createdBy: PersonRef;
  at: string;
}

export interface FollowupCase {
  id: string;
  signal: Signal;
  student: PersonRef;
  assignee: PersonRef & { role: string };
  status: CaseStatus;
  dueOn: string;
  overdue: boolean;
  dismissReason: string | null;
  attempts: CaseAttempt[];
  messageIds: string[];
  timeline: { at: string; kind: string; text: string; actor: PersonRef | null }[];
}

// ── Messages (FUP-MSG) ─────────────────────────────────────────────────────────
export type DeliveryStatus =
  'draft' | 'approved' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'not_sendable';

export interface GuardianContact {
  id: string;
  displayName: string;
  /** Masked: "+20 10 •••• 0001" (FUP-MSG-01 AC4). */
  phoneMasked: string;
  whatsappOptIn: boolean;
  smsConsent: boolean;
  /** Replied STOP / إيقاف or switched off: takes effect at once (BR-DAT-02). */
  stopped: boolean;
}

export interface InboundMessage {
  id: string;
  body: string;
  summary: string;
  intent: string;
  receivedAt: string;
  /** Suggestions never close a case on their own (FUP-MSG-05 AC3). */
  suggestions: ('record_outcome' | 'check_seat' | 'draft_reply')[];
}

export interface ParentMessage {
  id: string;
  caseId: string | null;
  student: PersonRef;
  guardian: GuardianContact;
  purpose: string;
  draft: string;
  finalText: string | null;
  tone: 'warm' | 'neutral' | 'formal';
  /** Confirmed facts only, each with its source (FUP-MSG-01 AC2). */
  groundedFacts: { text: string; source: string; recordId: string }[];
  status: DeliveryStatus;
  channel: 'whatsapp' | 'sms' | null;
  /** Why it cannot be sent, when it cannot (FUP-MSG-03 AC2, FUP-MSG-07). */
  blockedReason: 'not_opted_in' | 'stopped' | null;
  approvedBy: PersonRef | null;
  approvedAt: string | null;
  failureReason: string | null;
  replies: InboundMessage[];
  /** Status history; changes only on provider events (BR-APR-11). */
  history: { status: DeliveryStatus; at: string }[];
  /**
   * Pilot (A6): staff sent the approved text from the centre's own WhatsApp. This is a contact
   * attempt, not a delivery: the status stays `approved` (no provider receipt).
   */
  sentManually: { by: PersonRef; at: string } | null;
}

// ── Owner web (Batch 6) ─────────────────────────────────────────────────────────
/** A01 Today (FUP-DSH-01). */
export interface OwnerToday {
  date: string;
  /** Open follow-ups due today or earlier. */
  dueToday: number;
  /** Past due with no outcome (FUP-CAS-05), and who owns them. */
  overdue: { count: number; owners: PersonRef[] };
  /** Past sessions in the last 2 weeks with no confirmed record. */
  missingRecords: { missing: number; eligible: number };
  recordsComplete: { confirmed: number; eligible: number };
  followUpToday: FollowupCase[];
  keepComplete: {
    groupId: string;
    groupName: string;
    teacher: PersonRef;
    sessionDate: string;
    startsAt: string;
    status: 'draft' | 'missing';
  }[];
}

export interface CentreStudentRow {
  student: PersonRef;
  group: { id: string; name: string };
  lastSessions: (Attendance | 'none')[];
  latestScore: { score: number; maxScore: number } | null;
  followUp: { caseId: string; status: CaseStatus; overdue: boolean } | null;
  /** Latest teacher note — internal (BR-APR-13). */
  latestNote: { body: string; author: PersonRef; at: string } | null;
  /** `kept_by_centre`: pilot — Link holds only a label; the centre keeps the phone number. */
  guardian: { status: 'verified' | 'missing_phone' | 'kept_by_centre'; name: string | null };
}

export interface CentreSessionRow {
  groupId: string;
  groupName: string;
  teacher: PersonRef;
  sessionDate: string;
  startsAt: string;
  recordId: string | null;
  status: 'confirmed' | 'draft' | 'not_started';
  attendance: { present: number; absent: number; late: number; notRecorded: number } | null;
}

export interface RuleView {
  code: RuleCode;
  active: boolean;
  params: Record<string, number>;
  scope: string;
  version: number;
  /** Plain-words example (FUP-RUL-01 AC1). */
  example: string;
  /** Readable rule text. */
  text: string;
  proposal: {
    active: boolean;
    params: Record<string, number>;
    scope: string;
    proposedBy: PersonRef;
    at: string;
  } | null;
  history: { version: number; approvedBy: PersonRef | null; at: string }[];
}

export interface RuleChangeBody {
  active: boolean;
  params: Record<string, number>;
  scope: string;
}

/** Marketplace permissions a centre_staff member can hold (10 §1); the owner has them all. */
export type StaffPermission = 'bookings.manage' | 'reviews.reply';
export const STAFF_PERMISSIONS: StaffPermission[] = ['bookings.manage', 'reviews.reply'];

export interface StaffMember {
  user: PersonRef;
  role: 'owner' | 'reception' | 'teacher';
  scope: string;
  /** Marketplace permissions (A16, MKT-ACC-04 AC1). Teachers hold none at the centre. */
  permissions: StaffPermission[];
  lastActiveAt: string | null;
  /** `removed`: pilot — access removed by the owner (kept so past actions stay attributed). */
  status: 'active' | 'invite_pending' | 'removed';
}

export type ActivityKind = 'records' | 'followups' | 'messages' | 'corrections' | 'access';

export interface ActivityEvent {
  id: string;
  at: string;
  kind: ActivityKind;
  text: string;
  actor: PersonRef | null;
}

export interface ActivityLog {
  events: ActivityEvent[];
  week: {
    recordsConfirmed: number;
    followUpsOpened: number;
    outcomesRecorded: number;
    corrections: number;
  };
}

/** P09 "Updates from the centre": approved messages only (FUP-MSG-08, OD-41). */
export interface ParentUpdate {
  id: string;
  studentId: string;
  kind: 'message';
  text: string;
  from: string;
  at: string;
}

// ── Ask Link assistant (FUP-DSH-05) ──────────────────────────────────────────────
export type AssistantTier = 'read' | 'draft' | 'act';
/** One server-sent event of an assistant turn. */
export type AssistantEvent =
  | { type: 'token'; text: string }
  | { type: 'tier'; tier: AssistantTier }
  | {
      type: 'draft';
      messageId: string;
      caseId: string;
      student: PersonRef;
      guardian: string;
      evidence: string[];
      tone: ParentMessage['tone'];
    }
  | { type: 'list'; items: { label: string; detail: string; href: string | null }[] }
  | { type: 'needs_approval'; text: string }
  | { type: 'done' };

// ── Pilot mode (docs/13 "Concierge pilot", apps/pilot) ───────────────────────────
export interface PilotPerson {
  id: string;
  displayName: string;
  role: 'owner' | 'reception' | 'teacher';
}
/** GET /v1/me in the pilot: the session's person and the pilot centre. */
export interface PilotMe {
  id: string;
  name: string;
  language: 'ar' | 'en';
  roles: ('centre_owner' | 'centre_staff' | 'teacher')[];
  centreId: string;
  /** Part B: this teacher may record voice notes (signed consent, voice on). */
  voiceNotes?: boolean;
}
/** A16 in the pilot: people, their groups, and whether they have a PIN yet. */
export interface PilotStaffRow extends PilotPerson {
  active: boolean;
  hasPin: boolean;
  /** Part B: the teacher's signed voice consent (E15-01), recorded by the owner. */
  voiceConsent?: boolean;
  /** When the consent was recorded (ISO), or null. */
  voiceConsentAt?: string | null;
  /** 4.2: voice switched on for this teacher by the owner (off by default; needs consent). */
  voiceOn?: boolean;
  groups: { id: string; name: string }[];
}

/** 4.2: voice notes for the whole centre (owner and Reception see it; only the owner changes it). */
export interface PilotVoiceStatus {
  /** The laptop runs speech-to-text (PILOT_VOICE=1 and ai-service started). */
  available: boolean;
  /** The owner switched voice off for everyone (kill switch). */
  paused: boolean;
  pausedAt: string | null;
  /** The active speech profile and its estimate for a 1-minute note; null if not answering. */
  profile: {
    key: 'gpu' | 'cpu_rules' | 'cpu_llm';
    sttDevice: string;
    llm: string | null;
    secondsPerMinute: number;
  } | null;
}

/** CF-39: a child's follow-up group at the centre (P09 when the marketplace is off). */
export interface CentreGroup {
  childId: string;
  groupId: string;
  groupName: string;
  centreName: string;
  teacher: PersonRef;
  weekdays: number[];
  startTime: string;
  endTime: string;
}
