// A8 pilot metrics from a known activity log: every number checked by hand.
import { describe, expect, it } from 'vitest';
import type { AuditRow } from '@link/mocks/followup';
import type { WorldData } from '@link/mocks/world';
import { computeMetrics, median, metricsCsv, metricsMarkdown } from '../src/metrics';

// Cairo is UTC+3 on these dates (summer time); times below are UTC.
const world: WorldData = {
  kind: 'pilot',
  centre: { id: 'cen-pilot', name: { ar: 'م', en: 'م' } },
  // Sat (6) and Mon (1), 17:00–18:00 Cairo = 14:00–15:00 UTC.
  groups: [
    {
      id: 'g1',
      name: { ar: 'ج', en: 'ج' },
      subject: null,
      teacherUserId: 't',
      weekdays: [6, 1],
      startTime: '17:00',
      endTime: '18:00',
    },
  ],
  members: [],
  students: [],
  guardians: [],
  users: [
    { id: 'o', name: { ar: 'o', en: 'o' }, role: 'owner', title: { ar: '', en: '' }, active: true },
    {
      id: 'r',
      name: { ar: 'r', en: 'r' },
      role: 'reception',
      title: { ar: '', en: '' },
      active: true,
    },
    {
      id: 't',
      name: { ar: 't', en: 't' },
      role: 'teacher',
      title: { ar: '', en: '' },
      active: true,
    },
  ],
  startDate: '2026-10-03', // Saturday
};
let n = 0;
const e = (
  at: string,
  kind: string,
  actorId: string | null,
  data: AuditRow['data'] = {},
): AuditRow => ({
  id: `a${++n}`,
  at,
  kind,
  actorId,
  text: '',
  data,
});
const log: AuditRow[] = [
  // Sat 3 Oct: session confirmed 30 min after it ended (tap).
  e('2026-10-03T15:30:00Z', 'record.confirmed', 't', {
    sessionId: 'g1~2026-10-03',
    sessionEndsAt: '2026-10-03T15:00:00Z',
    source: 'tap',
  }),
  e('2026-10-03T16:00:00Z', 'access.signed_in', 'r', { role: 'reception' }),
  // Mon 5 Oct: confirmed 2 h after the end; raises 3 flags.
  e('2026-10-05T17:00:00Z', 'record.confirmed', 't', {
    sessionId: 'g1~2026-10-05',
    sessionEndsAt: '2026-10-05T15:00:00Z',
    source: 'tap',
  }),
  e('2026-10-05T17:00:00Z', 'signal.raised', null, { caseId: 'c1', dueOn: '2026-10-05' }),
  e('2026-10-05T17:00:00Z', 'signal.raised', null, { caseId: 'c2', dueOn: '2026-10-05' }),
  e('2026-10-05T17:00:00Z', 'signal.raised', null, { caseId: 'c3', dueOn: '2026-10-05' }),
  // c1: sent by hand 1 h later (same Cairo day) → contacted by due; then an outcome.
  e('2026-10-05T18:00:00Z', 'message.sent_manually', 'r', { caseId: 'c1' }),
  e('2026-10-06T08:00:00Z', 'case.outcome', 'r', { caseId: 'c1', status: 'awaiting_confirmation' }),
  // c2: first contact next day (late) by phone, resolved.
  e('2026-10-06T09:00:00Z', 'case.outcome', 'r', { caseId: 'c2', status: 'resolved' }),
  // c3: dismissed with a reason.
  e('2026-10-06T10:00:00Z', 'case.dismissed', 'o', { caseId: 'c3', reason: 'Family trip' }),
];

describe('pilot:metrics (A8)', () => {
  const m = computeMetrics(log, world, new Date('2026-10-07T09:00:00Z')); // Wed 7 Oct, Cairo

  it('follow-up completion', () => {
    expect(m.completion.flagsRaised).toBe(3);
    expect(m.completion.casesOpened).toBe(3);
    expect(m.completion.contactedByDue).toEqual({ n: 1, of: 3 }); // c1 only (c2 was a day late)
    expect(m.completion.outcomeLogged).toEqual({ n: 2, of: 3 }); // c1, c2
    // Flag → first contact: c1 1 h, c2 16 h → median 8.5 h.
    expect(m.completion.medianHoursFlagToContact).toBe(8.5);
    expect(m.completion.dismissed).toEqual({ n: 1, of: 3, reasons: ['Family trip'] });
    // c1 is awaiting confirmation (open) and its due date has passed; c2 resolved; c3 dismissed.
    expect(m.completion.openPastDue).toEqual({ n: 1, of: 3 });
  });

  it('record keeping', () => {
    // Sat 3 and Mon 5 took place; Sat/Mon after 7 Oct have not.
    expect(m.records.sessionsScheduled).toBe(2);
    expect(m.records.withConfirmedRecord).toEqual({ n: 2, of: 2 });
    expect(m.records.medianHoursEndToConfirm).toBe(1.25); // 0.5 h and 2 h
    expect(m.records.bySource).toEqual({ tap: 2, voice: 0, mixed: 0 });
  });

  it('usage by role per Cairo day, and the daily table', () => {
    expect(m.usage.find((u) => u.day === '2026-10-03')).toEqual({
      day: '2026-10-03',
      owner: 0,
      reception: 1,
      teacher: 1,
    });
    expect(m.usage.find((u) => u.day === '2026-10-06')).toEqual({
      day: '2026-10-06',
      owner: 1,
      reception: 1,
      teacher: 0,
    });
    expect(m.daily.map((d) => d.day)).toEqual([
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ]);
    const mon = m.daily.find((d) => d.day === '2026-10-05')!;
    expect(mon).toMatchObject({
      flags: 3,
      contacts: 1,
      outcomes: 0,
      sessionsScheduled: 1,
      recordsConfirmed: 1,
    });
  });

  it('a reopened case is open again; the markdown and CSV carry the numbers and the caveats', () => {
    const reopened = computeMetrics(
      [...log, e('2026-10-06T11:00:00Z', 'case.reopened', 'o', { caseId: 'c3' })],
      world,
      new Date('2026-10-07T09:00:00Z'),
    );
    expect(reopened.completion.dismissed.n).toBe(0);
    expect(reopened.completion.openPastDue.n).toBe(2);
    const md = metricsMarkdown(m, 'مركز');
    expect(md).toContain('| Contact attempt by the due date | 1 / 3 (33%) |');
    expect(md).toContain('Novelty effect');
    expect(metricsCsv(m).split('\n')[0]).toContain('day,sessions_scheduled');
    expect(median([])).toBeNull();
  });
});
