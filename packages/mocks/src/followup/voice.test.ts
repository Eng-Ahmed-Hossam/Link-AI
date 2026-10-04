// B3 real speech-to-text through the follow-up module: the dispatch carries the roster (names as
// hints), a real proposal replaces the fixture, identity rules hold (never guess), failures and the
// 3-minute timeout say "Type the note instead", and retry re-sends the kept audio.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMockDb, sessionsOf } from '../db';
import { cairoToday } from '../time';
import { DEMO_GROUP_ID } from './data';
import {
  configureVoice,
  createVoiceNote,
  openRecord,
  resetFollowupDb,
  resolveIdentity,
  retryVoice,
  setVoiceResult,
  voiceEta,
  voiceExtraction,
  voiceUploaded,
  type VoiceDispatch,
} from './db';

const T = 'usr-salma';
let sent: VoiceDispatch[] = [];
beforeEach(() => {
  resetMockDb();
  resetFollowupDb();
  sent = [];
  configureVoice({ dispatch: (d) => void sent.push(d) });
});
afterEach(() => {
  configureVoice({ dispatch: null });
  vi.restoreAllMocks();
});

function uploadNote() {
  const s = sessionsOf(DEMO_GROUP_ID)
    .filter((x) => x.date <= cairoToday())
    .at(-1)!;
  const r = openRecord(T, DEMO_GROUP_ID, s.id, 'en').record;
  const v = createVoiceNote(T, { sessionRecordId: r.id, durationS: 30 }, `k-${Math.random()}`);
  voiceUploaded(T, v.id);
  return v;
}
const item = (over: Record<string, unknown>) => ({
  id: 'vi-1',
  identity: 'matched' as const,
  studentId: 'chd-mariam',
  candidates: [] as string[],
  mention: 'مريم',
  field: 'attendance' as const,
  value: 'absent',
  confidence: 0.92,
  span: { start: 0, end: 9 },
  sourceText: 'مريم غابت',
  outOfRange: false,
  ...over,
});

describe('B3 voice notes with real speech-to-text', () => {
  it('the dispatch carries the group roster as hints and waits (202) with an estimate', () => {
    const v = uploadNote();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.roster.map((r) => r.displayName)).toContain('مريم حسن');
    expect(sent[0]!.durationS).toBe(30);
    expect(voiceExtraction(T, v.id, 'en')).toBeNull();
    expect(voiceEta(v.id)).toBeGreaterThan(0);
  });

  it('a real proposal replaces the fixture; an ambiguous name only takes a listed candidate', () => {
    const v = uploadNote();
    setVoiceResult(v.id, {
      status: 'ready',
      result: {
        transcript: 'مريم غابت، وأحمد جاب ١٤',
        modelVersion: 'test',
        items: [
          item({}),
          item({
            id: 'vi-2',
            identity: 'ambiguous',
            studentId: null,
            candidates: ['stu-ahmed-samir', 'stu-ahmed-samy'],
            mention: 'أحمد',
            field: 'score',
            value: 14,
            confidence: 0.9,
          }),
        ],
      },
    });
    const x = voiceExtraction(T, v.id, 'en')!;
    expect(x.transcript).toBe('مريم غابت، وأحمد جاب ١٤');
    expect(x.items.map((i) => i.id)).toEqual(['vi-1', 'vi-2']);
    expect(x.status).toBe('clarification_needed');
    expect(x.assessment).toBeNull(); // no assessment named on this record
    expect(() =>
      resolveIdentity(T, x.id, { itemId: 'vi-2', studentId: 'chd-mariam' }, 'en'),
    ).toThrow('not_a_candidate');
    const y = resolveIdentity(T, x.id, { itemId: 'vi-2', studentId: 'stu-ahmed-samy' }, 'en');
    expect(y.status).toBe('proposed');
    expect(y.items[1]!.student?.id).toBe('stu-ahmed-samy');
  });

  it('an unknown name is never attached by the system; the teacher may pick a student of the group', () => {
    const v = uploadNote();
    setVoiceResult(v.id, {
      status: 'ready',
      result: {
        transcript: 'كريم غاب',
        modelVersion: 't',
        items: [item({ identity: 'unknown', studentId: null, mention: 'كريم' })],
      },
    });
    const x = voiceExtraction(T, v.id, 'en')!;
    expect(x.items[0]!.student).toBeNull();
    expect(x.status).toBe('clarification_needed');
    expect(() =>
      resolveIdentity(T, x.id, { itemId: 'vi-1', studentId: 'stu-not-here' }, 'en'),
    ).toThrow();
    expect(resolveIdentity(T, x.id, { itemId: 'vi-1', studentId: 'stu-omar' }, 'en').status).toBe(
      'proposed',
    );
  });

  it('a proposal naming a student outside the group is dropped (never trust ids blindly)', () => {
    const v = uploadNote();
    setVoiceResult(v.id, {
      status: 'ready',
      result: {
        transcript: 'x',
        modelVersion: 't',
        items: [item({ studentId: 'stu-p-elsewhere' })],
      },
    });
    expect(voiceExtraction(T, v.id, 'en')!.items).toHaveLength(0);
  });

  it('failure and the 3-minute timeout give "Type the note instead"; retry sends again', () => {
    const v = uploadNote();
    setVoiceResult(v.id, { status: 'failed', code: 'stt_failed' });
    expect(() => voiceExtraction(T, v.id, 'en')).toThrow('stt_failed');
    retryVoice(T, v.id);
    expect(sent).toHaveLength(2);
    expect(voiceExtraction(T, v.id, 'en')).toBeNull();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 181_000);
    expect(() => voiceExtraction(T, v.id, 'en')).toThrow('stt_timeout');
  });

  it('without real speech-to-text the demo fixture is unchanged', () => {
    configureVoice({ dispatch: null });
    const v = uploadNote();
    expect(sent).toHaveLength(0);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5000);
    expect(voiceExtraction(T, v.id, 'en')!.transcript).toContain('مريم غابت النهارده');
  });
});
