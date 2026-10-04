/**
 * Pure record-draft logic for T02–T05 and V02 (no React Native imports, so Vitest can test it).
 * The rules come from docs/03 FUP-REC and FUP-VOI and docs/01 BR-APR.
 */
import type {
  Attendance,
  EntryInput,
  NoteTag,
  PersonRef,
  SaveRecordBody,
  SessionRecord,
  VoiceExtraction,
  VoiceItem,
} from '@link/api-client';
import { normalizeDigits } from '@link/i18n';

export interface Draft {
  recordId: string;
  groupId: string;
  groupName: string;
  sessionId: string;
  sessionDate: string;
  roster: PersonRef[];
  /** Missing = "Not recorded" (BR-APR-07). Nothing is pre-selected (FUP-REC-02 AC1). */
  attendance: Record<string, Exclude<Attendance, 'not_recorded'>>;
  lateMinutes: Record<string, number | null>;
  assessment: { title: string; series: string | null; maxScore: number } | null;
  /** True when the teacher said "No assessment this session". */
  noAssessment: boolean;
  /** Raw score text per student as typed ("" = blank). Validated, never coerced. */
  scores: Record<string, string>;
  observations: Record<string, { text: string; tag: NoteTag | null; source: 'tap' | 'voice' }>;
  groupObservation: string | null;
  /** Voice notes whose items were applied, with any identity still open. */
  voice: {
    voiceNoteId: string;
    extractionId: string;
    openIdentityItemIds: string[];
    /** The value the teacher accepted for each open item, applied once a student is picked. */
    pendingValues?: Record<string, string | number>;
  }[];
  /** Approval 1 key. Generated once and reused on every retry (FUP-REC-07 AC3). */
  confirmKey: string;
  /** Where each student's values came from. */
  sources: Record<string, 'tap' | 'voice'>;
  updatedAt: string;
}

export function draftFromRecord(r: SessionRecord, groupName: string, confirmKey: string): Draft {
  const d: Draft = {
    recordId: r.id,
    groupId: r.groupId,
    groupName,
    sessionId: r.groupSessionId,
    sessionDate: r.sessionDate,
    roster: r.entries.map((e) => e.student),
    attendance: {},
    lateMinutes: {},
    assessment: r.assessment
      ? { title: r.assessment.title, series: r.assessment.series, maxScore: r.assessment.maxScore }
      : null,
    noAssessment: false,
    scores: {},
    observations: {},
    groupObservation: r.groupObservation,
    voice: [],
    confirmKey,
    sources: {},
    updatedAt: new Date().toISOString(),
  };
  for (const e of r.entries) {
    if (e.attendance !== 'not_recorded') d.attendance[e.student.id] = e.attendance;
    if (e.lateMinutes != null) d.lateMinutes[e.student.id] = e.lateMinutes;
    if (e.score != null) d.scores[e.student.id] = String(e.score);
    if (e.observation)
      d.observations[e.student.id] = {
        text: e.observation,
        tag: e.observationTag,
        source: e.source,
      };
    d.sources[e.student.id] = e.source;
  }
  return d;
}

export const attendanceOf = (d: Draft, id: string): Attendance =>
  d.attendance[id] ?? 'not_recorded';

export function summary(d: Draft) {
  const c = { present: 0, absent: 0, late: 0, not_recorded: 0 };
  for (const s of d.roster) c[attendanceOf(d, s.id)]++;
  return c;
}

/** Bulk action the teacher chooses explicitly (never a default): unmarked → present. */
export function markRemainingPresent(d: Draft): Draft {
  const attendance = { ...d.attendance };
  for (const s of d.roster) attendance[s.id] ??= 'present';
  return { ...d, attendance };
}

export type ScoreCheck =
  | { ok: true; value: number | null }
  | { ok: false; reason: 'not_a_number' | 'out_of_range' | 'absent'; value?: number; max?: number };

/**
 * BR-APR-09: a score above the maximum (or below 0) is BLOCKED and shown as typed — never capped.
 * A blank stays blank (null), and an absent student never gets a score, not even 0.
 */
export function checkScore(
  raw: string | undefined,
  max: number | null,
  attendance: Attendance,
): ScoreCheck {
  const text = normalizeDigits((raw ?? '').trim());
  if (text === '') return { ok: true, value: null };
  if (attendance === 'absent') return { ok: false, reason: 'absent' };
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, reason: 'not_a_number' };
  const value = Number(text);
  if (max == null || value < 0 || value > max)
    return { ok: false, reason: 'out_of_range', value, max: max ?? undefined };
  return { ok: true, value };
}

