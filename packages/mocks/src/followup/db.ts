/**
 * Stateful mock of the Phase 2 follow-up backend (docs/03, 06 §6–§8). It enforces the trust rules
 * the UI relies on, so the demo can't show something the real core-api would refuse:
 * - only confirmed records trigger rules (BR-APR-08); missing data is never absence (BR-APR-07);
 * - a score above the maximum is blocked, never capped (BR-APR-09);
 * - confirm is idempotent on its key (FUP-REC-07 AC3); an ambiguous name blocks it (FUP-VOI-04);
 * - one evaluator per rule, deduped per (rule, student, group) (FUP-RUL-03, INV-08);
 * - delivery status changes only on provider events (BR-APR-11); STOP takes effect at once;
 * - corrections and audit events are append-only.
 *
 * State lives in memory (mock server, tests) or localStorage (browser MSW mode). The pilot server
 * (`apps/pilot`, LINK_MODE=pilot) plugs in a durable store through `configureFollowupStore` and a
 * pilot world (`world.ts`) loaded from the roster import.
 */
import type {
  Attendance,
  CaseAttempt,
  Correction,
  DeliveryStatus,
  EntryInput,
  FollowupCase,
  GuardianContact,
  InboundMessage,
  Note,
  NoteTag,
  ParentMessage,
  Participation,
  PersonRef,
  RosterRow,
  SaveRecordBody,
  SessionRecord,
  Signal,
  SignalSummary,
  StudentDetail,
  TeacherGroup,
  TeacherToday,
  VoiceExtraction,
  VoiceItem,
  VoiceNote,
  ActivityEvent,
  ActivityKind,
  ActivityLog,
  CentreSessionRow,
  CentreStudentRow,
  OwnerToday,
  ParentUpdate,
  RuleChangeBody,
  RuleView,
  StaffMember,
} from '@link/api-client';
import * as mfx from '../data';
import { MockProblem, groupDto, type Lang } from '../db';
import { addDays, cairoToday } from '../time';
import * as fx from './data';
import {
  demoWorld,
  sessionsOfGroup,
  type Session,
  type StaffRole,
  type WorldData,
  type WorldUser,
} from './world';

type Text = string | mfx.L;
const tx = (v: Text | null, lang: Lang) => (v == null ? null : typeof v === 'string' ? v : v[lang]);

const STORAGE_KEY = 'link.mock.fu.v4';
const STT_DELAY_MS = 1500;

interface Entry {
  id: string;
  studentId: string;
  attendance: Attendance;
  lateMinutes: number | null;
  score: number | null;
  participation: Participation;
  observation: Text | null;
  observationTag: NoteTag | null;
  source: 'tap' | 'voice';
}
interface Rec {
  id: string;
  groupId: string;
  sessionId: string;
  date: string;
  startsAt: string;
  status: 'draft' | 'confirmed';
  source: 'tap' | 'voice' | 'mixed';
  assessment: { id: string; title: Text; series: string | null; maxScore: number } | null;
  entries: Entry[];
  groupObservation: Text | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
}
interface Corr {
  id: string;
  recordId: string;
  entryId: string;
  studentId: string;
  field: Correction['field'];
  oldValue: string | null;
  newValue: string | null;
  reason: Text;
  authorId: string;
  at: string;
}
interface Sig {
  id: string;
  rule: 'consecutive_absences';
  ruleVersion: number;
  studentId: string;
  groupId: string;
  evidence: string[]; // record ids
  /** Sessions in a row the rule version required when it fired (explanations quote it). */
  n?: number;
  status: Signal['status'];
  caseId: string | null;
  raisedAt: string;
}
interface CaseRow {
  id: string;
  signalId: string;
  studentId: string;
  assigneeId: string;
  status: FollowupCase['status'];
  dueOn: string;
  dismissReason: string | null;
  attempts: (Omit<CaseAttempt, 'createdBy'> & { createdBy: string })[];
  messageIds: string[];
  timeline: { at: string; kind: string; text: Text; actorId: string | null }[];
}
interface Msg {
  id: string;
  caseId: string | null;
  studentId: string;
  guardianId: string;
  draft: string;
  finalText: string | null;
  tone: ParentMessage['tone'];
  status: DeliveryStatus;
  channel: 'whatsapp' | 'sms' | null;
  approvedBy: string | null;
  approvedAt: string | null;
  failureReason: string | null;
  replies: { id: string; body: string; receivedAt: string }[];
  history: { status: DeliveryStatus; at: string }[];
  /** Pilot: the centre sent it from its own WhatsApp (no provider receipt, BR-APR-11). */
  manualSends?: { by: string; at: string }[];
}
interface NoteRow {
  id: string;
  studentId: string;
  groupId: string;
  tag: NoteTag;
  body: string;
  visibility: Note['visibility'];
  authorId: string;
  at: string;
}
/** One proposal item as ai-service returns it (ids only; names are filled in per request). */
export interface StoredVoiceItem {
  id: string;
  identity: VoiceItem['identity'];
  studentId: string | null;
  candidates: string[];
  /** For `unknown` (a misheard name): close roster names, offered in "Who is this?" only. */
  suggestions?: string[];
  mention: string | null;
  field: VoiceItem['field'];
  value: string | number | null;
  confidence: number;
  /** ai-service's band (it applies the pilot's "a voice score is always checked"). */
  band?: VoiceItem['band'];
  span: { start: number; end: number };
  sourceText: string;
  outOfRange: boolean;
}
/** What ai-service posts back for a note (B3). */
export interface VoiceResultIn {
  status: 'ready' | 'failed';
  code?: string;
  detail?: string;
  result?: {
    transcript: string;
    items: StoredVoiceItem[];
    unmentioned?: string[];
    modelVersion: string;
    latencyMs?: Record<string, number>;
  };
}
interface Voice {
  id: string;
  recordId: string;
  durationS: number;
  status: VoiceNote['status'];
  readyAt: number | null;
  /** Real pipeline (pilot, or demo with real speech-to-text): set when the audio was handed over. */
  submittedAt?: number | null;
  etaSeconds?: number | null;
  /** The ai-service proposal; absent = the demo fixture is used. */
  result?: {
    transcript: string;
    items: StoredVoiceItem[];
    modelVersion: string;
    latencyMs?: Record<string, number>;
  } | null;
  failure?: { code: string; at: string } | null;
  /** The teacher who recorded it (consent withdrawal removes their transcripts). */
  teacherId?: string;
  extraction: {
    id: string;
    status: VoiceExtraction['status'];
    /** itemId → chosen student (T07). */
    resolved: Record<string, string>;
    /** Items the teacher discarded (never saved to anyone). */
    discarded?: string[];
  };
}
type GuardianState = Pick<fx.GuardianFx, 'whatsappOptIn' | 'smsConsent' | 'stopped'>;

export interface DemoState {
  offline: boolean;
  /** Phase 2 flags as the demo controls set them (apps read them in mock modes). */
  phase2: boolean;
  /** STT down → V01 offers "Type the note instead" (FUP-VOI-06). */
  sttDown: boolean;
  /** One-shot fault on the next confirm (T08): fail before the commit, or lose the response after it. */
  confirmFault: 'before_commit' | 'after_commit' | null;
  /** Phase 1 marketplace screens (owner nav marketplace items, teacher Rooms/Earnings). */
  marketplace: boolean;
  /** "Simulate a new day" presses (cases' due dates move one day into the past each time). */
  dayOffset: number;
  /** B3: voice notes and Ask Link questions go to local Whisper (ai-service) instead of fixtures. */
  realStt?: boolean;
}

/** Rule row (06 §7 rules + rule_versions). A staff change is a proposal until the owner approves it. */
export interface RuleRow {
  code: 'consecutive_absences' | 'score_decline' | 'low_participation' | 'repeated_concern';
  active: boolean;
  params: Record<string, number>;
  /** `all` or one group id (FUP-RUL-01 AC2). */
  scope: string;
  version: number;
  history: {
    version: number;
    active: boolean;
    params: Record<string, number>;
    scope: string;
    approvedBy: string | null;
    at: string;
  }[];
  proposal: {
    active: boolean;
    params: Record<string, number>;
    scope: string;
    proposedBy: string;
    at: string;
  } | null;
}

interface FuState {
  records: Rec[];
  corrections: Corr[];
  signals: Sig[];
  cases: CaseRow[];
  messages: Msg[];
  notes: NoteRow[];
  voice: Voice[];
  guardians: Record<string, GuardianState>;
  /** Idempotency-Key → result (07 §1). */
  idem: Record<string, { kind: string; id: string }>;
  audit: AuditRow[];
  counters: { confirmCalls: number; confirmCommits: number };
  demo: DemoState;
  rules: RuleRow[];
  /** Pending staff invites (A16); part of the scenario, so Reset clears them. */
  invites: { phone: string; role: StaffMember['role']; at: string }[];
  /** CF-34: the owner asks the teacher to correct a confirmed record (teachers correct, owners ask). */
  correctionRequests?: CorrectionRequestRow[];
  /** Pilot only: the imported world. Demo state leaves it out and uses the fixtures. */
  world?: WorldData;
  seq: number;
}

/** One append-only activity event (A17). `data` carries ids and dates for `pilot:metrics`, never PII. */
export interface AuditRow {
  id: string;
  at: string;
  kind: string;
  actorId: string | null;
  text: Text;
  data?: Record<string, string | number | boolean | null>;
}
interface CorrectionRequestRow {
  id: string;
  recordId: string;
  groupId: string;
  studentId: string | null;
  text: string;
  requestedBy: string;
  at: string;
  status: 'open' | 'done';
  doneAt: string | null;
}
export type FollowupState = FuState;

// ── persistence ────────────────────────────────────────────────────────────────
const hasStorage = () => {
  try {
    // Browser only. Node 24+ has an experimental global localStorage; the mock server and tests keep state in memory.
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
};
let state: FuState | null = null;

/** A durable store for the pilot server (Node). Browser and demo keep their current behaviour. */
export interface FollowupStore {
  load(): FuState | null;
  save(s: FuState): void;
  /** Called once per new activity event, after `save` (append-only log). */
  appendAudit?(e: AuditRow): void;
}
let store: FollowupStore | null = null;
let pendingAudit: AuditRow[] = [];
const isPilotState = () => store !== null || state?.world?.kind === 'pilot';
export function configureFollowupStore(s: FollowupStore | null) {
  store = s;
  state = null;
  pendingAudit = [];
}

function load(): FuState {
  if (state) return state;
  if (store) {
    const s = store.load();
    if (s) return (state = s);
    throw new MockProblem(503, 'not_initialised', 'The pilot has not been set up yet.');
  }
  if (hasStorage()) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return (state = JSON.parse(raw) as FuState);
    } catch {
      /* fall back to fixtures */
    }
  }
  return (state = fresh());
}
function save() {
  if (state && store) {
    store.save(state);
    const out = pendingAudit;
    pendingAudit = [];
    for (const e of out) store.appendAudit?.(e);
    return;
  }
  if (state && hasStorage()) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* keep in memory */
    }
  }
}
const nextId = (prefix: string) => `${prefix}-${++load().seq}`;

// ── lookups ────────────────────────────────────────────────────────────────────
let demoWorldCache: WorldData | null = null;
/** The active world: the pilot's imported one, or the demo fixtures. */
export const world = (): WorldData => load().world ?? (demoWorldCache ??= demoWorld());
export const isPilot = () => world().kind === 'pilot';
const G = fx.DEMO_GROUP_ID;
const studentFx = (id: string) => world().students.find((s) => s.id === id);
const guardianFx = (id: string) => world().guardians.find((x) => x.id === id)!;
const staffFx = (id: string): WorldUser | undefined => world().users.find((u) => u.id === id);
const groupOf = (id: string) => world().groups.find((g) => g.id === id);
const groupName = (id: string, lang: Lang) => tx(groupOf(id)?.name ?? id, lang)!;
const groupsOfTeacher = (userId: string) =>
  world().groups.filter((g) => g.teacherUserId === userId);
/** Students of one follow-up group, in roster order. */
const rosterOf = (groupId: string) =>
  world()
    .members.filter((m) => m.groupId === groupId)
    .map((m) => studentFx(m.studentId)!)
    .filter(Boolean);
const groupsOfStudent = (studentId: string) =>
  world()
    .members.filter((m) => m.studentId === studentId)
    .map((m) => m.groupId);
const inGroup = (groupId: string, studentId: string) =>
  world().members.some((m) => m.groupId === groupId && m.studentId === studentId);
const person = (id: string, lang: Lang): PersonRef => {
  const s = studentFx(id);
  if (s) return { id, displayName: tx(s.name, lang)! };
  const u = staffFx(id);
  if (u) return { id, displayName: tx(u.name, lang)! };
  return { id, displayName: id };
};
const pastSessions = (groupId: string): Session[] =>
  sessionsOfGroup(world(), groupId).filter((s) => s.date <= cairoToday());
const recordFor = (sessionId: string) => load().records.find((r) => r.sessionId === sessionId);
const recordById = (id: string) => {
  const r = load().records.find((x) => x.id === id);
  if (!r) throw new MockProblem(404, 'not_found', 'Record not found.');
  return r;
};
export const isDemoGroup = (groupId: string) => groupId === G;
const roleOf = (userId: string): StaffRole | null => {
  const u = staffFx(userId);
  return u?.active ? u.role : null;
};
const teacherOwns = (userId: string, groupId: string) =>
  groupOf(groupId)?.teacherUserId === userId && roleOf(userId) === 'teacher';
const isCentreStaff = (userId: string) => {
  const r = roleOf(userId);
  return r === 'owner' || r === 'reception';
};
/** OD-34: centre staff with `messages.approve` (owner and Reception). */
const canApprove = isCentreStaff;
/** Ids are readable in the demo (`rec-<date>`) and unique per group in the pilot. */
const recId = (groupId: string, date: string) =>
  groupId === G && !isPilot() ? `rec-${date}` : `rec-${groupId}-${date}`;

