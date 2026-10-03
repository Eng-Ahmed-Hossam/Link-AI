// Rule tests for the Phase 2 mock backend (scenario demo-followup). Test names carry rule IDs.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import {
  ApiError,
  fuApi,
  isExtractionReady,
  newIdempotencyKey,
  setApiBaseUrl,
  setApiLocale,
  setAuthToken,
  type SessionRecord,
  type VoiceExtraction,
} from '@link/api-client';
import { handlers } from '../handlers';
import { resetMockDb, sessionsOf } from '../db';
import { cairoToday } from '../time';
import { demoSnapshot, resetFollowupDb, setDemo } from './db';
import { DEMO_GROUP_ID, roster } from './data';

const BASE = 'http://mock.link.test';
const server = setupServer(...handlers);
beforeAll(() => {
  setApiBaseUrl(BASE);
  server.listen({ onUnhandledFrame: 'error' });
});
afterAll(() => server.close());
beforeEach(() => {
  resetMockDb();
  resetFollowupDb();
  setApiLocale('en');
  asTeacher();
});
const asTeacher = () => setAuthToken('mock.usr-salma');
const asReception = () => setAuthToken('mock.usr-reception');

const err = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('expected an error');
};
const todaySession = () =>
  sessionsOf(DEMO_GROUP_ID)
    .filter((s) => s.date <= cairoToday())
    .at(-1)!;
const allPresent = (r: SessionRecord) =>
  r.entries.map((e) => ({ studentId: e.student.id, attendance: 'present' as const }));

async function openToday() {
  return fuApi.openRecord(DEMO_GROUP_ID, todaySession().id);
}
async function voiceFor(recordId: string): Promise<VoiceExtraction> {
  const vn = await fuApi.createVoiceNote(
    { sessionRecordId: recordId, durationS: 9 },
    newIdempotencyKey(),
  );
  await fetch(`${BASE}${vn.uploadUrl}`, { method: 'PUT', body: new Uint8Array([1, 2, 3]) });
  await fuApi.voiceUploaded(vn.id);
  for (;;) {
    const x = await fuApi.extraction(vn.id);
    if (isExtractionReady(x)) return x;
    await new Promise((r) => setTimeout(r, 200));
  }
}
const mariamFlags = () => demoSnapshot().signals.filter((s) => s.student === 'Mariam Hassan');

describe('scenario demo-followup', () => {
  it('has 18 students, Nour already flagged and overdue, Mariam not yet flagged', async () => {
    expect(roster).toHaveLength(18);
    const s = demoSnapshot();
    expect(s.signals.map((x) => x.student)).toEqual(['Nour Khaled']);
    asReception();
    const cases = await fuApi.cases();
    expect(cases.data[0]!.overdue).toBe(true);
    expect(cases.data[0]!.assignee.role).toBe('Reception');
  });
});

