// Rule tests for the teacher app's record logic (pure). Test names carry rule IDs.
import { describe, expect, it } from 'vitest';
import type { SessionRecord, VoiceExtraction } from '@link/api-client';
import {
  applyVoice,
  attendanceOf,
  canConfirm,
  checkScore,
  draftFromRecord,
  markRemainingPresent,
  readyToApply,
  shownValue,
  summary,
  toSaveBody,
} from './logic';

const record: SessionRecord = {
  id: 'rec-1',
  groupId: 'g',
  groupSessionId: 'g~2026-10-03',
  sessionDate: '2026-10-03',
  startsAt: '2026-10-03T14:00:00Z',
  status: 'draft',
  source: 'tap',
  assessment: null,
  entries: ['a', 'b', 'c'].map((id) => ({
    id: `e-${id}`,
    student: { id, displayName: id.toUpperCase() },
    attendance: 'not_recorded' as const,
    lateMinutes: null,
    score: null,
    participation: 'not_recorded' as const,
    observation: null,
    observationTag: null,
    source: 'tap' as const,
  })),
  groupObservation: null,
  confirmedBy: null,
  confirmedAt: null,
  createdAt: '2026-10-03T14:00:00Z',
  corrections: [],
  signals: [],
  correctionRequests: [],
};
const fresh = () => draftFromRecord(record, 'Group', 'key-1');

describe('T02 attendance', () => {
  it('FUP-REC-02 AC1: nothing is pre-selected; everyone starts "Not recorded"', () => {
    const d = fresh();
    expect(record.entries.map((e) => attendanceOf(d, e.student.id))).toEqual([
      'not_recorded',
      'not_recorded',
      'not_recorded',
    ]);
  });
  it('BR-APR-07: unmarked students are saved as not_recorded, never absent', () => {
    const d = { ...fresh(), attendance: { a: 'absent' as const } };
    expect(toSaveBody(d).entries.map((e) => e.attendance)).toEqual([
      'absent',
      'not_recorded',
      'not_recorded',
    ]);
    expect(summary(d)).toEqual({ present: 0, absent: 1, late: 0, not_recorded: 2 });
  });
  it('"Mark remaining present" only fills the unmarked ones', () => {
    const d = markRemainingPresent({ ...fresh(), attendance: { a: 'absent' as const } });
    expect(d.attendance).toEqual({ a: 'absent', b: 'present', c: 'present' });
  });
});

describe('T03 scores', () => {
  it('FUP-REC-03 AC2: a blank score stays blank (null), never 0', () => {
    expect(checkScore('', 20, 'present')).toEqual({ ok: true, value: null });
    expect(checkScore('  ', 20, 'present')).toEqual({ ok: true, value: null });
  });
  it('FUP-REC-03 AC2: an absent student never gets a score', () => {
    expect(checkScore('0', 20, 'absent')).toMatchObject({ ok: false, reason: 'absent' });
  });
  it('BR-APR-09: above the maximum is blocked with the value as typed — never capped', () => {
    expect(checkScore('24', 20, 'present')).toEqual({
      ok: false,
      reason: 'out_of_range',
      value: 24,
      max: 20,
    });
    const d = {
      ...fresh(),
      assessment: { title: 'Q', series: null, maxScore: 20 },
      attendance: { a: 'present' as const },
      scores: { a: '24' },
    };
    expect(canConfirm(d)).toBe(false);
  });
  it('RTL-04: Arabic-Indic digits are accepted', () => {
    expect(checkScore('١٤', 20, 'present')).toEqual({ ok: true, value: 14 });
  });
});

const extraction: VoiceExtraction = {
  id: 'vx',
  voiceNoteId: 'vn',
  status: 'clarification_needed',
  transcript: 'مريم غابت النهارده',
  audioUrl: null,
  assessment: { title: 'Quiz', maxScore: 20 },
  discardedItemIds: [],
  unmentioned: [{ id: 'c', displayName: 'C' }],
  items: [
    {
      id: 'i1',
      identity: 'matched',
      student: { id: 'a', displayName: 'A' },
      candidates: [],
      mention: 'A',
      field: 'attendance',
      value: 'absent',
      confidence: 0.96,
      band: 'high',
      span: { start: 0, end: 4 },
      sourceText: 'x',
      outOfRange: false,
    },
    {
      id: 'i2',
      identity: 'ambiguous',
      student: null,
      candidates: [
        { id: 'b', displayName: 'B' },
        { id: 'c', displayName: 'C' },
      ],
      mention: 'أحمد',
      field: 'score',
      value: 14,
      confidence: 0.74,
      band: 'medium',
      span: { start: 0, end: 4 },
      sourceText: 'x',
      outOfRange: false,
    },
    {
      id: 'i3',
      identity: 'group',
      student: null,
      candidates: [],
      mention: null,
      field: 'observation',
      value: 'revisit',
      confidence: 0.52,
      band: 'low',
      span: { start: 0, end: 4 },
      sourceText: 'x',
      outOfRange: false,
    },
  ],
};

describe('V02 voice review', () => {
  it('OD-36: a low-confidence field is shown blank; medium and high are pre-filled', () => {
    expect(extraction.items.map(shownValue)).toEqual(['absent', 14, null]);
  });
  it('FUP-VOI-03 AC4: "Mark N present" / "Leave not recorded" has no default', () => {
    expect(readyToApply(extraction, {}, null)).toEqual({
      undecided: 3,
      needsUnmentionedChoice: true,
    });
  });
  it('FUP-VOI-04: an accepted item on an ambiguous name is never applied to a student and blocks confirm', () => {
    const d = applyVoice(
      fresh(),
      extraction,
      {
        i1: { kind: 'accepted', value: 'absent' },
        i2: { kind: 'accepted', value: 14 },
        i3: { kind: 'skipped' },
      },
      'not_recorded',
    );
    expect(d.attendance).toEqual({ a: 'absent' });
    expect(d.scores).toEqual({});
    expect(d.voice[0]!.openIdentityItemIds).toEqual(['i2']);
    expect(canConfirm(d)).toBe(false);
  });
  it('FUP-VOI-03 AC4: "Mark N present" only marks the unmentioned students', () => {
    const d = applyVoice(
      fresh(),
      extraction,
      {
        i1: { kind: 'accepted', value: 'absent' },
        i2: { kind: 'skipped' },
        i3: { kind: 'skipped' },
      },
      'present',
    );
    expect(d.attendance).toEqual({ a: 'absent', c: 'present' });
    expect(canConfirm(d)).toBe(true);
  });
  it('FUP-REC-07 AC3: the confirm key is created once per draft', () => {
    const d = fresh();
    expect(applyVoice(d, extraction, {}, null).confirmKey).toBe('key-1');
  });
});
