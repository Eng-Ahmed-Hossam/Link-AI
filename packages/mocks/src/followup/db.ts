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
 * State lives in memory (mock server, tests) or localStorage (browser MSW mode).
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
} from '@link/api-client';
import * as mfx from '../data';
import { MockProblem, sessionsOf, type Lang } from '../db';
import { addDays, cairoToday } from '../time';
import * as fx from './data';

type Text = string | mfx.L;
const tx = (v: Text | null, lang: Lang) => (v == null ? null : typeof v === 'string' ? v : v[lang]);

const STORAGE_KEY = 'link.mock.fu.v1';
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
interface Voice {
  id: string;
  recordId: string;
  durationS: number;
  status: VoiceNote['status'];
  readyAt: number | null;
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
  audit: { id: string; at: string; kind: string; actorId: string | null; text: Text }[];
  counters: { confirmCalls: number; confirmCommits: number };
  demo: DemoState;
  seq: number;
}

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
function load(): FuState {
  if (state) return state;
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
const G = fx.DEMO_GROUP_ID;
const studentFx = (id: string) => fx.roster.find((s) => s.id === id);
const guardianFx = (id: string) =>
  id === fx.genericGuardian.id ? fx.genericGuardian : fx.guardians.find((x) => x.id === id)!;
const staffFx = (id: string) => mfx.staff.find((u) => u.id === id);
const person = (id: string, lang: Lang): PersonRef => {
  const s = studentFx(id);
  if (s) return { id, displayName: s.name[lang] };
  const u = staffFx(id);
  if (u) return { id, displayName: u.name[lang] };
  return { id, displayName: id };
};
const pastSessions = () => sessionsOf(G).filter((s) => s.date <= cairoToday());
const recordFor = (sessionId: string) => load().records.find((r) => r.sessionId === sessionId);
const recordById = (id: string) => {
  const r = load().records.find((x) => x.id === id);
  if (!r) throw new MockProblem(404, 'not_found', 'Record not found.');
  return r;
};
export const isDemoGroup = (groupId: string) => groupId === G;
const teacherOwns = (userId: string, groupId: string) =>
  groupId === G && userId === fx.DEMO_TEACHER_USER;
const isCentreStaff = (userId: string) => userId === 'usr-owner' || userId === 'usr-reception';
/** OD-34: centre staff with `messages.approve` (owner and Reception in the demo). */
const canApprove = isCentreStaff;

function fmtDate(date: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB-u-nu-latn', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}
const maskPhone = (e164: string | null) =>
  e164 ? `${e164.slice(0, 3)} ${e164.slice(3, 5)} •••• ${e164.slice(-4)}` : '—';

function audit(kind: string, actorId: string | null, text: Text) {
  load().audit.push({ id: nextId('aud'), at: new Date().toISOString(), kind, actorId, text });
}

// ── seed ───────────────────────────────────────────────────────────────────────
function blankEntries(date: string): Entry[] {
  return fx.roster.map((s) => ({
    id: `ent-${date}-${s.id}`,
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
    demo: { offline: false, phase2: false, sttDown: false, confirmFault: null },
    seq: 100,
  };
  const past = pastSessions();
  // past[-1] is the session being recorded now (no record yet); seed the ones before it, oldest first.
  const before = past.slice(0, -1).reverse(); // newest first
  const seeds = fx.pastRecords.map((p, i) => ({ p, s: before[i] })).filter((x) => x.s);
  // Older sessions than the fixtures: confirmed, everyone present.
  for (const s of before.slice(fx.pastRecords.length).reverse()) seedRecord(s, {});
  for (const { p, s } of [...seeds].reverse()) if (!p.missing) seedRecord(s!, p);
  // Run the rules over the history in order, as the real system would have.
  for (const r of [...state.records].sort((a, b) => a.date.localeCompare(b.date)))
    for (const st of fx.roster) evaluate(st.id, r.date, r.confirmedAt!);
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
  }
  return state;
}

function seedRecord(
  s: { id: string; date: string; startsAt: string; endsAt: string },
  p: (typeof fx.pastRecords)[number],
) {
  const a = p.assessment ? fx.assessments[p.assessment] : null;
  const entries = blankEntries(s.date).map((e) => {
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

export function resetFollowupDb() {
  const keep = state?.demo;
  state = fresh();
  // A reset keeps the demo switches the presenter set, except one-shot faults and offline.
  if (keep) state.demo = { ...keep, offline: false, confirmFault: null, sttDown: false };
  save();
}

// ── rules (FUP-RUL-03): the followup module is the only evaluator ──────────────
function evaluate(
  studentId: string,
  uptoDate: string,
  at: string,
  cause?: { correctionOf: string },
) {
  const s = load();
  const rule = fx.rules.find((r) => r.code === 'consecutive_absences')!;
  if (!rule.active) return;
  const n = rule.params.n;
  const sched = pastSessions()
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
      x.groupId === G &&
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
      ruleVersion: fx.RULE_DEFAULTS.version,
      studentId,
      groupId: G,
      evidence: ids,
      status: 'case_opened',
      caseId: null,
      raisedAt: at,
    };
    const raisedOn = at.slice(0, 10);
    const c: CaseRow = {
      id: nextId('case'),
      signalId: sig.id,
      studentId,
      assigneeId: fx.RULE_DEFAULTS.assigneeUserId,
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
            en: 'Flag raised by rule "Consecutive absences" (v1)',
            ar: 'تم رفع تنبيه بقاعدة "غياب متتالي" (الإصدار ١)',
          },
          actorId: null,
        },
        {
          at,
          kind: 'assigned',
          text: {
            en: 'Assigned to Reception, due the same day',
            ar: 'أُسند إلى الاستقبال، مستحق في نفس اليوم',
          },
          actorId: null,
        },
      ],
    };
    sig.caseId = c.id;
    s.signals.push(sig);
    s.cases.push(c);
    audit('signal.raised', null, {
      en: `Flag raised: ${studentFx(studentId)!.name.en} — consecutive absences`,
      ar: `تنبيه جديد: ${studentFx(studentId)!.name.ar} — غياب متتالي`,
    });
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
  }
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
  const dates = x.evidence
    .map((id) => recordById(id).date)
    .sort()
    .slice(-2)
    .map((d) => fmtDate(d, lang));
  const st = studentFx(x.studentId)!;
  if (lang === 'ar')
    return `${st.gender === 'f' ? 'غابت' : 'غاب'} عن حصتين متتاليتين: ${dates.join(' و')}`;
  return `Absent from two consecutive scheduled sessions: ${dates.join(' and ')}`;
}
const RULE_TEXT: mfx.L = {
  en: 'Consecutive absences (Rule v1): a flag is raised when a student is absent from the last 2 scheduled sessions, each with a confirmed record. A "Not recorded" session breaks the streak.',
  ar: 'غياب متتالي (القاعدة الإصدار ١): يُرفع تنبيه عندما يغيب الطالب عن آخر حصتين مجدولتين، ولكل منهما سجل مؤكَّد. الحصة "غير المسجّلة" تقطع التتابع.',
};
function signalDto(x: Sig, lang: Lang): Signal {
  return {
    ...signalSummary(x, lang),
    student: person(x.studentId, lang),
    group: { id: G, name: fx.groupName[lang] },
    evidence: x.evidence.map((id) => {
      const r = recordById(id);
      return {
        recordId: id,
        sessionDate: r.date,
        attendance: r.entries.find((e) => e.studentId === x.studentId)!.attendance,
        confirmedBy: person(r.confirmedBy!, lang),
      };
    }),
    ruleText: RULE_TEXT[lang],
    raisedAt: x.raisedAt,
  };
}

function recordDto(r: Rec, lang: Lang): SessionRecord {
  const s = load();
  return {
    id: r.id,
    groupId: G,
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
    corrections: s.corrections
      .filter((c) => c.recordId === r.id)
      .map((c) => correctionDto(c, lang)),
    signals: s.signals.filter((x) => x.evidence.includes(r.id)).map((x) => signalSummary(x, lang)),
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
  const g = load().guardians[id]!;
  return {
    id,
    displayName: f.name[lang],
    phoneMasked: maskPhone(f.phone),
    whatsappOptIn: g.whatsappOptIn && !!f.phone,
    smsConsent: g.smsConsent && !!f.phone,
    stopped: g.stopped,
  };
}
function blockedReason(guardianId: string): ParentMessage['blockedReason'] {
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
    assignee: { ...person(c.assigneeId, lang), role: staffFx(c.assigneeId)?.title[lang] ?? '' },
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
  if (userId !== fx.DEMO_TEACHER_USER) throw new MockProblem(403, 'forbidden', 'Teachers only.');
  const s = load();
  const now = Date.now();
  const next = sessionsOf(G).find((x) => new Date(x.endsAt).getTime() > now) ?? null;
  // Reminders only from CONFIRMED observations, each with its source (FUP-REC-01 AC1).
  const reminders = s.records
    .filter((r) => r.status === 'confirmed')
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
  const past = pastSessions();
  const due = past.at(-1);
  const dueRec = due ? recordFor(due.id) : undefined;
  const recordDue: TeacherToday['recordDue'] =
    due && dueRec?.status !== 'confirmed'
      ? {
          groupId: G,
          groupName: fx.groupName[lang],
          sessionId: due.id,
          sessionDate: due.date,
          startsAt: due.startsAt,
          endsAt: due.endsAt,
          studentCount: fx.roster.length,
          recordId: dueRec?.id ?? null,
        }
      : null;
  const needsYou: TeacherToday['needsYou'] = [];
  for (const p of past.slice(-6, -1)) {
    const r = recordFor(p.id);
    if (r?.status === 'confirmed') continue;
    needsYou.push({
      kind: r ? 'draft' : 'missing',
      groupId: G,
      groupName: fx.groupName[lang],
      sessionId: p.id,
      sessionDate: p.date,
      recordId: r?.id ?? null,
    });
  }
  return {
    teacher: person(userId, lang),
    nextSession: next
      ? {
          groupId: G,
          groupName: fx.groupName[lang],
          sessionId: next.id,
          startsAt: next.startsAt,
          studentCount: fx.roster.length,
        }
      : null,
    reminders,
    recordDue,
    needsYou: needsYou.reverse(),
  };
}

/** Follow-up part of T09 for one group (null when the group has no follow-up subscription). */
export function followupSummary(groupId: string) {
  if (groupId !== G) return null;
  const recent = pastSessions().slice(-7);
  return {
    studentCount: fx.roster.length,
    recordsComplete: {
      confirmed: recent.filter((p) => recordFor(p.id)?.status === 'confirmed').length,
      eligible: recent.length,
    },
    openFollowUps: load().cases.filter((c) => !['resolved', 'dismissed'].includes(c.status)).length,
  } satisfies TeacherGroup['followup'];
}

function lastFour(studentId: string): (Attendance | 'none')[] {
  return pastSessions()
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
  if (!teacherOwns(userId, groupId) && !isCentreStaff(userId))
    throw new MockProblem(403, 'forbidden', 'Not allowed.');
  return fx.roster.map((st) => ({
    student: person(st.id, lang),
    lastSessions: lastFour(st.id),
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
  if (userId !== fx.DEMO_TEACHER_USER && !isCentreStaff(userId))
    throw new MockProblem(403, 'forbidden', 'Not allowed.');
  const s = load();
  const confirmed = s.records
    .filter((r) => r.status === 'confirmed')
    .sort((a, b) => a.date.localeCompare(b.date));
  const att = pastSessions().map((p) => {
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
    group: { id: G, name: fx.groupName[lang] },
    attended: {
      present: att.filter((a) => a.value === 'present' || a.value === 'late').length,
      of: att.filter((a) => a.value !== 'none' && a.value !== 'not_recorded').length,
    },
    latestScore: latestScore(studentId, lang),
    notesThisMonth: notes.filter((n) => n.at.slice(0, 10) >= monthStart).length,
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
          groupId: G,
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
  if (!studentFx(studentId)) throw new MockProblem(404, 'not_found', 'Student not found.');
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
  audit('note.saved', userId, {
    en: `Note saved for ${studentFx(studentId)!.name.en}`,
    ar: `ملاحظة محفوظة عن ${studentFx(studentId)!.name.ar}`,
  });
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
    .records.slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => recordDto(r, lang));
}

export function openRecord(userId: string, groupId: string, sessionId: string, lang: Lang) {
  requireTeacher(userId, groupId);
  const sess = pastSessions().find((p) => p.id === sessionId);
  if (!sess)
    throw new MockProblem(
      422,
      'session_not_recordable',
      'Only sessions that have taken place, or today’s, can be recorded.',
    );
  const existing = recordFor(sessionId);
  if (existing) return { created: false, record: recordDto(existing, lang) };
  const r: Rec = {
    id: `rec-${sess.date}`,
    sessionId,
    date: sess.date,
    startsAt: sess.startsAt,
    status: 'draft',
    source: 'tap',
    assessment: null,
    entries: blankEntries(sess.date),
    groupObservation: null,
    confirmedBy: null,
    confirmedAt: null,
    createdAt: new Date().toISOString(),
  };
  load().records.push(r);
  audit('record.draft_created', userId, {
    en: `Draft record created for ${sess.date}`,
    ar: `تم إنشاء مسودة سجل ${sess.date}`,
  });
  save();
  return { created: true, record: recordDto(r, lang) };
}

export function getRecord(userId: string, id: string, lang: Lang) {
  const r = recordById(id);
  if (!teacherOwns(userId, G) && !isCentreStaff(userId))
    throw new MockProblem(403, 'forbidden', 'Not allowed.');
  return recordDto(r, lang);
}

function validateEntries(entries: EntryInput[], maxScore: number | null) {
  for (const e of entries) {
    if (!studentFx(e.studentId))
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
  requireTeacher(userId, G);
  if (r.status === 'confirmed')
    throw new MockProblem(
      409,
      'record_confirmed',
      'This record is confirmed. Add a correction instead.',
    );
  const a = body.assessment === undefined ? r.assessment : body.assessment;
  if (a && !(a.maxScore > 0))
    throw new MockProblem(422, 'validation_failed', 'The maximum must be above 0.');
  validateEntries(body.entries ?? [], a ? a.maxScore : null);
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
  requireTeacher(userId, G);
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
  );
  const at = new Date().toISOString();
  r.status = 'confirmed';
  r.confirmedBy = userId;
  r.confirmedAt = at;
  s.idem[key] = { kind: 'confirm', id };
  s.counters.confirmCommits++;
  for (const v of s.voice) if (v.recordId === id) v.extraction.status = 'accepted';
  audit('record.confirmed', userId, {
    en: `Record confirmed for ${r.date}`,
    ar: `تم تأكيد سجل ${r.date}`,
  });
  // record.confirmed → the followup module evaluates the rules (FUP-RUL-03).
  for (const st of fx.roster) evaluate(st.id, r.date, at);
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
  requireTeacher(userId, G);
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
  audit('record.corrected', userId, {
    en: `Correction: ${studentFx(e.studentId)!.name.en} ${body.field} ${old ?? '—'} → ${body.newValue ?? '—'}`,
    ar: `تصحيح: ${studentFx(e.studentId)!.name.ar} ${old ?? '—'} ← ${body.newValue ?? '—'}`,
  });
  // record.corrected → re-run the rules for that student (FUP-REC-08 AC3).
  const latest = s.records
    .filter((x) => x.status === 'confirmed')
    .map((x) => x.date)
    .sort()
    .at(-1)!;
  evaluate(e.studentId, latest, at, { correctionOf: r.id });
  save();
  return correctionDto(c, lang);
}

// ── voice (FUP-VOI) ────────────────────────────────────────────────────────────
export function createVoiceNote(
  userId: string,
  body: { sessionRecordId: string; durationS: number },
  key: string | null,
): VoiceNote {
  const s = load();
  if (key && s.idem[key]?.kind === 'voice')
    return voiceDto(s.voice.find((v) => v.id === s.idem[key]!.id)!);
  const r = recordById(body.sessionRecordId);
  requireTeacher(userId, G);
  if (r.status === 'confirmed')
    throw new MockProblem(409, 'record_confirmed', 'This record is confirmed.');
  const v: Voice = {
    id: nextId('vn'),
    recordId: r.id,
    durationS: Math.max(1, Math.round(body.durationS || 0)),
    status: 'queued',
    readyAt: null,
    extraction: { id: nextId('vx'), status: 'clarification_needed', resolved: {} },
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
  uploadUrl: `/__mock/uploads/${v.id}`,
});
const voiceById = (id: string) => {
  const v = load().voice.find((x) => x.id === id);
  if (!v) throw new MockProblem(404, 'not_found', 'Voice note not found.');
  return v;
};
export function voiceUploaded(userId: string, id: string): VoiceNote {
  const v = voiceById(id);
  requireTeacher(userId, G);
  if (v.status === 'queued') {
    v.status = 'transcribing';
    v.readyAt = Date.now() + STT_DELAY_MS;
  }
  save();
  return voiceDto(v);
}

/** null while processing (HTTP 202). */
export function voiceExtraction(userId: string, id: string, lang: Lang): VoiceExtraction | null {
  const s = load();
  const v = voiceById(id);
  requireTeacher(userId, G);
  if (s.demo.sttDown)
    throw new MockProblem(
      503,
      'stt_unavailable',
      'Speech-to-text is not responding. The note stays queued.',
    );
  if (v.status === 'queued')
    throw new MockProblem(409, 'not_uploaded', 'Upload the recording first.');
  if (v.readyAt && Date.now() < v.readyAt) return null;
  if (v.status !== 'ready') {
    v.status = 'ready';
    save();
  }
  return extractionDto(v, lang);
}

function bandOf(c: number): VoiceItem['band'] {
  return c >= 0.85 ? 'high' : c >= 0.6 ? 'medium' : 'low'; // OD-36
}
function extractionDto(v: Voice, lang: Lang): VoiceExtraction {
  const mentioned = new Set<string>();
  const items: VoiceItem[] = fx.voiceItems.map((it) => {
    const chosen = v.extraction.resolved[it.id];
    const studentId = it.identity === 'matched' ? it.studentId : (chosen ?? null);
    if (studentId) mentioned.add(studentId);
    return {
      id: it.id,
      identity: it.identity === 'ambiguous' && chosen ? 'matched' : it.identity,
      student: studentId ? person(studentId, lang) : null,
      candidates: it.candidates.map((c) => person(c, lang)),
      mention: it.mention,
      field: it.field,
      value: it.value,
      confidence: it.confidence,
      band: bandOf(it.confidence),
      span: it.span,
      sourceText: fx.voiceTranscript.slice(it.span.start, it.span.end),
      outOfRange:
        it.field === 'score' &&
        typeof it.value === 'number' &&
        it.value > fx.assessments.practice.maxScore,
    };
  });
  return {
    id: v.extraction.id,
    voiceNoteId: v.id,
    status: v.extraction.status,
    transcript: fx.voiceTranscript,
    audioUrl: null,
    items,
    discardedItemIds: v.extraction.discarded ?? [],
    unmentioned: fx.roster.filter((s) => !mentioned.has(s.id)).map((s) => person(s.id, lang)),
    assessment: {
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
  requireTeacher(userId, G);
  const it = fx.voiceItems.find((x) => x.id === body.itemId);
  if (!it || it.identity !== 'ambiguous')
    throw new MockProblem(422, 'not_ambiguous', 'This item needs no choice.');
  // Never guess: only one of the listed candidates is accepted (FUP-VOI-04).
  if (!it.candidates.includes(body.studentId))
    throw new MockProblem(422, 'not_a_candidate', 'Pick one of the listed students.');
  v.extraction.resolved[it.id] = body.studentId;
  v.extraction.discarded = (v.extraction.discarded ?? []).filter((x) => x !== it.id);
  refreshExtractionStatus(v);
  save();
  return extractionDto(v, lang);
}

function refreshExtractionStatus(v: Voice) {
  const discarded = v.extraction.discarded ?? [];
  const open = fx.voiceItems.some(
    (x) => x.identity === 'ambiguous' && !v.extraction.resolved[x.id] && !discarded.includes(x.id),
  );
  v.extraction.status = open ? 'clarification_needed' : 'proposed';
}

/** The teacher drops an item: nothing from it is saved, and an unclear name no longer blocks confirm. */
export function discardItem(userId: string, extractionId: string, itemId: string, lang: Lang) {
  const v = load().voice.find((x) => x.extraction.id === extractionId);
  if (!v) throw new MockProblem(404, 'not_found', 'Extraction not found.');
  requireTeacher(userId, G);
  if (!fx.voiceItems.some((x) => x.id === itemId))
    throw new MockProblem(404, 'not_found', 'Item not found.');
  v.extraction.discarded = [...new Set([...(v.extraction.discarded ?? []), itemId])];
  delete v.extraction.resolved[itemId];
  refreshExtractionStatus(v);
  save();
  return extractionDto(v, lang);
}

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
  audit('case.outcome', userId, {
    en: 'Outcome recorded on a follow-up',
    ar: 'تم تسجيل نتيجة متابعة',
  });
  save();
  return caseDto(c, lang);
}
export function dismissCase(userId: string, id: string, reason: string, lang: Lang) {
  requireStaff(userId);
  if (!reason?.trim()) throw new MockProblem(422, 'reason_required', 'Give a reason to dismiss.');
  const c = caseById(id);
  c.status = 'dismissed';
  c.dismissReason = reason.trim();
  load().signals.find((x) => x.id === c.signalId)!.status = 'dismissed';
  c.timeline.push({
    at: new Date().toISOString(),
    kind: 'dismissed',
    text: reason.trim(),
    actorId: userId,
  });
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
  save();
  return caseDto(c, lang);
}

// ── messages (FUP-MSG) ─────────────────────────────────────────────────────────
function draftText(sig: Sig, tone: ParentMessage['tone']) {
  const st = studentFx(sig.studentId)!;
  const gd = guardianFx(st.guardianId);
  const first = st.name.ar.split(' ')[0];
  const gFirst = gd.phone && gd.id !== fx.genericGuardian.id ? gd.name.ar.split(' ')[0] : null;
  const dates = sig.evidence
    .map((id) => fmtDate(recordById(id).date, 'ar'))
    .slice(-2)
    .join(' و');
  const verb = st.gender === 'f' ? 'غابت' : 'غاب';
  const hi = gFirst ? `أهلاً أستاذ ${gFirst}` : 'أهلاً بحضرتك';
  if (tone === 'formal')
    return `${hi}، معكم مركز النور. نود إبلاغكم بأن ${first} ${verb} عن حصتي الرياضيات يومي ${dates}. يسعدنا التواصل معكم إن كان هناك ما يمكننا المساعدة فيه.`;
  if (tone === 'neutral')
    return `${hi}، معاك مركز النور. ${first} ${verb} عن آخر حصتين رياضيات (${dates}). لو في حاجة نقدر نساعد فيها، بلّغنا.`;
  return `${hi}، معاك مركز النور 😊 حبينا نطمّن على ${first}؛ ${verb} عن آخر حصتين رياضيات (${dates}). لو في أي ظرف أو حاجة نقدر نساعد فيها، ياريت تقولنا. شكرًا!`;
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
  audit('message.approved', userId, {
    en: 'Parent message approved',
    ar: 'تم اعتماد رسالة لوليّ الأمر',
  });
  save();
  return messageDto(m, lang);
}

// ── demo controls (dev only) ───────────────────────────────────────────────────
export const demoState = () => load().demo;
export function setDemo(patch: Partial<DemoState>) {
  Object.assign(load().demo, patch);
  save();
  return load().demo;
}

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

export { RULE_TEXT };