describe('records and rules', () => {
  it('BR-APR-08 FUP-RUL-03: a draft never triggers; confirming raises consecutive_absences for Mariam', async () => {
    const r = await openToday();
    const entries = allPresent(r).map((e) =>
      e.studentId === 'chd-mariam' ? { ...e, attendance: 'absent' as const } : e,
    );
    await fuApi.saveDraft(r.id, { entries });
    expect(mariamFlags()).toHaveLength(0);
    const done = await fuApi.confirmRecord(r.id, newIdempotencyKey());
    expect(done.status).toBe('confirmed');
    const flags = mariamFlags();
    expect(flags).toHaveLength(1);
    expect(flags[0]!.rule).toBe('consecutive_absences');
    expect(flags[0]!.evidence.map((e) => e.sessionDate).at(-1)).toBe(todaySession().date);
    // FUP-CAS-02 AC2: Reception, due the same day.
    const c = demoSnapshot().cases.find((x) => x.student === 'Mariam Hassan')!;
    expect(c).toMatchObject({ assignee: 'Dina Adel', dueOn: cairoToday(), status: 'open' });
    expect(done.signals.map((x) => x.rule)).toContain('consecutive_absences');
  });

  it('BR-APR-07: "not recorded" today breaks the streak — no flag', async () => {
    const r = await openToday();
    const entries = allPresent(r).map((e) =>
      e.studentId === 'chd-mariam' ? { ...e, attendance: 'not_recorded' as const } : e,
    );
    await fuApi.saveDraft(r.id, { entries });
    await fuApi.confirmRecord(r.id, newIdempotencyKey());
    expect(mariamFlags()).toHaveLength(0);
  });

  it('BR-APR-09: a score above the maximum is blocked, never capped', async () => {
    const r = await openToday();
    const e = await err(
      fuApi.saveDraft(r.id, {
        assessment: { title: 'Quiz', series: 'sign-rules-practice', maxScore: 20 },
        entries: [{ studentId: 'stu-omar', attendance: 'present', score: 24 }],
      }),
    );
    expect(e.problem.status).toBe(422);
    expect(e.code).toBe('score_out_of_range');
    expect(e.problem.detail).toBe('24 exceeds the maximum of 20.');
    const after = await fuApi.record(r.id);
    expect(after.entries.find((x) => x.student.id === 'stu-omar')!.score).toBeNull();
  });

  it('FUP-REC-03 AC2: an absent student has no score (never 0); a blank score stays null', async () => {
    const r = await openToday();
    const e = await err(
      fuApi.saveDraft(r.id, {
        assessment: { title: 'Quiz', series: null, maxScore: 20 },
        entries: [{ studentId: 'chd-mariam', attendance: 'absent', score: 0 }],
      }),
    );
    expect(e.code).toBe('score_for_absent');
    const ok = await fuApi.saveDraft(r.id, {
      assessment: { title: 'Quiz', series: null, maxScore: 20 },
      entries: [{ studentId: 'chd-mariam', attendance: 'absent' }],
    });
    expect(ok.entries.find((x) => x.student.id === 'chd-mariam')!.score).toBeNull();
  });

  it('FUP-REC-07 AC3: the same key twice → one confirmed record, one flag', async () => {
    const r = await openToday();
    await fuApi.saveDraft(r.id, {
      entries: allPresent(r).map((e) =>
        e.studentId === 'chd-mariam' ? { ...e, attendance: 'absent' as const } : e,
      ),
    });
    const key = newIdempotencyKey();
    await fuApi.confirmRecord(r.id, key);
    await fuApi.confirmRecord(r.id, key);
    expect(demoSnapshot().counters).toEqual({ confirmCalls: 2, confirmCommits: 1 });
    expect(mariamFlags()).toHaveLength(1);
  });

  it('FUP-REC-07: response lost after the commit → retry with the same key, still no duplicate', async () => {
    const r = await openToday();
    await fuApi.saveDraft(r.id, {
      entries: allPresent(r).map((e) =>
        e.studentId === 'chd-mariam' ? { ...e, attendance: 'absent' as const } : e,
      ),
    });
    setDemo({ confirmFault: 'after_commit' });
    const key = newIdempotencyKey();
    expect((await err(fuApi.confirmRecord(r.id, key))).isNetwork).toBe(true);
    const again = await fuApi.confirmRecord(r.id, key);
    expect(again.status).toBe('confirmed');
    expect(demoSnapshot().counters.confirmCommits).toBe(1);
    expect(mariamFlags()).toHaveLength(1);
  });

  it('FUP-REC-07 AC2: failure before the commit leaves a draft and triggers nothing', async () => {
    const r = await openToday();
    await fuApi.saveDraft(r.id, {
      entries: allPresent(r).map((e) =>
        e.studentId === 'chd-mariam' ? { ...e, attendance: 'absent' as const } : e,
      ),
    });
    setDemo({ confirmFault: 'before_commit' });
    const key = newIdempotencyKey();
    expect((await err(fuApi.confirmRecord(r.id, key))).problem.status).toBe(503);
    expect((await fuApi.record(r.id)).status).toBe('draft');
    expect(mariamFlags()).toHaveLength(0);
    await fuApi.confirmRecord(r.id, key);
    expect(mariamFlags()).toHaveLength(1);
  });
});

