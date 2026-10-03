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
  corrections: Correction[];
  /** Flags this record raised or added evidence to (A14). */
  signals: SignalSummary[];
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
  /** Records not confirmed yet, and past sessions without a record (FUP-REC-01 AC3). */
  needsYou: {
    kind: 'draft' | 'missing';
    groupId: string;
    groupName: string;
    sessionId: string;
    sessionDate: string;
    recordId: string | null;
  }[];
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
  /** Roster students with no matched item. */
  unmentioned: PersonRef[];
  assessment: { title: string; maxScore: number } | null;
}

// ── Flags and cases (FUP-RUL, FUP-CAS) ─────────────────────────────────────────
export type RuleCode =
  'consecutive_absences' | 'score_decline' | 'low_participation' | 'repeated_concern';

export interface SignalSummary {
  id: string;
  rule: RuleCode;
  ruleVersion: number;
  /** Readable reason (BR-APR-04). */
  explanation: string;
  status: 'open' | 'case_opened' | 'dismissed' | 'resolved_by_correction';
  caseId: string | null;
}

export interface Signal extends SignalSummary {
  student: PersonRef;
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
  channel: 'phone' | 'whatsapp' | 'sms' | 'meeting';
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
}
