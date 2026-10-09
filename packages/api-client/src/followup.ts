import type { components } from './generated/openapi';

type Schemas = components['schemas'];

/** Generated from the core-api contract (`pnpm openapi:generate`); edit apps/core-api/src/contract, not here. */
export type PersonRef = Schemas['PersonRef'];
export type StaffPermission = Schemas['StaffPermission'];
export type StaffMember = Schemas['StaffMember'];
export type TeacherGroup = Schemas['TeacherGroup'];

/**
 * Phase 2 follow-up (R3): served by core-api, so these are the generated contract types
 * (apps/core-api/src/contract/followup.ts). Request bodies below stay hand-written and match it.
 */
export type Attendance = Schemas['Attendance'];
export type Participation = Schemas['Participation'];
export type NoteTag = Schemas['NoteTag'];
export type RecordStatus = Schemas['RecordStatus'];
export type Assessment = Schemas['Assessment'];
export type RecordEntry = Schemas['RecordEntry'];
export type Correction = Schemas['Correction'];
export type SessionRecord = Schemas['SessionRecord'];
export type CorrectionRequest = Schemas['CorrectionRequest'];
export type RosterRow = Schemas['RosterRow'];
export type TeacherToday = Schemas['TeacherToday'];
export type Note = Schemas['Note'];
export type StudentDetail = Schemas['StudentDetail'];
export type VoiceStatus = Schemas['VoiceStatus'];
export type VoiceNote = Schemas['VoiceNote'];
export type ConfidenceBand = Schemas['ConfidenceBand'];
export type VoiceField = Schemas['VoiceField'];
export type VoiceItem = Schemas['VoiceItem'];
export type VoiceExtraction = Schemas['VoiceExtraction'];
export type RuleCode = Schemas['RuleCode'];
export type SignalSummary = Schemas['SignalSummary'];
export type Signal = Schemas['Signal'];
export type CaseStatus = Schemas['CaseStatus'];
export type CaseAttempt = Schemas['CaseAttempt'];
export type FollowupCase = Schemas['FollowupCase'];
export type DeliveryStatus = Schemas['DeliveryStatus'];
export type GuardianContact = Schemas['GuardianContact'];
export type InboundMessage = Schemas['InboundMessage'];
export type ParentMessage = Schemas['ParentMessage'];
export type OwnerToday = Schemas['OwnerToday'];
export type CentreStudentRow = Schemas['CentreStudentRow'];
export type CentreSessionRow = Schemas['CentreSessionRow'];
export type RuleView = Schemas['RuleView'];
export type ActivityKind = Schemas['ActivityKind'];
export type ActivityEvent = Schemas['ActivityEvent'];
export type ActivityLog = Schemas['ActivityLog'];
export type ParentUpdate = Schemas['ParentUpdate'];
export type CentreGroup = Schemas['CentreGroup'];

// ── Request bodies (07 §2b, §2c) ────────────────────────────────────────────────
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

export interface RuleChangeBody {
  active: boolean;
  params: Record<string, number>;
  scope: string;
}

export const STAFF_PERMISSIONS: StaffPermission[] = ['bookings.manage', 'reviews.reply'];

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