describe('voice', () => {
  it('OD-36: the fixture has one high, one medium, one low item; one ambiguous name; 17 unmentioned', async () => {
    const r = await openToday();
    const x = await voiceFor(r.id);
    expect(x.transcript).toContain('مريم غابت النهارده');
    expect(x.items.map((i) => i.band)).toEqual(['high', 'medium', 'low']);
    expect(x.items.filter((i) => i.identity === 'ambiguous')).toHaveLength(1);
    expect(x.unmentioned).toHaveLength(17);
    expect(x.status).toBe('clarification_needed');
  });

  it('FUP-VOI-04: an open identity blocks confirm; only a listed candidate is accepted', async () => {
    const r = await openToday();
    const x = await voiceFor(r.id);
    expect((await err(fuApi.confirmRecord(r.id, newIdempotencyKey()))).code).toBe(
      'identity_unresolved',
    );
    const amb = x.items.find((i) => i.identity === 'ambiguous')!;
    expect(amb.candidates.map((c) => c.displayName)).toEqual(['Ahmed Samir', 'Ahmed Samy']);
    expect((await err(fuApi.resolveIdentity(x.id, amb.id, 'stu-omar'))).code).toBe(
      'not_a_candidate',
    );
    const done = await fuApi.resolveIdentity(x.id, amb.id, 'stu-ahmed-samir');
    expect(done.status).toBe('proposed');
    expect(done.unmentioned).toHaveLength(16);
    await fuApi.confirmRecord(r.id, newIdempotencyKey());
  });

  it('FUP-VOI-06: STT down → 503 stt_unavailable (the app offers "Type the note instead")', async () => {
    const r = await openToday();
    const vn = await fuApi.createVoiceNote(
      { sessionRecordId: r.id, durationS: 4 },
      newIdempotencyKey(),
    );
    await fuApi.voiceUploaded(vn.id);
    setDemo({ sttDown: true });
    expect((await err(fuApi.extraction(vn.id))).code).toBe('stt_unavailable');
  });
});

describe('corrections', () => {
  it('FUP-REC-08 AC1–2: Omar 21 → 12 is kept with field, values, reason and author', async () => {
    const recs = await fuApi.records(DEMO_GROUP_ID);
    const c = recs.flatMap((r) => r.corrections).find((x) => x.student.displayName === 'Omar Ali')!;
    expect(c).toMatchObject({
      field: 'score',
      oldValue: '21',
      newValue: '12',
      reason: 'Typing error',
    });
    expect(c.author.displayName).toBe('Ms Salma Fathy');
  });

  it('FUP-REC-08 AC3: a correction re-runs the rules; the flag is kept as "resolved by correction"', async () => {
    const r = await openToday();
    await fuApi.saveDraft(r.id, {
      entries: allPresent(r).map((e) =>
        e.studentId === 'chd-mariam' ? { ...e, attendance: 'absent' as const } : e,
      ),
    });
    const done = await fuApi.confirmRecord(r.id, newIdempotencyKey());
    const entry = done.entries.find((e) => e.student.id === 'chd-mariam')!;
    expect(
      (
        await err(
          fuApi.correct(entry.id, { field: 'attendance', newValue: 'present', reason: ' ' }),
        )
      ).code,
    ).toBe('reason_required');
    await fuApi.correct(entry.id, {
      field: 'attendance',
      newValue: 'present',
      reason: 'Arrived late, marked wrong',
    });
    expect(mariamFlags().map((f) => f.status)).toEqual(['resolved_by_correction']);
  });
});