function fmtDate(date: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB-u-nu-latn', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}
const maskPhone = (e164: string | null) =>
  e164 ? `${e164.slice(0, 3)} ${e164.slice(3, 5)} •••• ${e164.slice(-4)}` : '—';

function audit(
  kind: string,
  actorId: string | null,
  text: Text,
  at = new Date().toISOString(),
  data?: AuditRow['data'],
) {
  const e: AuditRow = { id: nextId('aud'), at, kind, actorId, text, ...(data ? { data } : {}) };
  load().audit.push(e);
  if (store) pendingAudit.push(e);
}

// ── seed ───────────────────────────────────────────────────────────────────────
function blankEntries(groupId: string, date: string): Entry[] {
  const prefix = groupId === G && !isPilot() ? `ent-${date}` : `ent-${groupId}-${date}`;
  return rosterOf(groupId).map((s) => ({
    id: `${prefix}-${s.id}`,
    studentId: s.id,
    attendance: 'not_recorded',
    lateMinutes: null,
    score: null,
    participation: 'not_recorded',
    observation: null,
    observationTag: null,
    source: 'tap',
  }));
}

const defaultRules = (approvedBy: string): RuleRow[] =>
  fx.rules.map((r) => ({
    code: r.code,
    active: r.active,
    params: { ...r.params },
    scope: 'all',
    version: 1,
    history: [
      {
        version: 1,
        active: r.active,
        params: { ...r.params },
        scope: 'all',
        approvedBy,
        at: '2026-09-01T08:00:00.000Z',
      },
    ],
    proposal: null,
  }));

function fresh(): FuState {
  state = {
    records: [],
    corrections: [],
    signals: [],
    cases: [],
    messages: [],
    notes: [],
    voice: [],
    guardians: Object.fromEntries(
      [...fx.guardians, fx.genericGuardian].map((x) => [
        x.id,
        { whatsappOptIn: x.whatsappOptIn, smsConsent: x.smsConsent, stopped: x.stopped },
      ]),
    ),
    idem: {},
    audit: [],
    counters: { confirmCalls: 0, confirmCommits: 0 },
    demo: {
      offline: false,
      phase2: false,
      marketplace: true,
      sttDown: false,
      confirmFault: null,
      dayOffset: 0,
    },
    invites: [],
    correctionRequests: [],
    rules: defaultRules('usr-owner'),
    seq: 100,
  };
  const past = pastSessions(G);
  // past[-1] is the session being recorded now (no record yet); seed the ones before it, oldest first.
  const before = past.slice(0, -1).reverse(); // newest first
  const seeds = fx.pastRecords.map((p, i) => ({ p, s: before[i] })).filter((x) => x.s);
  // Older sessions than the fixtures: confirmed, everyone present.
  for (const s of before.slice(fx.pastRecords.length).reverse()) seedRecord(s, {});
  for (const { p, s } of [...seeds].reverse()) if (!p.missing) seedRecord(s!, p);
  // Run the rules over the history in order, as the real system would have.
  for (const r of [...state.records].sort((a, b) => a.date.localeCompare(b.date))) {
    audit(
      'record.confirmed',
      fx.DEMO_TEACHER_USER,
      {
        en: `Session record confirmed • ${fx.groupName.en} (${fmtDate(r.date, 'en')})`,
        ar: `تم تأكيد سجل الحصة • ${fx.groupName.ar} (${fmtDate(r.date, 'ar')})`,
      },
      r.confirmedAt!,
    );
    for (const st of fx.roster) evaluate(st.id, G, r.date, r.confirmedAt!);
  }
  // Omar's correction on the unit test (FUP-REC-08).
  const c = fx.omarCorrection;
  const target = seeds[c.recordIndex]?.s;
  if (target) {
    const r = recordFor(target.id)!;
    const e = r.entries.find((x) => x.studentId === c.studentId)!;
    state.corrections.push({
      id: nextId('cor'),
      recordId: r.id,
      entryId: e.id,
      studentId: c.studentId,
      field: c.field,
      oldValue: c.oldValue,
      newValue: c.newValue,
      reason: c.reason,
      authorId: fx.DEMO_TEACHER_USER,
      at: new Date(new Date(r.confirmedAt!).getTime() + 86_400_000).toISOString(),
    });
    e.score = Number(c.newValue);
    audit(
      'record.corrected',
      fx.DEMO_TEACHER_USER,
      {
        en: `Correction: Omar Ali score 21 → 12 (typing error) • original kept`,
        ar: `تصحيح: درجة عمر علي ٢١ ← ١٢ (خطأ في الكتابة) • الأصل محفوظ`,
      },
      new Date(new Date(r.confirmedAt!).getTime() + 86_400_000).toISOString(),
    );
  }
  return state;
}

function seedRecord(
  s: { id: string; date: string; startsAt: string; endsAt: string },
  p: (typeof fx.pastRecords)[number],
) {
  const a = p.assessment ? fx.assessments[p.assessment] : null;
  const entries = blankEntries(G, s.date).map((e) => {
    const absent = p.absent?.includes(e.studentId);
    const notRec = p.notRecorded?.includes(e.studentId);
    const late = p.late?.[e.studentId];
    const obs = p.observations?.find((o) => o.studentId === e.studentId);
    return {
      ...e,
      attendance: (notRec
        ? 'not_recorded'
        : absent
          ? 'absent'
          : late
            ? 'late'
            : 'present') as Attendance,
      lateMinutes: late ?? null,
      score: !absent ? (p.scores?.[e.studentId] ?? null) : null,
      participation: (absent || notRec ? 'not_recorded' : 'normal') as Participation,
      observation: obs?.text ?? null,
      observationTag: obs?.tag ?? null,
    };
  });
  const groupObs = p.observations?.find((o) => o.studentId === null);
  load().records.push({
    id: `rec-${s.date}`,
    groupId: G,
    sessionId: s.id,
    date: s.date,
    startsAt: s.startsAt,
    status: 'confirmed',
    source: 'tap',
    assessment: a
      ? { id: `asm-${s.date}`, title: a.title, series: a.series, maxScore: a.maxScore }
      : null,
    entries,
    groupObservation: groupObs?.text ?? null,
    confirmedBy: fx.DEMO_TEACHER_USER,
    confirmedAt: s.endsAt,
    createdAt: s.endsAt,
  });
}

/**
 * Pilot state: the imported world, empty history, the 03 §3 rule defaults (only
 * `consecutive_absences` on). No fixture record, case, message or demo user is created.
 */
export function freshPilotState(w: WorldData): FuState {
  if (w.kind !== 'pilot') throw new Error('freshPilotState needs a pilot world');
  const owner = w.users.find((u) => u.role === 'owner');
  return {
    records: [],
    corrections: [],
    signals: [],
    cases: [],
    messages: [],
    notes: [],
    voice: [],
    guardians: Object.fromEntries(
      w.guardians.map((g) => [g.id, { whatsappOptIn: false, smsConsent: false, stopped: false }]),
    ),
    idem: {},
    audit: [],
    counters: { confirmCalls: 0, confirmCommits: 0 },
    demo: {
      offline: false,
      phase2: true,
      marketplace: false,
      sttDown: false,
      confirmFault: null,
      dayOffset: 0,
    },
    invites: [],
    correctionRequests: [],
    rules: defaultRules(owner?.id ?? 'system').map((r) => ({
      ...r,
      history: r.history.map((h) => ({ ...h, at: new Date().toISOString() })),
    })),
    world: w,
    seq: 100,
  };
}

export function resetFollowupDb() {
  if (isPilotState())
    throw new MockProblem(409, 'pilot_mode', 'Reset is not available in the pilot.');
  const keep = state?.demo;
  state = fresh();
  // A reset keeps the demo switches the presenter set, except one-shot faults and offline.
  if (keep)
    state.demo = {
      ...state.demo,
      ...keep,
      offline: false,
      confirmFault: null,
      sttDown: false,
      dayOffset: 0,
    };
  save();
}

// ── rules (FUP-RUL-03): the followup module is the only evaluator ──────────────
const AR_DIGITS = (n: number) => new Intl.NumberFormat('ar-EG').format(n);
const EN_COUNT: Record<number, string> = { 2: 'two', 3: 'three', 4: 'four', 5: 'five' };
/** "two consecutive scheduled sessions" / "حصتين متتاليتين" (n from the rule version in force). */
const consecutiveWords = (n: number, lang: Lang) =>
  lang === 'ar'
    ? n === 2
      ? 'حصتين متتاليتين'
      : n <= 10
        ? `${AR_DIGITS(n)} حصص متتالية`
        : `${AR_DIGITS(n)} حصة متتالية`
    : `${EN_COUNT[n] ?? n} consecutive scheduled sessions`;
/** "the last two sessions" / "آخر حصتين" for message drafts. */
const lastWords = (n: number) =>
  n === 2 ? 'آخر حصتين' : n <= 10 ? `آخر ${AR_DIGITS(n)} حصص` : `آخر ${AR_DIGITS(n)} حصة`;

function evaluate(
  studentId: string,
  groupId: string,
  uptoDate: string,
  at: string,
  cause?: { correctionOf: string },
) {
  const s = load();
  const rule = s.rules.find((r) => r.code === 'consecutive_absences')!;
  if (!rule.active || (rule.scope !== 'all' && rule.scope !== groupId)) return;
  const n = rule.params.n ?? 2;
  const sched = pastSessions(groupId)
    .filter((x) => x.date <= uptoDate)
    .slice(-n);
  const recs = sched.map((x) => recordFor(x.id));
  // Every one of the last n scheduled sessions needs a CONFIRMED record showing "absent".
  // A missing record or "not recorded" breaks the streak (BR-APR-07, BR-APR-08).
  const holds =
    sched.length === n &&
    recs.every(
      (r) =>
        r?.status === 'confirmed' &&
        r.entries.find((e) => e.studentId === studentId)?.attendance === 'absent',
    );
  const open = s.signals.find(
    (x) =>
      x.rule === 'consecutive_absences' &&
      x.studentId === studentId &&
      x.groupId === groupId &&
      (x.status === 'open' || x.status === 'case_opened'),
  );
  if (holds) {
    const ids = recs.map((r) => r!.id);
    if (open) {
      // Dedupe: add new evidence to the open flag, never a second flag (INV-08).
      for (const id of ids) if (!open.evidence.includes(id)) open.evidence.push(id);
      return;
    }
    const sig: Sig = {
      id: nextId('sig'),
      rule: 'consecutive_absences',
      ruleVersion: rule.version,
      studentId,
      groupId,
      evidence: ids,
      n,
      status: 'case_opened',
      caseId: null,
      raisedAt: at,
    };
    // Due dates are Cairo calendar days (Africa/Cairo), never the UTC date of the timestamp.
    const raisedOn = cairoToday(new Date(at));
    const assignee = defaultAssignee();
    const assigneeTitle = staffFx(assignee)?.title ?? { en: 'Reception', ar: 'الاستقبال' };
    const c: CaseRow = {
      id: nextId('case'),
      signalId: sig.id,
      studentId,
      assigneeId: assignee,
      status: 'open',
      dueOn: addDays(raisedOn, fx.RULE_DEFAULTS.dueInDays),
      dismissReason: null,
      attempts: [],
      messageIds: [],
      timeline: [
        {
          at,
          kind: 'flag_raised',
          text: {
            en: `Flag raised by rule "Consecutive absences" (v${rule.version})`,
            ar: `تم رفع تنبيه بقاعدة "غياب متتالي" (الإصدار ${AR_DIGITS(rule.version)})`,
          },
          actorId: null,
        },
        {
          at,
          kind: 'assigned',
          text: {
            en: `Assigned to ${assigneeTitle.en}, due the same day`,
            ar: `أُسند إلى ${assigneeTitle.ar}، مستحق في نفس اليوم`,
          },
          actorId: null,
        },
      ],
    };
    sig.caseId = c.id;
    s.signals.push(sig);
    s.cases.push(c);
    const st = studentFx(studentId)!;
    audit(
      'signal.raised',
      null,
      {
        en: `Rule matched: ${n} consecutive absences • ${st.name.en} → follow-up opened, assigned to ${assigneeTitle.en}`,
        ar: `تطابقت قاعدة: غياب ${consecutiveWords(n, 'ar')} • ${st.name.ar} ← فُتحت متابعة وأُسندت ${assigneeTitle.ar === 'الاستقبال' ? 'للاستقبال' : `إلى ${assigneeTitle.ar}`}`,
      },
      at,
      {
        signalId: sig.id,
        caseId: c.id,
        rule: sig.rule,
        ruleVersion: rule.version,
        groupId,
        studentId,
        dueOn: c.dueOn,
        assigneeId: assignee,
      },
    );
  } else if (open && cause && open.evidence.includes(cause.correctionOf)) {
    // FUP-REC-08 AC3: a flag that no longer applies is kept with a note, never deleted.
    open.status = 'resolved_by_correction';
    const c = s.cases.find((x) => x.id === open.caseId);
    c?.timeline.push({
      at,
      kind: 'resolved_by_correction',
      text: {
        en: 'Resolved by correction: the rule no longer applies',
        ar: 'انتهى بتصحيح: القاعدة لم تعد تنطبق',
      },
      actorId: null,
    });
    audit(
      'signal.resolved_by_correction',
      null,
      {
        en: 'A correction resolved a flag: the rule no longer applies',
        ar: 'تصحيح أنهى تنبيهًا: القاعدة لم تعد تنطبق',
      },
      at,
      { signalId: open.id, caseId: open.caseId },
    );
  }
}

/** Reception gets new follow-ups by default (FUP-CAS-02); the owner when there is no Reception. */
function defaultAssignee(): string {
  const w = world();
  if (w.kind === 'demo') return fx.RULE_DEFAULTS.assigneeUserId;
  const pick = (r: StaffRole) => w.users.find((u) => u.role === r && u.active)?.id;
  return pick('reception') ?? pick('owner') ?? 'unassigned';
}

// ── DTOs ───────────────────────────────────────────────────────────────────────
function signalSummary(x: Sig, lang: Lang): SignalSummary {
  return {
    student: person(x.studentId, lang),
    id: x.id,
    rule: x.rule,
    ruleVersion: x.ruleVersion,
    explanation: explanation(x, lang),
    status: x.status,
    caseId: x.caseId,
  };
}
function explanation(x: Sig, lang: Lang) {
  const n = x.n ?? 2;
  const dates = x.evidence
    .map((id) => recordById(id).date)
    .sort()
    .slice(-n)
    .map((d) => fmtDate(d, lang));
  const st = studentFx(x.studentId)!;
  if (lang === 'ar') {
    const verb = st.gender === 'f' ? 'غابت' : st.gender === 'm' ? 'غاب' : 'غياب';
    return `${verb} عن ${consecutiveWords(n, 'ar')}: ${dates.join(' و')}`;
  }
  const list = dates.length > 1 ? `${dates.slice(0, -1).join(', ')} and ${dates.at(-1)}` : dates[0];
  return `Absent from ${consecutiveWords(n, 'en')}: ${list}`;
}
/** The rule in plain words, as it stood when the flag was raised (FUP-CAS-02 AC1). */
function ruleText(version: number, n: number, lang: Lang) {
  if (lang === 'ar')
    return `غياب متتالي (القاعدة الإصدار ${AR_DIGITS(version)}): يُرفع تنبيه عندما يغيب الطالب عن ${
      n === 2 ? 'آخر حصتين مجدولتين، ولكل منهما' : `آخر ${AR_DIGITS(n)} حصص مجدولة، ولكل منها`
    } سجل مؤكَّد. الحصة "غير المسجّلة" تقطع التتابع.`;
  return `Consecutive absences (Rule v${version}): a flag is raised when a student is absent from the last ${n} scheduled sessions, each with a confirmed record. A "Not recorded" session breaks the streak.`;
}
const RULE_TEXT: mfx.L = { en: ruleText(1, 2, 'en'), ar: ruleText(1, 2, 'ar') };
function signalDto(x: Sig, lang: Lang): Signal {
  return {
    ...signalSummary(x, lang),
    student: person(x.studentId, lang),
    group: { id: x.groupId, name: groupName(x.groupId, lang) },
    evidence: x.evidence.map((id) => {
      const r = recordById(id);
      return {
        recordId: id,
        sessionDate: r.date,
        attendance: r.entries.find((e) => e.studentId === x.studentId)!.attendance,
        confirmedBy: person(r.confirmedBy!, lang),
      };
    }),
    ruleText: ruleText(x.ruleVersion, x.n ?? 2, lang),
    raisedAt: x.raisedAt,
  };
}

function recordDto(r: Rec, lang: Lang): SessionRecord {
  const s = load();
  return {
    id: r.id,
    groupId: r.groupId,
    groupSessionId: r.sessionId,
    sessionDate: r.date,
    startsAt: r.startsAt,
    status: r.status,
    source: r.source,
    assessment: r.assessment
      ? {
          id: r.assessment.id,
          title: tx(r.assessment.title, lang)!,
          series: r.assessment.series,
          maxScore: r.assessment.maxScore,
        }
      : null,
    entries: r.entries.map((e) => ({
      id: e.id,
      student: person(e.studentId, lang),
      attendance: e.attendance,
      lateMinutes: e.lateMinutes,
      score: e.score,
      participation: e.participation,
      observation: tx(e.observation, lang),
      observationTag: e.observationTag,
      source: e.source,
    })),
    groupObservation: tx(r.groupObservation, lang),
    confirmedBy: r.confirmedBy ? person(r.confirmedBy, lang) : null,
    confirmedAt: r.confirmedAt,
    createdAt: r.createdAt,
    corrections: s.corrections
      .filter((c) => c.recordId === r.id)
      .map((c) => correctionDto(c, lang)),
    signals: s.signals.filter((x) => x.evidence.includes(r.id)).map((x) => signalSummary(x, lang)),
    correctionRequests: (s.correctionRequests ?? [])
      .filter((q) => q.recordId === r.id)
      .map((q) => correctionRequestDto(q, lang)),
  };
}
function correctionDto(c: Corr, lang: Lang): Correction {
  return {
    id: c.id,
    entryId: c.entryId,
    student: person(c.studentId, lang),
    field: c.field,
    oldValue: c.oldValue,
    newValue: c.newValue,
    reason: tx(c.reason, lang)!,
    author: person(c.authorId, lang),
    at: c.at,
  };
}

function guardianDto(id: string, lang: Lang): GuardianContact {
  const f = guardianFx(id);
  const g = load().guardians[id] ?? { whatsappOptIn: false, smsConsent: false, stopped: false };
  return {
    id,
    displayName: tx(f.name, lang)!,
    phoneMasked: maskPhone(f.phone),
    whatsappOptIn: g.whatsappOptIn && !!f.phone,
    smsConsent: g.smsConsent && !!f.phone,
    stopped: g.stopped,
  };
}
function blockedReason(guardianId: string): ParentMessage['blockedReason'] {
  // Pilot: the centre sends from its own WhatsApp, so Link's opt-in state does not apply (A6).
  if (isPilot()) return null;
  const g = guardianDto(guardianId, 'en');
  if (g.stopped) return 'stopped';
  if (!g.whatsappOptIn) return 'not_opted_in';
  return null;
}

function caseDto(c: CaseRow, lang: Lang): FollowupCase {
  const sig = load().signals.find((x) => x.id === c.signalId)!;
  const closed = c.status === 'resolved' || c.status === 'dismissed';
  return {
    id: c.id,
    signal: signalDto(sig, lang),
    student: person(c.studentId, lang),
    assignee: {
      ...person(c.assigneeId, lang),
      role: tx(staffFx(c.assigneeId)?.title ?? '', lang)!,
    },
    status: c.status,
    dueOn: c.dueOn,
    // FUP-CAS-05: past due with no outcome recorded.
    overdue: !closed && c.dueOn < cairoToday() && c.attempts.length === 0,
    dismissReason: c.dismissReason,
    attempts: c.attempts.map((a) => ({ ...a, createdBy: person(a.createdBy, lang) })),
    messageIds: c.messageIds,
    timeline: c.timeline.map((t) => ({
      at: t.at,
      kind: t.kind,
      text: tx(t.text, lang)!,
      actor: t.actorId ? person(t.actorId, lang) : null,
    })),
  };
}

function messageDto(m: Msg, lang: Lang): ParentMessage {
  const c = m.caseId ? load().cases.find((x) => x.id === m.caseId) : null;
  const sig = c ? load().signals.find((x) => x.id === c.signalId) : null;
  return {
    id: m.id,
    caseId: m.caseId,
    student: person(m.studentId, lang),
    guardian: guardianDto(m.guardianId, lang),
    purpose: lang === 'ar' ? 'متابعة الغياب' : 'Attendance follow-up',
    draft: m.draft,
    finalText: m.finalText,
    tone: m.tone,
    groundedFacts: sig ? groundedFacts(sig, lang) : [],
    status: m.status,
    channel: m.channel,
    blockedReason:
      m.status === 'draft' || m.status === 'not_sendable' ? blockedReason(m.guardianId) : null,
    approvedBy: m.approvedBy ? person(m.approvedBy, lang) : null,
    approvedAt: m.approvedAt,
    failureReason: m.failureReason,
    replies: m.replies.map((r) => replyDto(r, lang)),
    history: m.history,
    sentManually: m.manualSends?.length
      ? { by: person(m.manualSends.at(-1)!.by, lang), at: m.manualSends.at(-1)!.at }
      : null,
  };
}
function replyDto(r: Msg['replies'][number], lang: Lang): InboundMessage {
  const isDemo = r.body === fx.demoReply.body;
  return {
    id: r.id,
    body: r.body,
    summary: isDemo ? fx.demoReply.summary[lang] : r.body,
    intent: isDemo ? fx.demoReply.intent[lang] : lang === 'ar' ? 'غير محدد' : 'Unclear',
    receivedAt: r.receivedAt,
    suggestions: isDemo
      ? ['record_outcome', 'check_seat', 'draft_reply']
      : ['record_outcome', 'draft_reply'],
  };
}
function groundedFacts(sig: Sig, lang: Lang) {
  return sig.evidence.map((id) => {
    const r = recordById(id);
    const by = person(r.confirmedBy!, lang).displayName;
    return {
      text:
        lang === 'ar'
          ? `الحضور • ${fmtDate(r.date, lang)} • غائب • أكّده المعلّم`
          : `Attendance • ${fmtDate(r.date, lang)} • Absent • Teacher confirmed`,
      source: lang === 'ar' ? `سجل الحصة • أكّدته ${by}` : `Session record • confirmed by ${by}`,
      recordId: id,
    };
  });
}

// ── teacher: today, groups, roster, student ─────────────────────────────────────
function requireTeacher(userId: string, groupId: string) {
  if (!teacherOwns(userId, groupId))
    throw new MockProblem(403, 'forbidden', 'This group is not yours.');
}

export function teacherToday(userId: string, lang: Lang): TeacherToday {
  if (roleOf(userId) !== 'teacher') throw new MockProblem(403, 'forbidden', 'Teachers only.');
  const s = load();
  const now = Date.now();
  const groups = groupsOfTeacher(userId);
  const mine = new Set(groups.map((g) => g.id));
  const next =
    groups
      .flatMap((g) => sessionsOfGroup(world(), g.id))
      .filter((x) => new Date(x.endsAt).getTime() > now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;
  // Reminders only from CONFIRMED observations, each with its source (FUP-REC-01 AC1).
  const reminders = s.records
    .filter((r) => r.status === 'confirmed' && mine.has(r.groupId))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 2)
    .flatMap((r) =>
      r.entries
        .filter((e) => e.observationTag === 'needs_revisit' && e.observation)
        .map((e) => ({
          text: tx(e.observation, lang)!,
          student: person(e.studentId, lang),
          source: { recordId: r.id, sessionDate: r.date },
        })),
    );
  // The record due is the latest session that has taken place without a confirmed record.
  const latest = groups
    .map((g) => pastSessions(g.id).at(-1))
    .filter((x): x is Session => !!x && recordFor(x.id)?.status !== 'confirmed')
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const due = latest[0];
  const dueRec = due ? recordFor(due.id) : undefined;
  const recordDue: TeacherToday['recordDue'] = due
    ? {
        groupId: due.groupId,
        groupName: groupName(due.groupId, lang),
        sessionId: due.id,
        sessionDate: due.date,
        startsAt: due.startsAt,
        endsAt: due.endsAt,
        studentCount: rosterOf(due.groupId).length,
        recordId: dueRec?.id ?? null,
      }
    : null;
  const needsYou: TeacherToday['needsYou'] = [];
  const older = groups.flatMap((g) => {
    const past = pastSessions(g.id);
    const last = past.at(-1);
    // A group's latest session is listed here only when another group's is the record due.
    return [...past.slice(-6, -1), ...(last && last.id !== due?.id ? [last] : [])];
  });
  for (const p of older.sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const r = recordFor(p.id);
    if (r?.status === 'confirmed') continue;
    needsYou.push({
      kind: r ? 'draft' : 'missing',
      groupId: p.groupId,
      groupName: groupName(p.groupId, lang),
      sessionId: p.id,
      sessionDate: p.date,
      recordId: r?.id ?? null,
    });
  }
  return {
    teacher: person(userId, lang),
    nextSession: next
      ? {
          groupId: next.groupId,
          groupName: groupName(next.groupId, lang),
          sessionId: next.id,
          startsAt: next.startsAt,
          studentCount: rosterOf(next.groupId).length,
        }
      : null,
    reminders,
    recordDue,
    needsYou: needsYou.reverse(),
    correctionRequests: (s.correctionRequests ?? [])
      .filter((q) => q.status === 'open' && mine.has(q.groupId))
      .map((q) => correctionRequestDto(q, lang)),
  };
}

/** Follow-up part of T09 for one group (null when the group has no follow-up subscription). */
export function followupSummary(groupId: string) {
  if (!groupOf(groupId)) return null;
  const recent = pastSessions(groupId).slice(-7);
  const s = load();
  return {
    studentCount: rosterOf(groupId).length,
    recordsComplete: {
      confirmed: recent.filter((p) => recordFor(p.id)?.status === 'confirmed').length,
      eligible: recent.length,
    },
    openFollowUps: s.cases.filter(
      (c) =>
        !['resolved', 'dismissed'].includes(c.status) &&
        s.signals.find((x) => x.id === c.signalId)?.groupId === groupId,
    ).length,
  } satisfies TeacherGroup['followup'];
}

/** T09 in the pilot: the teacher's follow-up groups only (no marketplace fields to show). */
export function pilotTeacherGroups(userId: string, lang: Lang): TeacherGroup[] {
  if (roleOf(userId) !== 'teacher') throw new MockProblem(403, 'forbidden', 'Teachers only.');
  const now = Date.now();
  const w = world();
  return groupsOfTeacher(userId).map((g) => {
    const next = sessionsOfGroup(w, g.id).find((x) => new Date(x.startsAt).getTime() > now);
    return {
      id: g.id,
      name: tx(g.name, lang)!,
      centre: { id: w.centre.id, displayName: tx(w.centre.name, lang)! },
      room: '',
      weekdays: g.weekdays,
      startTime: g.startTime,
      endTime: g.endTime,
      sessionFee: { amountPt: 0, currency: 'EGP' as const },
      monthlyFee: { amountPt: 0, currency: 'EGP' as const },
      offersMonthlyRecurring: false,
      seatCap: 0,
      seatsFilled: 0,
      nextSession: next ? { id: next.id, startsAt: next.startsAt } : null,
      followup: followupSummary(g.id),
    };
  });
}

function lastFour(studentId: string, groupId: string): (Attendance | 'none')[] {
  return pastSessions(groupId)
    .slice(-4)
    .map((p) => {
      const r = recordFor(p.id);
      if (!r || r.status !== 'confirmed') return 'none';
      return r.entries.find((e) => e.studentId === studentId)?.attendance ?? 'none';
    });
}
function latestScore(studentId: string, lang: Lang) {
  const r = load()
    .records.filter((x) => x.status === 'confirmed' && x.assessment)
    .sort((a, b) => b.date.localeCompare(a.date))
    .find((x) => x.entries.find((e) => e.studentId === studentId)?.score != null);
  if (!r) return null;
  return {
    score: r.entries.find((e) => e.studentId === studentId)!.score!,
    maxScore: r.assessment!.maxScore,
    title: tx(r.assessment!.title, lang)!,
  };
}
const flagsOf = (studentId: string, lang: Lang) =>
  load()
    .signals.filter(
      (x) => x.studentId === studentId && (x.status === 'open' || x.status === 'case_opened'),
    )
    .map((x) => signalSummary(x, lang));

export function roster(userId: string, groupId: string, lang: Lang): RosterRow[] {
  if (!groupOf(groupId)) throw new MockProblem(404, 'not_found', 'Group not found.');
  if (!teacherOwns(userId, groupId) && !isCentreStaff(userId))
    throw new MockProblem(403, 'forbidden', 'Not allowed.');
  return rosterOf(groupId).map((st) => ({
    student: person(st.id, lang),
    lastSessions: lastFour(st.id, groupId),
    latestScore: latestScore(st.id, lang),
    noteCount:
      load().notes.filter((n) => n.studentId === st.id).length +
      load().records.filter(
        (r) =>
          r.status === 'confirmed' && r.entries.some((e) => e.studentId === st.id && e.observation),
      ).length,
    flags: flagsOf(st.id, lang),
  }));
}

export function studentDetail(userId: string, studentId: string, lang: Lang): StudentDetail {
  if (!studentFx(studentId)) throw new MockProblem(404, 'not_found', 'Student not found.');
  const groupIds = groupsOfStudent(studentId);
  if (!groupIds.some((g) => teacherOwns(userId, g)) && !isCentreStaff(userId))
    throw new MockProblem(403, 'forbidden', 'Not allowed.');
  // The student's group taught by this teacher, else the first one (a student is usually in one).
  const groupId = groupIds.find((g) => teacherOwns(userId, g)) ?? groupIds[0]!;
  const s = load();
  const confirmed = s.records
    .filter((r) => r.status === 'confirmed')
    .sort((a, b) => a.date.localeCompare(b.date));
  const att = pastSessions(groupId).map((p) => {
    const r = recordFor(p.id);
    const v =
      r?.status === 'confirmed'
        ? r.entries.find((e) => e.studentId === studentId)!.attendance
        : 'none';
    return { sessionDate: p.date, value: v as Attendance | 'none' };
  });
  // Trends: one line per assessment series, never mixing series (FUP-REC-11 AC2).
  const bySeries = new Map<string, StudentDetail['trends'][number]['points']>();
  for (const r of confirmed) {
    const e = r.entries.find((x) => x.studentId === studentId);
    if (!r.assessment?.series || e?.score == null) continue;
    const pts = bySeries.get(r.assessment.series) ?? [];
    pts.push({
      sessionDate: r.date,
      score: e.score,
      maxScore: r.assessment.maxScore,
      title: tx(r.assessment.title, lang)!,
    });
    bySeries.set(r.assessment.series, pts);
  }
  const monthStart = cairoToday().slice(0, 8) + '01';
  const notes = notesOf(studentId, lang);
  return {
    student: person(studentId, lang),
    group: { id: groupId, name: groupName(groupId, lang) },
    attended: {
      present: att.filter((a) => a.value === 'present' || a.value === 'late').length,
      of: att.filter((a) => a.value !== 'none' && a.value !== 'not_recorded').length,
    },
    latestScore: latestScore(studentId, lang),
    notesThisMonth: notes.filter((n) => cairoToday(new Date(n.at)) >= monthStart).length,
    attendance: att,
    trends: [...bySeries].map(([series, points]) => ({ series, points })),
    notes,
    flags: flagsOf(studentId, lang),
  };
}

function notesOf(studentId: string, lang: Lang): Note[] {
  const s = load();
  // Confirmed record observations count as teacher notes too (same internal visibility).
  const fromRecords: Note[] = s.records
    .filter((r) => r.status === 'confirmed')
    .flatMap((r) =>
      r.entries
        .filter((e) => e.studentId === studentId && e.observation)
        .map((e) => ({
          id: `obs-${e.id}`,
          student: person(studentId, lang),
          groupId: r.groupId,
          tag: e.observationTag ?? 'understanding',
          body: tx(e.observation, lang)!,
          visibility: 'internal' as const,
          author: person(r.confirmedBy!, lang),
          at: r.confirmedAt!,
        })),
    );
  const own: Note[] = s.notes
    .filter((n) => n.studentId === studentId)
    .map((n) => ({ ...n, student: person(n.studentId, lang), author: person(n.authorId, lang) }));
  return [...own, ...fromRecords].sort((a, b) => b.at.localeCompare(a.at));
}

export function addNote(
  userId: string,
  studentId: string,
  body: { groupId: string; tag: NoteTag; body: string },
  lang: Lang,
): Note {
  requireTeacher(userId, body.groupId);
  if (!studentFx(studentId) || !inGroup(body.groupId, studentId))
    throw new MockProblem(404, 'not_found', 'Student not found.');
  const TAGS: NoteTag[] = [
    'understanding',
    'needs_revisit',
    'behaviour',
    'positive',
    'absence_context',
  ];
  if (!TAGS.includes(body.tag)) throw new MockProblem(422, 'validation_failed', 'Pick a topic.');
  const text = (body.body ?? '').trim();
  if (!text) throw new MockProblem(422, 'validation_failed', 'Write the note.');
  if ([...text].length > 500)
    throw new MockProblem(422, 'too_long', 'A note can have up to 500 characters.', { max: 500 });
  const n: NoteRow = {
    id: nextId('note'),
    studentId,
    groupId: body.groupId,
    tag: body.tag,
    body: text,
    visibility: 'internal',
    authorId: userId,
    at: new Date().toISOString(),
  };
  load().notes.push(n);
  audit(
    'note.saved',
    userId,
    {
      en: `Note saved for ${studentFx(studentId)!.name.en}`,
      ar: `ملاحظة محفوظة عن ${studentFx(studentId)!.name.ar}`,
    },
    undefined,
    { groupId: body.groupId, studentId },
  );
  save();
  return { ...n, student: person(studentId, lang), author: person(userId, lang) };
}

/** FUP-REC-10 AC3: goes to staff for review; never to the parent. */
export function suggestNote(userId: string, noteId: string, lang: Lang): Note {
  const n = load().notes.find((x) => x.id === noteId);
  if (!n) throw new MockProblem(404, 'not_found', 'Note not found.');
  if (n.authorId !== userId)
    throw new MockProblem(403, 'forbidden', 'Only the author can suggest it.');
  n.visibility = 'suggested_for_parent';
  audit('note.suggested', userId, {
    en: 'Note suggested to staff for a parent update',
    ar: 'تم اقتراح ملاحظة على الإدارة لتحديث وليّ الأمر',
  });
  save();
  return { ...n, student: person(n.studentId, lang), author: person(n.authorId, lang) };
}

// ── records ────────────────────────────────────────────────────────────────────
export function listRecords(userId: string, groupId: string, lang: Lang) {
  if (!teacherOwns(userId, groupId) && !isCentreStaff(userId))
    throw new MockProblem(403, 'forbidden', 'Not allowed.');
  return load()
    .records.filter((r) => r.groupId === groupId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => recordDto(r, lang));
}

export function openRecord(userId: string, groupId: string, sessionId: string, lang: Lang) {
  requireTeacher(userId, groupId);
  const sess = pastSessions(groupId).find((p) => p.id === sessionId);
  if (!sess)
    throw new MockProblem(
      422,
      'session_not_recordable',
      'Only sessions that have taken place, or today’s, can be recorded.',
    );
  const existing = recordFor(sessionId);
  if (existing) return { created: false, record: recordDto(existing, lang) };
  const r: Rec = {
    id: recId(groupId, sess.date),
    groupId,
    sessionId,
    date: sess.date,
    startsAt: sess.startsAt,
    status: 'draft',
    source: 'tap',
    assessment: null,
    entries: blankEntries(groupId, sess.date),
    groupObservation: null,
    confirmedBy: null,
    confirmedAt: null,
    createdAt: new Date().toISOString(),
  };
  load().records.push(r);
  audit(
    'record.draft_created',
    userId,
    {
      en: `Draft record created • ${groupName(groupId, 'en')} (${fmtDate(sess.date, 'en')})`,
      ar: `تم إنشاء مسودة سجل • ${groupName(groupId, 'ar')} (${fmtDate(sess.date, 'ar')})`,
    },
    undefined,
    { recordId: r.id, groupId, sessionId, sessionDate: sess.date },
  );
  save();
  return { created: true, record: recordDto(r, lang) };
}

export function getRecord(userId: string, id: string, lang: Lang) {
  const r = recordById(id);
  if (!teacherOwns(userId, r.groupId) && !isCentreStaff(userId))
    throw new MockProblem(403, 'forbidden', 'Not allowed.');
  return recordDto(r, lang);
}

function validateEntries(entries: EntryInput[], maxScore: number | null, groupId: string) {
  for (const e of entries) {
    if (!inGroup(groupId, e.studentId))
      throw new MockProblem(422, 'unknown_student', 'A student is not on this roster.');
    if (e.score == null) continue;
    if (maxScore == null)
      throw new MockProblem(
        422,
        'assessment_required',
        'Name the assessment and its maximum before entering scores.',
      );
    if (e.attendance === 'absent')
      throw new MockProblem(
        422,
        'score_for_absent',
        'An absent student has no score. Absence is recorded separately.',
        { studentId: e.studentId },
      );
    // BR-APR-09: block, never cap.
    if (e.score < 0 || e.score > maxScore)
      throw new MockProblem(
        422,
        'score_out_of_range',
        `${e.score} exceeds the maximum of ${maxScore}.`,
        {
          studentId: e.studentId,
          value: e.score,
          max: maxScore,
        },
      );
  }
}

export function saveDraft(userId: string, id: string, body: SaveRecordBody, lang: Lang) {
  const r = recordById(id);
  requireTeacher(userId, r.groupId);
  if (r.status === 'confirmed')
    throw new MockProblem(
      409,
      'record_confirmed',
      'This record is confirmed. Add a correction instead.',
    );
  const a = body.assessment === undefined ? r.assessment : body.assessment;
  if (a && !(a.maxScore > 0))
    throw new MockProblem(422, 'validation_failed', 'The maximum must be above 0.');
  validateEntries(body.entries ?? [], a ? a.maxScore : null, r.groupId);
  r.assessment = a
    ? {
        id: r.assessment?.id ?? `asm-${r.date}`,
        title: tx(a.title, lang)!,
        series: a.series,
        maxScore: a.maxScore,
      }
    : null;
  for (const inp of body.entries ?? []) {
    const e = r.entries.find((x) => x.studentId === inp.studentId)!;
    e.attendance = inp.attendance;
    e.lateMinutes = inp.attendance === 'late' ? (inp.lateMinutes ?? null) : null;
    e.score = inp.score ?? null;
    e.participation = inp.participation ?? e.participation;
    e.observation = inp.observation === undefined ? e.observation : inp.observation;
    e.observationTag = inp.observationTag === undefined ? e.observationTag : inp.observationTag;
    e.source = inp.source ?? e.source;
  }
  if (body.groupObservation !== undefined) r.groupObservation = body.groupObservation;
  const sources = new Set(
    r.entries
      .filter((e) => e.attendance !== 'not_recorded' || e.score != null)
      .map((e) => e.source),
  );
  r.source = sources.size > 1 ? 'mixed' : sources.has('voice') ? 'voice' : 'tap';
  save();
  return recordDto(r, lang);
}

/** Thrown to make the transport drop the response (T08 "after_commit"). */
export class DropResponse extends Error {}

export function confirmRecord(userId: string, id: string, key: string | null, lang: Lang) {
  const s = load();
  s.counters.confirmCalls++;
  if (!key)
    throw new MockProblem(400, 'idempotency_key_required', 'Idempotency-Key header is required.');
  const done = s.idem[key];
  if (done) {
    save();
    if (done.kind !== 'confirm' || done.id !== id)
      throw new MockProblem(
        422,
        'idempotency_key_reused',
        'This key was used for another request.',
      );
    return recordDto(recordById(id), lang); // replay: same result, nothing new (FUP-REC-07 AC3)
  }
  const r = recordById(id);
  requireTeacher(userId, r.groupId);
  if (s.demo.confirmFault === 'before_commit') {
    s.demo.confirmFault = null;
    save();
    throw new MockProblem(
      503,
      'service_unavailable',
      'The service did not respond. Nothing was saved.',
    );
  }
  if (r.status === 'confirmed')
    throw new MockProblem(409, 'record_confirmed', 'This record is already confirmed.');
  if (s.voice.some((v) => v.recordId === id && v.extraction.status === 'clarification_needed'))
    throw new MockProblem(
      409,
      'identity_unresolved',
      'Confirm which student was meant before saving.',
    );
  validateEntries(
    r.entries.map((e) => ({ studentId: e.studentId, attendance: e.attendance, score: e.score })),
    r.assessment?.maxScore ?? null,
    r.groupId,
  );
  const at = new Date().toISOString();
  r.status = 'confirmed';
  r.confirmedBy = userId;
  r.confirmedAt = at;
  s.idem[key] = { kind: 'confirm', id };
  s.counters.confirmCommits++;
  for (const v of s.voice) if (v.recordId === id) v.extraction.status = 'accepted';
  const sess = sessionsOfGroup(world(), r.groupId).find((x) => x.id === r.sessionId);
  audit(
    'record.confirmed',
    userId,
    {
      en: `Session record confirmed • ${groupName(r.groupId, 'en')} (${fmtDate(r.date, 'en')})`,
      ar: `تم تأكيد سجل الحصة • ${groupName(r.groupId, 'ar')} (${fmtDate(r.date, 'ar')})`,
    },
    at,
    {
      recordId: r.id,
      groupId: r.groupId,
      sessionId: r.sessionId,
      sessionDate: r.date,
      sessionEndsAt: sess?.endsAt ?? null,
      source: r.source,
      draftCreatedAt: r.createdAt,
    },
  );
  // record.confirmed → the followup module evaluates the rules (FUP-RUL-03).
  for (const st of rosterOf(r.groupId)) evaluate(st.id, r.groupId, r.date, at);
  const fault = s.demo.confirmFault;
  if (fault === 'after_commit') s.demo.confirmFault = null;
  save();
  if (fault === 'after_commit') throw new DropResponse();
  return recordDto(r, lang);
}

export function addCorrection(
  userId: string,
  entryId: string,
  body: { field: Correction['field']; newValue: string | null; reason: string },
  lang: Lang,
) {
  const s = load();
  const r = s.records.find((x) => x.entries.some((e) => e.id === entryId));
  if (!r) throw new MockProblem(404, 'not_found', 'Entry not found.');
  requireTeacher(userId, r.groupId);
  if (r.status !== 'confirmed')
    throw new MockProblem(
      409,
      'record_not_confirmed',
      'Edit the draft instead; corrections are for confirmed records.',
    );
  if (!body.reason?.trim())
    throw new MockProblem(422, 'reason_required', 'Give a reason for the correction.');
  const e = r.entries.find((x) => x.id === entryId)!;
  const old =
    body.field === 'score'
      ? e.score == null
        ? null
        : String(e.score)
      : body.field === 'observation'
        ? tx(e.observation, lang)
        : String(e[body.field]);
  if (body.field === 'score') {
    const v = body.newValue == null || body.newValue === '' ? null : Number(body.newValue);
    validateEntries(
      [{ studentId: e.studentId, attendance: e.attendance, score: v }],
      r.assessment?.maxScore ?? null,
      r.groupId,
    );
    e.score = v;
  } else if (body.field === 'attendance') {
    e.attendance = body.newValue as Attendance;
    if (e.attendance === 'absent') e.score = null;
  } else if (body.field === 'participation') e.participation = body.newValue as Participation;
  else e.observation = body.newValue;
  const at = new Date().toISOString();
  const c: Corr = {
    id: nextId('cor'),
    recordId: r.id,
    entryId,
    studentId: e.studentId,
    field: body.field,
    oldValue: old,
    newValue: body.newValue,
    reason: body.reason.trim(),
    authorId: userId,
    at,
  };
  s.corrections.push(c);
  audit(
    'record.corrected',
    userId,
    {
      en: `Correction: ${studentFx(e.studentId)!.name.en} ${body.field} ${old ?? '—'} → ${body.newValue ?? '—'}`,
      ar: `تصحيح: ${studentFx(e.studentId)!.name.ar} ${old ?? '—'} ← ${body.newValue ?? '—'}`,
    },
    at,
    { recordId: r.id, groupId: r.groupId, field: body.field },
  );
  // CF-34: a correction answers any open request from the owner on this record.
  for (const q of s.correctionRequests ?? [])
    if (q.recordId === r.id && q.status === 'open') {
      q.status = 'done';
      q.doneAt = at;
    }
  // record.corrected → re-run the rules for that student (FUP-REC-08 AC3).
  const latest = s.records
    .filter((x) => x.status === 'confirmed' && x.groupId === r.groupId)
    .map((x) => x.date)
    .sort()
    .at(-1)!;
  evaluate(e.studentId, r.groupId, latest, at, { correctionOf: r.id });
  save();
  return correctionDto(c, lang);
}

// ── voice (FUP-VOI) ────────────────────────────────────────────────────────────
/** B3: a note that has no proposal this long after upload is given up ("Type the note instead"). */
export const VOICE_TIMEOUT_MS = 180_000;

/**
 * Real speech-to-text (B3). The pilot server — or the demo mock server with real STT switched on —
 * registers how an uploaded note reaches ai-service. Without a hook the demo fixture is used.
 */
export interface VoiceDispatch {
  voiceId: string;
  recordId: string;
  groupId: string;
  durationS: number;
  roster: { id: string; displayName: string; nicknames: string[] }[];
  assessment: { title: string; maxScore: number } | null;
}
let voiceHook: ((d: VoiceDispatch) => void) | null = null;
/** Pilot: may this teacher record voice notes now (consent signed, voice switched on)? */
let voicePolicy: ((userId: string) => boolean) | null = null;
let voiceUploadPath = (id: string) => `/__mock/uploads/${id}`;
export function configureVoice(opts: {
  dispatch: ((d: VoiceDispatch) => void) | null;
  policy?: ((userId: string) => boolean) | null;
  uploadPath?: (id: string) => string;
}) {
  voiceHook = opts.dispatch;
  voicePolicy = opts.policy ?? null;
  if (opts.uploadPath) voiceUploadPath = opts.uploadPath;
}

export function createVoiceNote(
  userId: string,
  body: { sessionRecordId: string; durationS: number },
  key: string | null,
): VoiceNote {
  const s = load();
  if (key && s.idem[key]?.kind === 'voice')
    return voiceDto(s.voice.find((v) => v.id === s.idem[key]!.id)!);
  if (isPilot() && !(voicePolicy?.(userId) ?? false))
    // No signed consent (OD-52) or voice switched off: the app offers "Type the note instead".
    throw new MockProblem(503, 'stt_unavailable', 'Voice notes are not available yet.');
  const r = recordById(body.sessionRecordId);
  requireTeacher(userId, r.groupId);
  if (r.status === 'confirmed')
    throw new MockProblem(409, 'record_confirmed', 'This record is confirmed.');
  const v: Voice = {
    id: nextId('vn'),
    recordId: r.id,
    durationS: Math.max(1, Math.round(body.durationS || 0)),
    status: 'queued',
    readyAt: null,
    extraction: { id: nextId('vx'), status: 'clarification_needed', resolved: {} },
    teacherId: userId,
  };
  s.voice.push(v);
  if (key) s.idem[key] = { kind: 'voice', id: v.id };
  save();
  return voiceDto(v);
}
const voiceDto = (v: Voice): VoiceNote => ({
  id: v.id,
  sessionRecordId: v.recordId,
  status: v.status,
  durationS: v.durationS,
  uploadUrl: voiceUploadPath(v.id),
});
const voiceById = (id: string) => {
  const v = load().voice.find((x) => x.id === id);
  if (!v) throw new MockProblem(404, 'not_found', 'Voice note not found.');
  return v;
};
export const voiceNote = (id: string) => voiceDto(voiceById(id));
/** The pilot's audio upload route: only the teacher of the record may upload, once, before processing. */
export function assertVoiceUpload(userId: string, id: string) {
  const v = voiceById(id);
  requireTeacher(userId, recordById(v.recordId).groupId);
  if (v.status !== 'queued') throw new MockProblem(409, 'already_uploaded', 'Already uploaded.');
}

function dispatch(v: Voice) {
  const r = recordById(v.recordId);
  v.submittedAt = Date.now();
  v.failure = null;
  v.result = null;
  v.status = 'transcribing';
  voiceHook!({
    voiceId: v.id,
    recordId: v.recordId,
    groupId: r.groupId,
    durationS: v.durationS,
    roster: rosterOf(r.groupId).map((st) => ({
      id: st.id,
      displayName: st.name.ar,
      nicknames: [],
    })),
    assessment: r.assessment
      ? { title: tx(r.assessment.title, 'ar')!, maxScore: r.assessment.maxScore }
      : null,
  });
}

export function voiceUploaded(userId: string, id: string): VoiceNote {
  const v = voiceById(id);
  requireTeacher(userId, recordById(v.recordId).groupId);
  if (v.status === 'queued') {
    if (voiceHook) dispatch(v);
    else {
      v.status = 'transcribing';
      v.readyAt = Date.now() + STT_DELAY_MS;
    }
    audit(
      'voice.uploaded',
      userId,
      { en: 'Voice note uploaded', ar: 'تم رفع ملاحظة صوتية' },
      undefined,
      {
        voiceId: v.id,
        recordId: v.recordId,
        durationS: v.durationS,
      },
    );
  }
  save();
  return voiceDto(v);
}

/** B3 "Try again": hand the kept audio to ai-service again. */
export function retryVoice(userId: string, id: string): VoiceNote {
  const v = voiceById(id);
  requireTeacher(userId, recordById(v.recordId).groupId);
  if (!voiceHook) throw new MockProblem(409, 'not_real_stt', 'Nothing to retry.');
  if (isPilot() && !(voicePolicy?.(userId) ?? false))
    throw new MockProblem(503, 'stt_unavailable', 'Voice notes are not available.');
  if (v.status === 'queued')
    throw new MockProblem(409, 'not_uploaded', 'Upload the recording first.');
  if (v.result) return voiceDto(v);
  dispatch(v);
  save();
  return voiceDto(v);
}

/** ai-service's answer for a note (posted back through the server's internal route). */
export function setVoiceResult(id: string, body: VoiceResultIn) {
  const v = voiceById(id);
  const at = new Date().toISOString();
  // Stopped by the kill switch (4.2): a late answer is never used — the note is not processed.
  if (v.failure?.code === 'voice_paused')
    throw new MockProblem(409, 'voice_paused', 'Voice notes were switched off for this note.');
  if (body.status === 'ready' && body.result) {
    const groupId = recordById(v.recordId).groupId;
    // Never trust ids blindly: only students of this group can be attached or offered.
    const ok = (sid: string | null) => !sid || inGroup(groupId, sid);
    const items = body.result.items
      .filter((it) => ok(it.studentId) && it.candidates.every((c) => inGroup(groupId, c)))
      .map((it) => ({
        ...it,
        suggestions: (it.suggestions ?? []).filter((sid) => inGroup(groupId, sid)),
      }));
    v.result = {
      transcript: body.result.transcript,
      items,
      modelVersion: body.result.modelVersion,
      latencyMs: body.result.latencyMs,
    };
    v.status = 'ready';
    v.failure = null;
    v.extraction = { id: v.extraction.id, status: 'proposed', resolved: {}, discarded: [] };
    refreshExtractionStatus(v);
    audit(
      'voice.processed',
      null,
      { en: 'Voice note processed', ar: 'تمت معالجة ملاحظة صوتية' },
      at,
      {
        voiceId: v.id,
        recordId: v.recordId,
        items: items.length,
        needsIdentity: v.extraction.status === 'clarification_needed',
        modelVersion: body.result.modelVersion,
        sttMs: body.result.latencyMs?.stt ?? null,
        totalMs: body.result.latencyMs?.total ?? null,
      },
    );
  } else {
    v.status = 'failed';
    v.failure = { code: body.code ?? 'stt_failed', at };
    audit(
      'voice.failed',
      null,
      { en: 'Voice note could not be processed', ar: 'تعذّرت معالجة ملاحظة صوتية' },
      at,
      {
        voiceId: v.id,
        code: v.failure.code,
      },
    );
  }
  save();
}

/** null while processing (HTTP 202, with an estimate). */
export function voiceExtraction(userId: string, id: string, lang: Lang): VoiceExtraction | null {
  const s = load();
  const v = voiceById(id);
  requireTeacher(userId, recordById(v.recordId).groupId);
  if (s.demo.sttDown)
    throw new MockProblem(
      503,
      'stt_unavailable',
      'Speech-to-text is not responding. The note stays queued.',
    );
  if (v.status === 'queued')
    throw new MockProblem(409, 'not_uploaded', 'Upload the recording first.');
  if (v.submittedAt != null && !v.result) {
    // Voice switched off for everyone while this note waited: never processed (4.2 kill switch).
    if (v.failure?.code === 'voice_paused')
      throw new MockProblem(
        503,
        'stt_unavailable',
        'Voice notes are switched off. Type the note instead.',
        { reason: 'voice_paused' },
      );
    if (v.failure)
      throw new MockProblem(
        503,
        'stt_failed',
        'This note could not be processed. The audio is kept.',
        {
          reason: v.failure.code,
        },
      );
    if (Date.now() - v.submittedAt > VOICE_TIMEOUT_MS)
      throw new MockProblem(503, 'stt_timeout', 'This note is taking too long. The audio is kept.');
    return null;
  }
  if (v.readyAt && Date.now() < v.readyAt) return null;
  if (v.status !== 'ready') {
    v.status = 'ready';
    save();
  }
  return extractionDto(v, lang);
}
/** For the 202 body: seconds left (estimate) while a real note is processed. */
export function voiceEta(id: string): number | null {
  const v = voiceById(id);
  if (v.submittedAt == null || v.result) return null;
  const est = v.etaSeconds ?? Math.max(10, Math.round(v.durationS * 0.8) + 10);
  return Math.max(3, Math.round(est - (Date.now() - v.submittedAt) / 1000));
}
export function setVoiceEta(id: string, seconds: number) {
  voiceById(id).etaSeconds = seconds;
  save();
}

function bandOf(c: number): VoiceItem['band'] {
  return c >= 0.85 ? 'high' : c >= 0.6 ? 'medium' : 'low'; // OD-36
}
/** The proposal's items: ai-service's for a real note, the fixture otherwise. */
function itemsOf(v: Voice): StoredVoiceItem[] {
  if (v.result) return v.result.items;
  return fx.voiceItems.map((it) => ({
    id: it.id,
    identity: it.identity,
    studentId: it.identity === 'matched' ? it.studentId : null,
    candidates: [...it.candidates],
    mention: it.mention,
    field: it.field,
    value: it.value,
    confidence: it.confidence,
    span: it.span,
    sourceText: fx.voiceTranscript.slice(it.span.start, it.span.end),
    outOfRange:
      it.field === 'score' &&
      typeof it.value === 'number' &&
      it.value > fx.assessments.practice.maxScore,
  }));
}
function extractionDto(v: Voice, lang: Lang): VoiceExtraction {
  const mentioned = new Set<string>();
  const r = recordById(v.recordId);
  const items: VoiceItem[] = itemsOf(v).map((it) => {
    const chosen = v.extraction.resolved[it.id];
    const studentId = it.identity === 'matched' ? it.studentId : (chosen ?? null);
    if (studentId) mentioned.add(studentId);
    return {
      id: it.id,
      identity:
        (it.identity === 'ambiguous' || it.identity === 'unknown') && chosen
          ? 'matched'
          : it.identity,
      student: studentId ? person(studentId, lang) : null,
      candidates: it.candidates.map((c) => person(c, lang)),
      suggestions:
        it.identity === 'unknown' && !chosen
          ? (it.suggestions ?? []).map((c) => person(c, lang))
          : [],
      mention: it.mention,
      field: it.field,
      value: it.value,
      confidence: it.confidence,
      band: it.band ?? bandOf(it.confidence),
      span: it.span,
      sourceText: it.sourceText,
      outOfRange: it.outOfRange,
    };
  });
  return {
    id: v.extraction.id,
    voiceNoteId: v.id,
    status: v.extraction.status,
    transcript: v.result ? v.result.transcript : fx.voiceTranscript,
    audioUrl: null,
    items,
    discardedItemIds: v.extraction.discarded ?? [],
    unmentioned: rosterOf(r.groupId)
      .filter((st) => !mentioned.has(st.id))
      .map((st) => person(st.id, lang)),
    assessment: v.result
      ? r.assessment
        ? { title: tx(r.assessment.title, lang)!, maxScore: r.assessment.maxScore }
        : null
      : {
          title: fx.assessments.practice.title[lang],
          maxScore: fx.assessments.practice.maxScore,
        },
  };
}

export function resolveIdentity(
  userId: string,
  extractionId: string,
  body: { itemId: string; studentId: string },
  lang: Lang,
) {
  const v = load().voice.find((x) => x.extraction.id === extractionId);
  if (!v) throw new MockProblem(404, 'not_found', 'Extraction not found.');
  const groupId = recordById(v.recordId).groupId;
  requireTeacher(userId, groupId);
  const it = itemsOf(v).find((x) => x.id === body.itemId);
  if (!it || (it.identity !== 'ambiguous' && it.identity !== 'unknown'))
    throw new MockProblem(422, 'not_ambiguous', 'This item needs no choice.');
  // Never guess: an ambiguous name takes one of its listed candidates; an unknown one takes a
  // student of this group that the teacher chose (FUP-VOI-04, AI-02).
  const allowed =
    it.identity === 'ambiguous'
      ? it.candidates.includes(body.studentId)
      : inGroup(groupId, body.studentId);
  if (!allowed) throw new MockProblem(422, 'not_a_candidate', 'Pick one of the listed students.');
  v.extraction.resolved[it.id] = body.studentId;
  v.extraction.discarded = (v.extraction.discarded ?? []).filter((x) => x !== it.id);
  refreshExtractionStatus(v);
  save();
  return extractionDto(v, lang);
}

function refreshExtractionStatus(v: Voice) {
  const discarded = v.extraction.discarded ?? [];
  const open = itemsOf(v).some(
    (x) =>
      (x.identity === 'ambiguous' || x.identity === 'unknown') &&
      !v.extraction.resolved[x.id] &&
      !discarded.includes(x.id),
  );
  v.extraction.status = open ? 'clarification_needed' : 'proposed';
}

/** The teacher drops an item: nothing from it is saved, and an unclear name no longer blocks confirm. */
export function discardItem(userId: string, extractionId: string, itemId: string, lang: Lang) {
  const v = load().voice.find((x) => x.extraction.id === extractionId);
  if (!v) throw new MockProblem(404, 'not_found', 'Extraction not found.');
  requireTeacher(userId, recordById(v.recordId).groupId);
  if (!itemsOf(v).some((x) => x.id === itemId))
    throw new MockProblem(404, 'not_found', 'Item not found.');
  v.extraction.discarded = [...new Set([...(v.extraction.discarded ?? []), itemId])];
  delete v.extraction.resolved[itemId];
  refreshExtractionStatus(v);
  save();
  return extractionDto(v, lang);
}

/**
 * Consent withdrawn (teacher consent §6): that teacher's transcripts and proposals are removed;
 * confirmed record values the teacher already reviewed stay (they are the teacher's own record).
 */
/**
 * Kill switch (4.2): every note handed over but not yet processed is never processed. Returns
 * their ids so the caller deletes the audio; the teacher sees "Type the note instead".
 */
export function pauseQueuedVoice(): string[] {
  const at = new Date().toISOString();
  const ids: string[] = [];
  for (const v of load().voice)
    if (v.submittedAt != null && !v.result && !v.failure) {
      v.failure = { code: 'voice_paused', at };
      ids.push(v.id);
    }
  if (ids.length) save(); // the caller records the activity event (who switched it off)
  return ids;
}

export function forgetVoiceOf(teacherId: string): string[] {
  const ids: string[] = [];
  for (const v of load().voice)
    if (v.teacherId === teacherId) {
      v.result = v.result ? { ...v.result, transcript: '', items: [] } : v.result;
      ids.push(v.id);
    }
  save();
  return ids;
}
/** Voice notes for the retention job: id, teacher and when the audio was handed over. */
export const voiceNotesForRetention = () =>
  load().voice.map((v) => ({ id: v.id, teacherId: v.teacherId ?? null, status: v.status }));

// ── cases (FUP-CAS) ────────────────────────────────────────────────────────────
function requireStaff(userId: string) {
  if (!isCentreStaff(userId)) throw new MockProblem(403, 'forbidden', 'Centre staff only.');
}
const caseById = (id: string) => {
  const c = load().cases.find((x) => x.id === id);
  if (!c) throw new MockProblem(404, 'not_found', 'Follow-up not found.');
  return c;
};
export function listCases(userId: string, lang: Lang) {
  requireStaff(userId);
  return load().cases.map((c) => caseDto(c, lang));
}
export function getCase(userId: string, id: string, lang: Lang) {
  requireStaff(userId);
  return caseDto(caseById(id), lang);
}
export function addAttempt(
  userId: string,
  id: string,
  body: {
    channel: CaseAttempt['channel'];
    result: CaseAttempt['result'];
    learned?: string | null;
    nextAction?: string | null;
    followUpOn?: string | null;
    keepOpen?: boolean;
  },
  lang: Lang,
) {
  requireStaff(userId);
  const c = caseById(id);
  if (c.status === 'dismissed' || c.status === 'resolved')
    throw new MockProblem(409, 'case_closed', 'Reopen the follow-up first.');
  if (!body.channel || !body.result)
    throw new MockProblem(422, 'validation_failed', 'Contact method and result are required.');
  const at = new Date().toISOString();
  c.attempts.push({
    id: nextId('att'),
    channel: body.channel,
    result: body.result,
    learned: body.learned ?? null,
    nextAction: body.nextAction ?? null,
    followUpOn: body.followUpOn ?? null,
    messageId: null,
    createdBy: userId,
    at,
  });
  // BR-APR-10: an attempt is not a resolution. Default keeps the case open until confirmed.
  c.status = body.keepOpen === false ? 'resolved' : 'awaiting_confirmation';
  c.timeline.push({
    at,
    kind: 'outcome',
    text: { en: 'Contact recorded. Next step set.', ar: 'تم تسجيل التواصل وتحديد الخطوة التالية.' },
    actorId: userId,
  });
  audit(
    'case.outcome',
    userId,
    { en: 'Outcome recorded on a follow-up', ar: 'تم تسجيل نتيجة متابعة' },
    at,
    { caseId: c.id, channel: body.channel, result: body.result, status: c.status },
  );
  save();
  return caseDto(c, lang);
}
export function dismissCase(userId: string, id: string, reason: string, lang: Lang) {
  requireStaff(userId);
  if (!reason?.trim()) throw new MockProblem(422, 'reason_required', 'Give a reason to dismiss.');
  const c = caseById(id);
  const at = new Date().toISOString();
  c.status = 'dismissed';
  c.dismissReason = reason.trim();
  load().signals.find((x) => x.id === c.signalId)!.status = 'dismissed';
  c.timeline.push({ at, kind: 'dismissed', text: reason.trim(), actorId: userId });
  audit(
    'case.dismissed',
    userId,
    {
      en: `Follow-up dismissed: "${reason.trim()}" — stays in history, can be reopened`,
      ar: `تم إغلاق المتابعة: "${reason.trim()}" — تبقى في السجل ويمكن إعادة فتحها`,
    },
    at,
    // The reason is staff free text about a pseudonymised student; metrics list it as written.
    { caseId: c.id, reason: reason.trim() },
  );
  save();
  return caseDto(c, lang);
}
export function reopenCase(userId: string, id: string, lang: Lang) {
  requireStaff(userId);
  const c = caseById(id);
  c.status = 'open';
  c.dismissReason = null;
  load().signals.find((x) => x.id === c.signalId)!.status = 'case_opened';
  c.timeline.push({
    at: new Date().toISOString(),
    kind: 'reopened',
    text: { en: 'Reopened', ar: 'أعيد فتحها' },
    actorId: userId,
  });
  audit('case.reopened', userId, { en: 'Follow-up reopened', ar: 'أعيد فتح متابعة' }, undefined, {
    caseId: c.id,
  });
  save();
  return caseDto(c, lang);
}

// ── messages (FUP-MSG) ─────────────────────────────────────────────────────────
/**
 * Deterministic Egyptian Arabic drafts built only from confirmed facts (FUP-MSG-01). No LLM: the
 * text says who, which group and which dates, nothing else. Staff edit and approve it.
 */
function draftText(sig: Sig, tone: ParentMessage['tone']) {
  const st = studentFx(sig.studentId)!;
  const w = world();
  const n = sig.n ?? 2;
  const first = st.name.ar.split(' ')[0];
  const dates = sig.evidence
    .map((id) => recordById(id).date)
    .sort()
    .slice(-n)
    .map((d) => fmtDate(d, 'ar'))
    .join(' و');
  const centre = w.centre.name.ar;
  if (w.kind === 'pilot') {
    // Pilot: guardian labels are not names, the student's gender is unknown → neutral wording.
    const group = groupName(sig.groupId, 'ar');
    if (tone === 'formal')
      return `السلام عليكم، معكم ${centre}. نود إبلاغكم بتسجيل غياب ${first} عن ${lastWords(n)} في مجموعة ${group} (${dates}). يسعدنا التواصل معكم إن كان هناك ما يمكننا المساعدة فيه.`;
    if (tone === 'neutral')
      return `أهلاً بحضرتك، معاك ${centre}. سجّلنا غياب ${first} عن ${lastWords(n)} في مجموعة ${group} (${dates}). لو في حاجة نقدر نساعد فيها، بلّغنا.`;
    return `أهلاً بحضرتك، معاك ${centre} 😊 حبينا نطمّن على ${first}: سجل الحضور عندنا فيه غياب ${lastWords(n)} في مجموعة ${group} (${dates}). لو في أي ظرف أو حاجة نقدر نساعد فيها، ياريت تقولنا. شكرًا!`;
  }
  const gd = guardianFx(st.guardianId);
  const subject = groupOf(sig.groupId)?.subject?.ar ?? groupName(sig.groupId, 'ar');
  const gFirst = gd.phone && !gd.generic ? gd.name.ar.split(' ')[0] : null;
  const verb = st.gender === 'f' ? 'غابت' : 'غاب';
  const hi = gFirst ? `أهلاً أستاذ ${gFirst}` : 'أهلاً بحضرتك';
  if (tone === 'formal')
    return `${hi}، معكم ${centre}. نود إبلاغكم بأن ${first} ${verb} عن حصتي ال${subject} يومي ${dates}. يسعدنا التواصل معكم إن كان هناك ما يمكننا المساعدة فيه.`;
  if (tone === 'neutral')
    return `${hi}، معاك ${centre}. ${first} ${verb} عن ${lastWords(n)} ${subject} (${dates}). لو في حاجة نقدر نساعد فيها، بلّغنا.`;
  return `${hi}، معاك ${centre} 😊 حبينا نطمّن على ${first}؛ ${verb} عن ${lastWords(n)} ${subject} (${dates}). لو في أي ظرف أو حاجة نقدر نساعد فيها، ياريت تقولنا. شكرًا!`;
}
const msgById = (id: string) => {
  const m = load().messages.find((x) => x.id === id);
  if (!m) throw new MockProblem(404, 'not_found', 'Message not found.');
  return m;
};
export function createDraft(
  userId: string,
  body: { caseId: string; tone?: ParentMessage['tone'] },
  lang: Lang,
) {
  requireStaff(userId);
  const c = caseById(body.caseId);
  const sig = load().signals.find((x) => x.id === c.signalId)!;
  const tone = body.tone ?? 'warm';
  const m: Msg = {
    id: nextId('msg'),
    caseId: c.id,
    studentId: c.studentId,
    guardianId: studentFx(c.studentId)!.guardianId,
    draft: draftText(sig, tone),
    finalText: null,
    tone,
    status: 'draft',
    channel: null,
    approvedBy: null,
    approvedAt: null,
    failureReason: null,
    replies: [],
    history: [{ status: 'draft', at: new Date().toISOString() }],
  };
  load().messages.push(m);
  c.messageIds.push(m.id);
  c.timeline.push({
    at: new Date().toISOString(),
    kind: 'message_drafted',
    text: { en: 'Parent message drafted (not sent)', ar: 'تمت صياغة رسالة لوليّ الأمر (لم تُرسل)' },
    actorId: userId,
  });
  audit(
    'message.drafted',
    userId,
    {
      en: `Parent message drafted for ${studentFx(c.studentId)!.name.en} (not sent)`,
      ar: `صياغة رسالة لوليّ أمر ${studentFx(c.studentId)!.name.ar} (لم تُرسل)`,
    },
    undefined,
    { caseId: c.id, messageId: m.id },
  );
  save();
  return messageDto(m, lang);
}
export function getMessage(userId: string, id: string, lang: Lang) {
  requireStaff(userId);
  return messageDto(msgById(id), lang);
}
export function listMessages(userId: string, lang: Lang) {
  requireStaff(userId);
  return load().messages.map((m) => messageDto(m, lang));
}
export function editMessage(
  userId: string,
  id: string,
  body: { text?: string; tone?: ParentMessage['tone'] },
  lang: Lang,
) {
  requireStaff(userId);
  const m = msgById(id);
  // FUP-MSG-02 AC3: an approved message is locked.
  if (m.status !== 'draft')
    throw new MockProblem(
      409,
      'message_locked',
      'An approved message is locked. Start a new draft to change it.',
    );
  if (body.tone && body.tone !== m.tone) {
    const c = caseById(m.caseId!);
    m.tone = body.tone;
    m.draft = draftText(
      load().signals.find((x) => x.id === c.signalId)!,
      body.tone,
    );
  }
  if (body.text !== undefined) m.draft = body.text;
  save();
  return messageDto(m, lang);
}
export function approveMessage(
  userId: string,
  id: string,
  body: { checked?: boolean; channel?: 'whatsapp' | 'sms' },
  lang: Lang,
) {
  if (!canApprove(userId))
    throw new MockProblem(403, 'forbidden', 'You need the messages.approve permission.');
  const m = msgById(id);
  if (m.status !== 'draft') throw new MockProblem(409, 'message_locked', 'Already approved.');
  if (body.checked !== true)
    throw new MockProblem(
      422,
      'check_required',
      'Tick "I checked the student, guardian and dates".',
    );
  const g = guardianDto(m.guardianId, 'en');
  const at = new Date().toISOString();
  m.finalText = m.draft;
  m.approvedBy = userId;
  m.approvedAt = at;
  m.history.push({ status: 'approved', at });
  if (isPilot()) {
    // A6: Link sends nothing in the pilot. The message stays "approved" until staff send it from the
    // centre's own WhatsApp; it never shows Delivered or Read (no provider receipt, BR-APR-11).
    m.status = 'approved';
    const c = m.caseId ? caseById(m.caseId) : null;
    if (c) {
      if (c.status === 'open') c.status = 'in_progress';
      c.timeline.push({
        at,
        kind: 'message_approved',
        text: {
          en: "Message approved — send it from the centre's WhatsApp",
          ar: 'تم اعتماد الرسالة — أرسلها من واتساب المركز',
        },
        actorId: userId,
      });
    }
    audit(
      'message.approved',
      userId,
      { en: 'Parent message approved', ar: 'تم اعتماد رسالة لوليّ الأمر' },
      at,
      { caseId: m.caseId, messageId: m.id },
    );
    save();
    return messageDto(m, lang);
  }
  // FUP-MSG-03 AC2 + FUP-MSG-07: WhatsApp only with opt-in and no STOP; SMS only with SMS consent.
  const channel =
    body.channel === 'sms'
      ? g.smsConsent && !g.stopped
        ? 'sms'
        : null
      : g.whatsappOptIn && !g.stopped
        ? 'whatsapp'
        : null;
  if (!channel) {
    m.status = 'not_sendable';
    m.history.push({ status: 'not_sendable', at });
  } else {
    m.channel = channel;
    m.status = 'queued';
    m.history.push({ status: 'queued', at });
    const c = m.caseId ? caseById(m.caseId) : null;
    if (c) {
      // FUP-MSG-03 AC4: sending logs an attempt; the case stays open ("Sending is not solving").
      c.attempts.push({
        id: nextId('att'),
        channel,
        result: 'message_sent',
        learned: null,
        nextAction: null,
        followUpOn: null,
        messageId: m.id,
        createdBy: userId,
        at,
      });
      if (c.status === 'open') c.status = 'in_progress';
      c.timeline.push({
        at,
        kind: 'message_approved',
        text: {
          en: 'Message approved and queued',
          ar: 'تم اعتماد الرسالة ووضعها في قائمة الإرسال',
        },
        actorId: userId,
      });
    }
  }
  audit(
    'message.approved',
    userId,
    { en: 'Parent message approved', ar: 'تم اعتماد رسالة لوليّ الأمر' },
    at,
    { caseId: m.caseId, messageId: m.id },
  );
  save();
  return messageDto(m, lang);
}

/**
 * Pilot (A6): staff copied the approved text and sent it from the centre's own WhatsApp. That is a
 * contact attempt (`whatsapp_manual`) by this person at this time — not a delivery: the status stays
 * "approved" and never becomes Delivered or Read. The case stays open until an outcome is recorded.
 */
export function markSentManually(userId: string, id: string, lang: Lang) {
  requireStaff(userId);
  if (!isPilot())
    throw new MockProblem(409, 'not_pilot', 'Messages are sent by the provider outside the pilot.');
  const m = msgById(id);
  if (m.status !== 'approved')
    throw new MockProblem(409, 'not_approved', 'Approve the message before sending it.');
  if (m.manualSends?.length)
    throw new MockProblem(
      409,
      'already_sent',
      'Already marked as sent. Start a new draft to send again.',
    );
  const at = new Date().toISOString();
  m.manualSends = [{ by: userId, at }];
  const c = m.caseId ? caseById(m.caseId) : null;
  if (c) {
    c.attempts.push({
      id: nextId('att'),
      channel: 'whatsapp_manual',
      result: 'message_sent',
      learned: null,
      nextAction: null,
      followUpOn: null,
      messageId: m.id,
      createdBy: userId,
      at,
    });
    if (c.status === 'open') c.status = 'in_progress';
    c.timeline.push({
      at,
      kind: 'message_sent_manually',
      text: {
        en: "Sent from the centre's WhatsApp (by hand)",
        ar: 'أُرسلت من واتساب المركز (يدويًا)',
      },
      actorId: userId,
    });
  }
  audit(
    'message.sent_manually',
    userId,
    {
      en: "Parent message sent by hand from the centre's WhatsApp",
      ar: 'أُرسلت رسالة لوليّ الأمر يدويًا من واتساب المركز',
    },
    at,
    { caseId: m.caseId, messageId: m.id, channel: 'whatsapp_manual' },
  );
  save();
  return messageDto(m, lang);
}

// ── CF-34: teachers correct, the owner asks ─────────────────────────────────────
function correctionRequestDto(q: CorrectionRequestRow, lang: Lang) {
  const r = recordById(q.recordId);
  return {
    id: q.id,
    recordId: q.recordId,
    groupId: q.groupId,
    groupName: groupName(q.groupId, lang),
    sessionDate: r.date,
    student: q.studentId ? person(q.studentId, lang) : null,
    text: q.text,
    requestedBy: person(q.requestedBy, lang),
    at: q.at,
    status: q.status,
  };
}
/** A14 "Ask the teacher to correct": a note to the teacher, never a change to the record. */
export function requestCorrection(
  userId: string,
  recordId: string,
  body: { studentId?: string | null; text: string },
  lang: Lang,
) {
  if (roleOf(userId) !== 'owner')
    throw new MockProblem(403, 'forbidden', 'Only the owner asks for corrections.');
  const r = recordById(recordId);
  if (r.status !== 'confirmed')
    throw new MockProblem(409, 'record_not_confirmed', 'Only confirmed records are corrected.');
  const text = (body.text ?? '').trim();
  if (!text) throw new MockProblem(422, 'validation_failed', 'Say what should be corrected.');
  if ([...text].length > 500)
    throw new MockProblem(422, 'too_long', 'Up to 500 characters.', { max: 500 });
  if (body.studentId && !inGroup(r.groupId, body.studentId))
    throw new MockProblem(422, 'unknown_student', 'A student is not on this roster.');
  const s = load();
  const q: CorrectionRequestRow = {
    id: nextId('crq'),
    recordId,
    groupId: r.groupId,
    studentId: body.studentId ?? null,
    text,
    requestedBy: userId,
    at: new Date().toISOString(),
    status: 'open',
    doneAt: null,
  };
  (s.correctionRequests ??= []).push(q);
  audit(
    'record.correction_requested',
    userId,
    {
      en: `Correction requested from the teacher • ${groupName(r.groupId, 'en')} (${fmtDate(r.date, 'en')})`,
      ar: `طُلب تصحيح من المعلّم • ${groupName(r.groupId, 'ar')} (${fmtDate(r.date, 'ar')})`,
    },
    q.at,
    { recordId, groupId: r.groupId },
  );
  save();
  return correctionRequestDto(q, lang);
}
/** The teacher closes a request without a correction (e.g. the record was right). */
export function closeCorrectionRequest(userId: string, id: string, lang: Lang) {
  const q = (load().correctionRequests ?? []).find((x) => x.id === id);
  if (!q) throw new MockProblem(404, 'not_found', 'Request not found.');
  requireTeacher(userId, q.groupId);
  q.status = 'done';
  q.doneAt = new Date().toISOString();
  audit('record.correction_request_closed', userId, {
    en: 'Correction request marked done by the teacher',
    ar: 'أنهى المعلّم طلب التصحيح',
  });
  save();
  return correctionRequestDto(q, lang);
}

// ── demo controls (dev only) ───────────────────────────────────────────────────
export const demoState = () => load().demo;
/** The mock server persists the presenter's switches (flags) across restarts (Node only). */
let demoListener: ((d: DemoState) => void) | null = null;
export const onDemoChange = (fn: (d: DemoState) => void) => {
  demoListener = fn;
};
/**
 * Demo / e2e only: give the latest voice note an ai-service-shaped result, through the same
 * `setVoiceResult` the real callback uses (group checks included). Lets the suites show cases the
 * fixture has none of — e.g. a misheard name with suggestions — without running Whisper.
 */
export function demoVoiceResult(result: NonNullable<VoiceResultIn['result']>) {
  const v = load().voice.at(-1);
  if (!v) throw new MockProblem(409, 'no_voice_note', 'Record a voice note first.');
  setVoiceResult(v.id, { status: 'ready', result });
  return { voiceId: v.id, items: v.result?.items.length ?? 0 };
}

export function setDemo(patch: Partial<DemoState>) {
  Object.assign(load().demo, patch);
  save();
  demoListener?.(load().demo);
  return load().demo;
}

/**
 * "Simulate a new day": a day passes for the follow-ups — every open case's due date moves one day
 * into the past, so a case due today becomes overdue (FUP-CAS-05) and A01 can show it.
 */
export function simulateNewDay() {
  const s = load();
  for (const c of s.cases)
    if (c.status !== 'resolved' && c.status !== 'dismissed') c.dueOn = addDays(c.dueOn, -1);
  s.demo.dayOffset += 1;
  audit('demo.new_day', null, {
    en: 'Demo: a new day (due dates moved one day back)',
    ar: 'عرض تجريبي: يوم جديد (تواريخ الاستحقاق رجعت يومًا)',
  });
  save();
  demoListener?.(s.demo);
  return {
    dayOffset: s.demo.dayOffset,
    overdue: s.cases.filter(
      (c) =>
        !['resolved', 'dismissed'].includes(c.status) &&
        c.dueOn < cairoToday() &&
        c.attempts.length === 0,
    ).length,
  };
}

const ST_AR: Partial<Record<DeliveryStatus, string>> = {
  queued: 'في قائمة الإرسال',
  sent: 'أُرسلت',
  delivered: 'وصلت',
  read: 'قُرئت',
  failed: 'فشل الإرسال',
};
/** Mock provider event: Queued → Sent → Delivered, or → Failed (BR-APR-11). */
export function providerEvent(outcome: 'advance' | 'fail', messageId?: string) {
  const s = load();
  const m = messageId
    ? msgById(messageId)
    : [...s.messages].reverse().find((x) => x.status === 'queued' || x.status === 'sent');
  if (!m) throw new MockProblem(409, 'nothing_in_flight', 'No queued or sent message.');
  const at = new Date().toISOString();
  if (outcome === 'fail') {
    if (!['queued', 'sent'].includes(m.status))
      throw new MockProblem(409, 'not_in_flight', 'This message is not in flight.');
    m.status = 'failed';
    m.failureReason = 'Provider reported: not delivered (sample)';
  } else if (m.status === 'queued') m.status = 'sent';
  else if (m.status === 'sent') m.status = 'delivered';
  else throw new MockProblem(409, 'not_in_flight', 'This message is not in flight.');
  m.history.push({ status: m.status, at });
  audit(
    'message.status',
    null,
    {
      en: `Provider reported: ${m.status} (${studentFx(m.studentId)!.name.en})`,
      ar: `أبلغ المزوّد: ${ST_AR[m.status] ?? m.status} (${studentFx(m.studentId)!.name.ar})`,
    },
    at,
  );
  save();
  return { id: m.id, status: m.status };
}

/** Mock inbound webhook: a parent reply, linked to the case (FUP-MSG-05). STOP takes effect at once. */
export function inboundReply(body?: string, messageId?: string) {
  const s = load();
  const m = messageId
    ? msgById(messageId)
    : [...s.messages].reverse().find((x) => ['sent', 'delivered', 'read'].includes(x.status));
  if (!m)
    throw new MockProblem(409, 'nothing_delivered', 'No sent or delivered message to reply to.');
  const text = body ?? fx.demoReply.body;
  const at = new Date().toISOString();
  m.replies.push({ id: nextId('in'), body: text, receivedAt: at });
  if (/^\s*(stop|إيقاف)\s*$/i.test(text)) s.guardians[m.guardianId]!.stopped = true; // BR-DAT-02
  const c = m.caseId ? s.cases.find((x) => x.id === m.caseId) : null;
  c?.timeline.push({
    at,
    kind: 'parent_replied',
    text: { en: 'Parent replied', ar: 'ردّ وليّ الأمر' },
    actorId: null,
  });
  audit('message.reply_received', null, {
    en: 'Parent reply received',
    ar: 'وصل ردّ من وليّ الأمر',
  });
  save();
  return { messageId: m.id, caseId: m.caseId };
}

/** Everything the presenter (and tests) need to prove what happened. */
export function demoSnapshot(lang: Lang = 'en') {
  const s = load();
  return {
    demo: s.demo,
    counters: s.counters,
    records: {
      confirmed: s.records.filter((r) => r.status === 'confirmed').length,
      drafts: s.records.filter((r) => r.status === 'draft').map((r) => r.id),
    },
    signals: s.signals.map((x) => ({
      id: x.id,
      rule: x.rule,
      ruleVersion: x.ruleVersion,
      student: person(x.studentId, lang).displayName,
      status: x.status,
      caseId: x.caseId,
      explanation: explanation(x, lang),
      evidence: x.evidence.map((id) => ({ recordId: id, sessionDate: recordById(id).date })),
    })),
    cases: s.cases.map((c) => ({
      id: c.id,
      student: person(c.studentId, lang).displayName,
      assignee: person(c.assigneeId, lang).displayName,
      status: c.status,
      dueOn: c.dueOn,
    })),
    messages: s.messages.map((m) => ({
      id: m.id,
      student: person(m.studentId, lang).displayName,
      status: m.status,
      channel: m.channel,
      replies: m.replies.length,
    })),
  };
}

/** Owner-side guardian status for a student (A13). */
export function guardianOf(studentId: string, lang: Lang) {
  const st = studentFx(studentId);
  return st ? guardianDto(st.guardianId, lang) : null;
}

export { RULE_TEXT, MockProblem };

// ── owner web (Batch 6) ────────────────────────────────────────────────────────
const isOwner = (userId: string) => roleOf(userId) === 'owner';
const teacherOf = (groupId: string, lang: Lang) =>
  person(groupOf(groupId)?.teacherUserId ?? '', lang);
/** Sessions that took place, across every follow-up group, oldest first. */
const allPastSessions = () =>
  world()
    .groups.flatMap((g) => pastSessions(g.id))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
const OPEN_CASE = (c: CaseRow) => c.status !== 'resolved' && c.status !== 'dismissed';
const isOverdue = (c: CaseRow) => OPEN_CASE(c) && c.dueOn < cairoToday() && c.attempts.length === 0;

/** A01 Today (FUP-DSH-01). "Eligible" = sessions that took place in the last 2 weeks. */
export function ownerToday(userId: string, lang: Lang): OwnerToday {
  requireStaff(userId);
  const s = load();
  const today = cairoToday();
  const eligible = allPastSessions().filter((p) => p.date >= addDays(today, -14));
  const confirmed = eligible.filter((p) => recordFor(p.id)?.status === 'confirmed').length;
  const open = s.cases.filter(OPEN_CASE);
  const overdue = open.filter(isOverdue);
  const owners = [...new Set(overdue.map((c) => c.assigneeId))].map((id) => person(id, lang));
  return {
    date: today,
    dueToday: open.filter((c) => c.dueOn <= today).length,
    overdue: { count: overdue.length, owners },
    missingRecords: { missing: eligible.length - confirmed, eligible: eligible.length },
    recordsComplete: { confirmed, eligible: eligible.length },
    followUpToday: open
      .filter((c) => c.dueOn <= today || c.status === 'open')
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
      .map((c) => caseDto(c, lang)),
    keepComplete: eligible
      .filter((p) => recordFor(p.id)?.status !== 'confirmed')
      .reverse()
      .map((p) => ({
        groupId: p.groupId,
        groupName: groupName(p.groupId, lang),
        teacher: teacherOf(p.groupId, lang),
        sessionDate: p.date,
        startsAt: p.startsAt,
        status: recordFor(p.id) ? ('draft' as const) : ('missing' as const),
      })),
  };
}

/** A13 Students (FUP-DSH-02). */
export function centreStudents(userId: string, lang: Lang): CentreStudentRow[] {
  requireStaff(userId);
  const s = load();
  const w = world();
  // One row per student per follow-up group.
  return w.members.map(({ groupId, studentId }) => {
    const c = [...s.cases]
      .reverse()
      .find(
        (x) =>
          x.studentId === studentId &&
          OPEN_CASE(x) &&
          s.signals.find((g) => g.id === x.signalId)?.groupId === groupId,
      );
    const notes = notesOf(studentId, lang);
    const g = guardianFx(studentFx(studentId)!.guardianId);
    const latest = latestScore(studentId, lang);
    return {
      student: person(studentId, lang),
      group: { id: groupId, name: groupName(groupId, lang) },
      lastSessions: lastFour(studentId, groupId),
      latestScore: latest ? { score: latest.score, maxScore: latest.maxScore } : null,
      followUp: c ? { caseId: c.id, status: c.status, overdue: isOverdue(c) } : null,
      latestNote: notes[0]
        ? { body: notes[0].body, author: notes[0].author, at: notes[0].at }
        : null,
      // Pilot: the centre keeps the phone numbers; Link only has the guardian's label.
      guardian:
        w.kind === 'pilot'
          ? { status: 'kept_by_centre' as const, name: tx(g.name, lang)! }
          : g.phone
            ? { status: 'verified' as const, name: g.generic ? null : tx(g.name, lang)! }
            : { status: 'missing_phone' as const, name: tx(g.name, lang)! },
    };
  });
}

/** A05 Sessions (FUP-REC-12 AC1): the last 2 weeks of the follow-up groups. */
export function centreSessions(userId: string, lang: Lang): CentreSessionRow[] {
  requireStaff(userId);
  const today = cairoToday();
  return allPastSessions()
    .filter((p) => p.date >= addDays(today, -14))
    .reverse()
    .map((p) => {
      const r = recordFor(p.id);
      const c = { present: 0, absent: 0, late: 0, notRecorded: 0 };
      if (r)
        for (const e of r.entries)
          if (e.attendance === 'not_recorded') c.notRecorded++;
          else c[e.attendance]++;
      return {
        groupId: p.groupId,
        groupName: groupName(p.groupId, lang),
        teacher: teacherOf(p.groupId, lang),
        sessionDate: p.date,
        startsAt: p.startsAt,
        recordId: r?.id ?? null,
        status: !r ? 'not_started' : r.status === 'confirmed' ? 'confirmed' : 'draft',
        attendance: r ? c : null,
      };
    });
}

// ── rules (A07, FUP-RUL-01/02) ─────────────────────────────────────────────────
const RULE_COPY: Record<
  RuleRow['code'],
  { text: (p: Record<string, number>, lang: Lang) => string; example: mfx.L }
> = {
  consecutive_absences: {
    text: (p, l) =>
      l === 'ar'
        ? `يُرفع تنبيه عندما يغيب الطالب عن آخر ${p.n} حصص مجدولة، ولكل منها سجل مؤكَّد. الحصة "غير المسجّلة" تقطع التتابع.`
        : `Flag when a student is absent from the last ${p.n} scheduled sessions, each with a confirmed record. A "Not recorded" session breaks the streak.`,
    example: {
      en: 'Absent from two consecutive scheduled sessions: 24 and 28 September.',
      ar: 'غاب عن حصتين مجدولتين متتاليتين: ٢٤ و٢٨ سبتمبر.',
    },
  },
  score_decline: {
    text: (p, l) =>
      l === 'ar'
        ? `يُرفع تنبيه عندما تكون آخر ${p.k} درجات قابلة للمقارنة أقل من متوسط الطالب السابق بـ${p.drop} نقطة (٪) أو أكثر، في السلسلة نفسها، مع ${p.minScores} درجات على الأقل.`
        : `Flag when the last ${p.k} comparable scores are each ${p.drop} points (%) or more below the student's own earlier average in the same assessment series, with at least ${p.minScores} scores.`,
    example: {
      en: 'Sign rules practice: 60% and 55% after an average of 75%.',
      ar: 'تدريب قواعد الإشارات: ٦٠٪ و٥٥٪ بعد متوسط ٧٥٪.',
    },
  },
  low_participation: {
    text: (p, l) =>
      l === 'ar'
        ? `يُرفع تنبيه عندما تكون المشاركة "منخفضة" في ${p.k} من آخر ${p.m} حصص مؤكَّدة.`
        : `Flag when participation was "low" in ${p.k} of the last ${p.m} confirmed sessions.`,
    example: {
      en: 'Low participation on 21 and 28 September.',
      ar: 'مشاركة منخفضة يومي ٢١ و٢٨ سبتمبر.',
    },
  },
  repeated_concern: {
    text: (p, l) =>
      l === 'ar'
        ? `يُرفع تنبيه عندما يتكرر موضوع الملاحظة نفسه (الفهم، يحتاج مراجعة، السلوك) ${p.count} مرات خلال ${p.windowDays} يومًا.`
        : `Flag when the same note topic (understanding, needs revisit, behaviour) is recorded ${p.count} times in ${p.windowDays} days.`,
    example: {
      en: '"Needs revisit" noted three times since 10 September.',
      ar: '"يحتاج مراجعة" تكرر ثلاث مرات منذ ١٠ سبتمبر.',
    },
  },
};

function ruleView(r: RuleRow, lang: Lang): RuleView {
  const copy = RULE_COPY[r.code];
  return {
    code: r.code,
    active: r.active,
    params: r.params,
    scope: r.scope,
    version: r.version,
    text: copy.text(r.params, lang),
    example: copy.example[lang],
    proposal: r.proposal
      ? { ...r.proposal, proposedBy: person(r.proposal.proposedBy, lang) }
      : null,
    history: r.history.map((h) => ({
      version: h.version,
      approvedBy: h.approvedBy ? person(h.approvedBy, lang) : null,
      at: h.at,
    })),
  };
}
const ruleByCode = (code: string) => {
  const r = load().rules.find((x) => x.code === code);
  if (!r) throw new MockProblem(404, 'not_found', 'Rule not found.');
  return r;
};
export function listRules(userId: string, lang: Lang) {
  requireStaff(userId);
  return load().rules.map((r) => ruleView(r, lang));
}
const RULE_PARAMS: Record<RuleRow['code'], string[]> = {
  consecutive_absences: ['n'],
  score_decline: ['k', 'drop', 'minScores'],
  low_participation: ['k', 'm'],
  repeated_concern: ['count', 'windowDays'],
};
function validateRule(code: RuleRow['code'], b: RuleChangeBody) {
  for (const k of RULE_PARAMS[code]) {
    const v = b.params?.[k];
    if (!Number.isInteger(v) || (v as number) < 1)
      throw new MockProblem(
        422,
        'validation_failed',
        `"${k}" must be a whole number of 1 or more.`,
        { field: k },
      );
  }
  if (b.scope !== 'all' && !groupOf(b.scope))
    throw new MockProblem(422, 'validation_failed', 'Unknown group.');
}
function applyRule(r: RuleRow, b: RuleChangeBody, approvedBy: string) {
  r.version += 1;
  r.active = b.active;
  r.params = { ...b.params };
  r.scope = b.scope;
  r.history.push({
    version: r.version,
    active: b.active,
    params: { ...b.params },
    scope: b.scope,
    approvedBy,
    at: new Date().toISOString(),
  });
  r.proposal = null;
}
/** FUP-RUL-02: the owner's change applies as a new version; a staff change is a proposal. */
export function changeRule(userId: string, code: string, b: RuleChangeBody, lang: Lang) {
  requireStaff(userId);
  const r = ruleByCode(code);
  validateRule(r.code, b);
  if (isOwner(userId)) {
    applyRule(r, b, userId);
    audit(
      'rule.changed',
      userId,
      {
        en: `Rule "${r.code}" changed — version ${r.version}`,
        ar: `تم تعديل القاعدة "${r.code}" — الإصدار ${r.version}`,
      },
      undefined,
      { rule: r.code, version: r.version },
    );
  } else {
    r.proposal = {
      ...b,
      params: { ...b.params },
      proposedBy: userId,
      at: new Date().toISOString(),
    };
    audit('rule.proposed', userId, {
      en: `Rule change proposed for "${r.code}" (needs the owner)`,
      ar: `اقتراح تعديل القاعدة "${r.code}" (يحتاج موافقة المالك)`,
    });
  }
  save();
  return ruleView(r, lang);
}
export function approveRule(userId: string, code: string, lang: Lang) {
  if (!isOwner(userId))
    throw new MockProblem(403, 'forbidden', 'Only the owner approves rule changes.');
  const r = ruleByCode(code);
  if (!r.proposal) throw new MockProblem(409, 'no_proposal', 'Nothing to approve.');
  applyRule(r, r.proposal, userId);
  audit('rule.approved', userId, {
    en: `Rule change approved for "${r.code}" — version ${r.version}`,
    ar: `تمت الموافقة على تعديل "${r.code}" — الإصدار ${r.version}`,
  });
  save();
  return ruleView(r, lang);
}
export function rejectRule(userId: string, code: string, lang: Lang) {
  if (!isOwner(userId))
    throw new MockProblem(403, 'forbidden', 'Only the owner decides on rule changes.');
  const r = ruleByCode(code);
  r.proposal = null;
  save();
  return ruleView(r, lang);
}

// ── staff (A16, FUP-STF-01) ────────────────────────────────────────────────────
export function staffList(userId: string, lang: Lang): StaffMember[] {
  requireStaff(userId);
  const ar = lang === 'ar';
  const scope = (u: WorldUser) =>
    u.role === 'owner'
      ? ar
        ? 'كل المجموعات'
        : 'All groups'
      : u.role === 'reception'
        ? ar
          ? 'كل الطلاب • المتابعات'
          : 'All students • Follow-ups'
        : groupsOfTeacher(u.id).length
          ? groupsOfTeacher(u.id)
              .map((g) => tx(g.name, lang))
              .join(ar ? '، ' : ', ')
          : ar
            ? 'مجموعاته فقط'
            : 'Own groups only';
  const last = (id: string) =>
    [...load().audit].reverse().find((a) => a.actorId === id)?.at ?? null;
  return [
    ...world()
      .users.filter((u) => u.active || isPilot())
      .map((u) => ({
        user: { id: u.id, displayName: tx(u.name, lang)! },
        role: u.role,
        scope: scope(u),
        lastActiveAt: last(u.id),
        status: u.active ? ('active' as const) : ('removed' as const),
      })),
    ...load().invites.map((i, n) => ({
      user: { id: `invite-${n}`, displayName: maskPhone(i.phone) },
      role: i.role,
      scope: '—',
      lastActiveAt: null,
      status: 'invite_pending' as const,
    })),
  ];
}

/**
 * Pilot A16: the owner adds a person (no phone number needed). The pilot server sets their PIN.
 * Names are first names or nicknames; roles are the existing ones (owner, reception, teacher).
 */
export function addPilotUser(
  userId: string,
  b: { name: string; role: StaffRole; groupIds?: string[] },
) {
  if (!isPilot()) throw new MockProblem(409, 'not_pilot', 'Use invites outside the pilot.');
  if (!isOwner(userId)) throw new MockProblem(403, 'forbidden', 'Only the owner manages staff.');
  const name = (b.name ?? '').trim();
  if (!name || [...name].length > 40)
    throw new MockProblem(422, 'validation_failed', 'Enter a name (up to 40 characters).');
  if (!['owner', 'reception', 'teacher'].includes(b.role))
    throw new MockProblem(422, 'validation_failed', 'Pick a role.');
  const w = load().world!;
  if (w.users.some((u) => u.active && tx(u.name, 'ar') === name))
    throw new MockProblem(409, 'name_taken', 'Someone already has this name. Add an initial.');
  const u: WorldUser = {
    id: nextId('usr'),
    name: { ar: name, en: name },
    role: b.role,
    title: TITLES[b.role],
    active: true,
  };
  w.users.push(u);
  for (const gid of b.groupIds ?? []) {
    const g = w.groups.find((x) => x.id === gid);
    if (!g) throw new MockProblem(422, 'validation_failed', 'Unknown group.');
    if (b.role !== 'teacher')
      throw new MockProblem(422, 'validation_failed', 'Only teachers have groups.');
    g.teacherUserId = u.id;
  }
  audit(
    'access.user_added',
    userId,
    { en: `Staff added (${b.role})`, ar: `أُضيف موظف (${TITLES[b.role].ar})` },
    undefined,
    { userId: u.id, role: b.role },
  );
  save();
  return u;
}
/** Pilot A16: remove someone's access (kept in history; their past actions stay attributed). */
export function removePilotUser(userId: string, targetId: string) {
  if (!isPilot()) throw new MockProblem(409, 'not_pilot', 'Not available outside the pilot.');
  if (!isOwner(userId)) throw new MockProblem(403, 'forbidden', 'Only the owner manages staff.');
  if (targetId === userId) throw new MockProblem(409, 'self', 'You cannot remove yourself.');
  const u = load().world!.users.find((x) => x.id === targetId);
  if (!u) throw new MockProblem(404, 'not_found', 'Person not found.');
  u.active = false;
  audit(
    'access.user_removed',
    userId,
    { en: 'Staff access removed', ar: 'أُلغي وصول موظف' },
    undefined,
    {
      userId: targetId,
    },
  );
  save();
}
/** The audit trail for sign-ins and PIN changes, written by the pilot server (A3). */
export function recordAccessEvent(
  kind: 'access.signed_in' | 'access.signed_out' | 'access.pin_reset' | 'access.locked',
  actorId: string | null,
  data: AuditRow['data'] = {},
) {
  const text: Record<typeof kind, mfx.L> = {
    'access.signed_in': { en: 'Signed in', ar: 'تسجيل دخول' },
    'access.signed_out': { en: 'Signed out', ar: 'تسجيل خروج' },
    'access.pin_reset': { en: 'PIN reset by the owner', ar: 'أعاد المالك تعيين الرمز' },
    'access.locked': {
      en: 'Sign-in locked after 5 wrong PINs',
      ar: 'قُفل الدخول بعد ٥ رموز خاطئة',
    },
  };
  audit(kind, actorId, text[kind], undefined, data);
  save();
}
/** A system event in the activity log (pilot set-up steps such as a roster import). */
export function recordSystemEvent(kind: string, text: mfx.L, data: AuditRow['data'] = {}) {
  audit(kind, null, text, undefined, data);
  save();
}
export const TITLES: Record<StaffRole, mfx.L> = {
  owner: { en: 'Owner', ar: 'المالك' },
  reception: { en: 'Reception', ar: 'الاستقبال' },
  teacher: { en: 'Teacher', ar: 'معلّم' },
};

export function inviteStaff(
  userId: string,
  b: { phone: string; role: StaffMember['role'] },
  lang: Lang,
) {
  if (!isOwner(userId)) throw new MockProblem(403, 'forbidden', 'Only the owner manages staff.');
  if (isPilot()) throw new MockProblem(409, 'pilot_mode', 'In the pilot, add people with a PIN.');
  if (!/^\+20(10|11|12|15)\d{8}$/.test(b.phone ?? ''))
    throw new MockProblem(422, 'invalid_phone', 'Enter an Egyptian mobile number.');
  if (!['reception', 'teacher'].includes(b.role))
    throw new MockProblem(422, 'validation_failed', 'Pick a role.');
  load().invites.push({ phone: b.phone, role: b.role, at: new Date().toISOString() });
  save();
  audit('access.invited', userId, {
    en: `Staff invited (${b.role}) — invite pending`,
    ar: `دعوة موظف (${b.role === 'teacher' ? 'معلّم' : 'استقبال'}) — بانتظار القبول`,
  });
  save();
  return staffList(userId, lang);
}

// ── activity (A17, FUP-DSH-04) ─────────────────────────────────────────────────
const KIND: Record<string, ActivityKind> = {
  record: 'records',
  note: 'records',
  signal: 'followups',
  case: 'followups',
  message: 'messages',
  rule: 'access',
  access: 'access',
};
/** Sign-ins are counted for usage metrics but are not shown in A17. */
const HIDDEN_KINDS = ['demo.', 'access.signed_in', 'access.signed_out'];
export function activity(userId: string, lang: Lang): ActivityLog {
  requireStaff(userId);
  const s = load();
  const events: ActivityEvent[] = s.audit
    .filter((a) => !HIDDEN_KINDS.some((k) => a.kind.startsWith(k)))
    .map((a) => ({
      id: a.id,
      at: a.at,
      kind:
        a.kind === 'record.corrected' ? 'corrections' : (KIND[a.kind.split('.')[0]!] ?? 'records'),
      text: tx(a.text, lang)!,
      actor: a.actorId ? person(a.actorId, lang) : null,
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const week = s.audit.filter((a) => a.at >= since);
  return {
    events,
    week: {
      recordsConfirmed: week.filter((a) => a.kind === 'record.confirmed').length,
      followUpsOpened: week.filter((a) => a.kind === 'signal.raised').length,
      outcomesRecorded: week.filter((a) => a.kind === 'case.outcome').length,
      corrections: week.filter((a) => a.kind === 'record.corrected').length,
    },
  };
}

// ── parent feed (P09, FUP-MSG-08) ──────────────────────────────────────────────
const SENT: DeliveryStatus[] = ['queued', 'sent', 'delivered', 'read'];
/** Approved (and handed to the provider) messages only. Confirmed attendance is off by default (OD-41). */
export function parentUpdates(userId: string, lang: Lang): ParentUpdate[] {
  const s = load();
  const mine = new Set(
    world()
      .guardians.filter((g) => g.userId === userId)
      .map((g) => g.id),
  );
  return s.messages
    .filter((m) => mine.has(m.guardianId) && SENT.includes(m.status) && m.finalText)
    .map((m) => ({
      id: m.id,
      studentId: m.studentId,
      kind: 'message' as const,
      text: m.finalText!,
      from: tx(world().centre.name, lang)!,
      at: m.approvedAt!,
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** CF-39: the parent's children's follow-up groups at the centre (P09 when the marketplace is off). */
export function parentCentreGroups(userId: string, lang: Lang) {
  const w = world();
  const mine = new Set(w.guardians.filter((g) => g.userId === userId).map((g) => g.id));
  return w.students
    .filter((s) => mine.has(s.guardianId))
    .flatMap((s) =>
      groupsOfStudent(s.id).map((gid) => {
        const g = groupOf(gid)!;
        return {
          childId: s.id,
          groupId: gid,
          groupName: tx(g.name, lang)!,
          centreName: tx(w.centre.name, lang)!,
          teacher: person(g.teacherUserId, lang),
          weekdays: g.weekdays,
          startTime: g.startTime,
          endTime: g.endTime,
        };
      }),
    );
}

/** FUP-MSG-02 AC3: an approved message is locked; changing it starts a NEW draft. */
export function reviseMessage(userId: string, id: string, lang: Lang) {
  requireStaff(userId);
  const old = msgById(id);
  if (old.status === 'draft')
    throw new MockProblem(409, 'still_draft', 'This draft can be edited directly.');
  const m: Msg = {
    ...old,
    id: nextId('msg'),
    draft: old.finalText ?? old.draft,
    finalText: null,
    status: 'draft',
    channel: null,
    approvedBy: null,
    approvedAt: null,
    failureReason: null,
    replies: [],
    history: [{ status: 'draft', at: new Date().toISOString() }],
  };
  load().messages.push(m);
  const c = m.caseId ? caseById(m.caseId) : null;
  c?.messageIds.push(m.id);
  audit('message.drafted', userId, {
    en: 'New draft from an approved message (the approved one stays locked)',
    ar: 'مسودة جديدة من رسالة معتمدة (المعتمدة تبقى مقفلة)',
  });
  save();
  return messageDto(m, lang);
}

/** V06 "Check a seat": a read of another group's seats, logged on the case timeline. */
export function checkSeat(userId: string, caseId: string, lang: Lang) {
  requireStaff(userId);
  const c = caseById(caseId);
  const alt = groupDto('grp-salma-st', lang);
  const next = alt.upcomingSessions[0];
  const left = next?.seatsLeft ?? 0;
  const text =
    lang === 'ar'
      ? `فحص مقعد: ${alt.schoolYear.name} · ${alt.subject.name}، الأحد والثلاثاء ٣ م — ${new Intl.NumberFormat('ar-EG').format(left)} مقاعد متاحة`
      : `Seat check: ${alt.schoolYear.name} · ${alt.subject.name}, Sun & Tue 3 PM — ${left} seats left`;
  c.timeline.push({ at: new Date().toISOString(), kind: 'seat_checked', text, actorId: userId });
  save();
  return { text, seatsLeft: left, groupId: alt.id };
}