export function scoreProblems(d: Draft) {
  if (!d.assessment) return [];
  return d.roster
    .map((s) => ({
      student: s,
      check: checkScore(d.scores[s.id], d.assessment!.maxScore, attendanceOf(d, s.id)),
    }))
    .filter((x) => !x.check.ok);
}

export const openIdentities = (d: Draft) => d.voice.flatMap((v) => v.openIdentityItemIds);

/** T05 AC2: Confirm is disabled while any identity item is open or a score is invalid. */
export function canConfirm(d: Draft) {
  return openIdentities(d).length === 0 && scoreProblems(d).length === 0;
}

/** The body the API stores. Unmarked students go as `not_recorded` (never absent). */
export function toSaveBody(d: Draft): SaveRecordBody {
  const entries: EntryInput[] = d.roster.map((s) => {
    const a = attendanceOf(d, s.id);
    const c = d.assessment
      ? checkScore(d.scores[s.id], d.assessment.maxScore, a)
      : { ok: true as const, value: null };
    const obs = d.observations[s.id];
    return {
      studentId: s.id,
      attendance: a,
      lateMinutes: a === 'late' ? (d.lateMinutes[s.id] ?? null) : null,
      score: c.ok ? c.value : null,
      observation: obs?.text ?? null,
      observationTag: obs?.tag ?? null,
      source: d.sources[s.id] ?? 'tap',
    };
  });
  return {
    assessment: d.noAssessment ? null : d.assessment,
    entries,
    groupObservation: d.groupObservation,
  };
}

// ── V02: voice items ────────────────────────────────────────────────────────────
export type ItemDecision =
  { kind: 'pending' } | { kind: 'accepted'; value: string | number } | { kind: 'skipped' };

/** What V02 shows before the teacher acts: low confidence is BLANK, never pre-filled (OD-36). */
export const shownValue = (it: VoiceItem) => (it.band === 'low' ? null : it.value);

/** FUP-VOI-03 AC4: "Mark N present" or "Leave not recorded" — no default. */
export type UnmentionedChoice = 'present' | 'not_recorded' | null;

export function readyToApply(
  x: VoiceExtraction,
  decisions: Record<string, ItemDecision>,
  unmentioned: UnmentionedChoice,
) {
  const undecided = x.items.filter((i) => (decisions[i.id]?.kind ?? 'pending') === 'pending');
  return {
    undecided: undecided.length,
    needsUnmentionedChoice: x.unmentioned.length > 0 && unmentioned === null,
  };
}

/**
 * Apply the accepted items to the draft. Items on an unresolved identity are never applied to a
 * student (they stay open and block confirm). Topic tags are never stored in Phase 2 (CF-07).
 */
export function applyVoice(
  d: Draft,
  x: VoiceExtraction,
  decisions: Record<string, ItemDecision>,
  unmentioned: UnmentionedChoice,
): Draft {
  const next: Draft = {
    ...d,
    attendance: { ...d.attendance },
    lateMinutes: { ...d.lateMinutes },
    scores: { ...d.scores },
    observations: { ...d.observations },
    sources: { ...d.sources },
  };
  const open: string[] = [];
  const pendingValues: Record<string, string | number> = {};
  for (const it of x.items) {
    const dec = decisions[it.id];
    if (dec?.kind !== 'accepted') continue;
    if (it.identity === 'ambiguous' || it.identity === 'unknown') {
      open.push(it.id); // never saved to a student until the teacher picks one (FUP-VOI-04)
      pendingValues[it.id] = dec.value;
      continue;
    }
    if (it.identity === 'group') {
      if (it.field === 'observation') next.groupObservation = String(dec.value);
      continue;
    }
    const id = it.student!.id;
    next.sources[id] = 'voice';
    if (it.field === 'attendance') next.attendance[id] = dec.value as 'present' | 'absent' | 'late';
    else if (it.field === 'late_minutes') next.lateMinutes[id] = Number(dec.value);
    else if (it.field === 'score') {
      next.scores[id] = String(dec.value);
      if (!next.assessment && x.assessment)
        next.assessment = {
          title: x.assessment.title,
          series: null,
          maxScore: x.assessment.maxScore,
        };
    } else if (it.field === 'observation')
      next.observations[id] = {
        text: String(dec.value),
        tag: next.observations[id]?.tag ?? null,
        source: 'voice',
      };
  }
  if (unmentioned === 'present')
    for (const s of x.unmentioned) if (!next.attendance[s.id]) next.attendance[s.id] = 'present';
  next.voice = [
    ...d.voice.filter((v) => v.extractionId !== x.id),
    { voiceNoteId: x.voiceNoteId, extractionId: x.id, openIdentityItemIds: open, pendingValues },
  ];
  next.updatedAt = new Date().toISOString();
  return next;
}