describe('messages', () => {
  async function draftForMariam() {
    const r = await openToday();
    await fuApi.saveDraft(r.id, {
      entries: allPresent(r).map((e) =>
        e.studentId === 'chd-mariam' ? { ...e, attendance: 'absent' as const } : e,
      ),
    });
    await fuApi.confirmRecord(r.id, newIdempotencyKey());
    asReception();
    const c = (await fuApi.cases()).data.find((x) => x.student.id === 'chd-mariam')!;
    return { c, m: await fuApi.draftMessage(c.id) };
  }

  it('FUP-MSG-01: the draft uses confirmed facts only, each with its source; the phone is masked', async () => {
    const { m } = await draftForMariam();
    expect(m.groundedFacts).toHaveLength(2);
    expect(m.groundedFacts[0]!.text).toMatch(/^Attendance • .* • Absent • Teacher confirmed$/);
    expect(m.guardian.phoneMasked).toBe('+20 10 •••• 0001');
    expect(m.draft).toContain('مريم');
  });

  it('FUP-MSG-02: only messages.approve, only with the check; approved = locked', async () => {
    const { m } = await draftForMariam();
    asTeacher();
    expect((await err(fuApi.approveMessage(m.id, { checked: true }))).problem.status).toBe(403);
    asReception();
    expect((await err(fuApi.approveMessage(m.id, { checked: false }))).code).toBe('check_required');
    const a = await fuApi.approveMessage(m.id, { checked: true });
    expect(a.status).toBe('queued');
    expect((await err(fuApi.editMessage(m.id, { text: 'x' }))).code).toBe('message_locked');
  });

  it('BR-APR-11 FUP-MSG-03 AC4: status moves only on provider events; sending logs an attempt, case stays open', async () => {
    const { c, m } = await draftForMariam();
    await fuApi.approveMessage(m.id, { checked: true });
    expect((await fuApi.message(m.id)).status).toBe('queued');
    await fetch(`${BASE}/__demo/provider`, {
      method: 'POST',
      body: JSON.stringify({ outcome: 'advance' }),
    });
    expect((await fuApi.message(m.id)).status).toBe('sent');
    await fetch(`${BASE}/__demo/provider`, {
      method: 'POST',
      body: JSON.stringify({ outcome: 'advance' }),
    });
    expect((await fuApi.message(m.id)).status).toBe('delivered');
    const after = await fuApi.case(c.id);
    expect(after.attempts.map((x) => x.result)).toEqual(['message_sent']);
    expect(after.status).toBe('in_progress');
  });

  it('FUP-MSG-05 + FUP-MSG-04: the parent reply links to the case; STOP takes effect at once', async () => {
    const { c, m } = await draftForMariam();
    await fuApi.approveMessage(m.id, { checked: true });
    await fetch(`${BASE}/__demo/provider`, { method: 'POST', body: '{}' });
    await fetch(`${BASE}/__demo/reply`, { method: 'POST', body: '{}' });
    const got = await fuApi.message(m.id);
    expect(got.replies[0]!.body).toBe('عندها درس تاني الأربع');
    expect(got.replies[0]!.intent).toBe('Timetable clash on Wednesdays');
    expect((await fuApi.case(c.id)).status).toBe('in_progress'); // suggestions never close a case
    await fetch(`${BASE}/__demo/reply`, { method: 'POST', body: JSON.stringify({ body: 'STOP' }) });
    expect((await fuApi.message(m.id)).guardian.stopped).toBe(true);
  });

  it('FUP-MSG-03 AC2: a guardian who replied STOP cannot be sent to; the approver sees why', async () => {
    asReception();
    const nour = (await fuApi.cases()).data.find((x) => x.student.displayName === 'Nour Khaled')!;
    const m = await fuApi.draftMessage(nour.id);
    expect(m.blockedReason).toBe('stopped');
    const a = await fuApi.approveMessage(m.id, { checked: true });
    expect(a.status).toBe('not_sendable');
  });

  it('BR-APR-10 FUP-CAS-03: an outcome keeps the case open as "awaiting confirmation" by default', async () => {
    asReception();
    const nour = (await fuApi.cases()).data[0]!;
    const after = await fuApi.addAttempt(nour.id, {
      channel: 'phone',
      result: 'reached',
      learned: 'Family trip',
    });
    expect(after.status).toBe('awaiting_confirmation');
    expect(after.overdue).toBe(false);
  });
});

describe('notes and student detail', () => {
  it('FUP-REC-10: up to 500 characters; "suggest" goes to staff, no message is created', async () => {
    const long = 'أ'.repeat(501);
    expect(
      (
        await err(
          fuApi.addNote('stu-omar', { groupId: DEMO_GROUP_ID, tag: 'positive', body: long }),
        )
      ).code,
    ).toBe('too_long');
    const n = await fuApi.addNote('stu-omar', {
      groupId: DEMO_GROUP_ID,
      tag: 'positive',
      body: 'Great effort',
    });
    expect(n.visibility).toBe('internal');
    const s = await fuApi.suggestNote(n.id);
    expect(s.visibility).toBe('suggested_for_parent');
    expect(demoSnapshot().messages).toHaveLength(0);
  });

  it('FUP-REC-11 AC2: trends never mix assessment series', async () => {
    const d = await fuApi.student('stu-omar');
    expect(d.trends.map((t) => t.series).sort()).toEqual(['sign-rules-practice', 'unit-tests']);
    for (const t of d.trends) expect(new Set(t.points.map((p) => p.maxScore)).size).toBe(1);
  });
});

describe('demo controls', () => {
  it('offline switch: every API call fails like a dropped connection', async () => {
    await fetch(`${BASE}/__demo/settings`, {
      method: 'POST',
      body: JSON.stringify({ offline: true }),
    });
    expect((await err(fuApi.teacherToday())).isNetwork).toBe(true);
    await fetch(`${BASE}/__demo/settings`, {
      method: 'POST',
      body: JSON.stringify({ offline: false }),
    });
    expect((await fuApi.teacherToday()).nextSession).not.toBeNull();
  });
});
