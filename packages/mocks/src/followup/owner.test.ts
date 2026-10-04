// Rule tests for the owner-side mock endpoints (Batch 6). Test names carry rule / story IDs.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import {
  ApiError,
  fuApi,
  newIdempotencyKey,
  ownerApi,
  setApiBaseUrl,
  setApiLocale,
  setAuthToken,
  type AssistantEvent,
} from '@link/api-client';
import { handlers } from '../handlers';
import { resetMockDb, sessionsOf } from '../db';
import { cairoToday } from '../time';
import { resetFollowupDb } from './db';
import { DEMO_GROUP_ID } from './data';

const BASE = 'http://mock.link.test';
const C = 'cen-nour';
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
  setAuthToken('mock.usr-owner');
});
const as = (id: string) => setAuthToken(`mock.${id}`);
const err = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('expected an error');
};

/** Teacher confirms today's record with Mariam absent → her consecutive_absences flag. */
async function raiseMariam() {
  as('usr-salma');
  const s = sessionsOf(DEMO_GROUP_ID)
    .filter((x) => x.date <= cairoToday())
    .at(-1)!;
  const r = await fuApi.openRecord(DEMO_GROUP_ID, s.id);
  await fuApi.saveDraft(r.id, {
    entries: r.entries.map((e) => ({
      studentId: e.student.id,
      attendance: e.student.id === 'chd-mariam' ? 'absent' : 'present',
    })),
  });
  await fuApi.confirmRecord(r.id, newIdempotencyKey());
  as('usr-owner');
  return (await fuApi.cases()).data.find((c) => c.student.id === 'chd-mariam')!;
}

async function turn(text: string) {
  const events: AssistantEvent[] = [];
  await ownerApi.assistantTurn(text, (e) => events.push(e));
  return events;
}

describe('A01 Today (FUP-DSH-01)', () => {
  it('counts follow-ups due, overdue with owners, missing and complete records', async () => {
    const d = await ownerApi.today(C);
    expect(d.overdue.count).toBe(1); // Nour: due before today, no contact yet
    expect(d.overdue.owners.map((o) => o.displayName)).toEqual(['Dina Adel']);
    expect(d.missingRecords.missing + d.recordsComplete.confirmed).toBe(d.missingRecords.eligible);
    expect(d.keepComplete.length).toBe(d.missingRecords.missing);
  });

  it('FUP-CAS-05: "Simulate a new day" makes a case due today overdue', async () => {
    await raiseMariam();
    expect((await ownerApi.today(C)).overdue.count).toBe(1);
    await fetch(`${BASE}/__demo/new-day`, { method: 'POST', body: '{}' });
    expect((await ownerApi.today(C)).overdue.count).toBe(2);
  });
});

describe('A03 case (FUP-CAS-02, FUP-CAS-04)', () => {
  it('default assignee and same-day due come from the rule', async () => {
    const c = await raiseMariam();
    expect(c.assignee.displayName).toBe('Dina Adel');
    expect(c.dueOn).toBe(cairoToday());
    expect(c.signal.evidence).toHaveLength(2);
  });

  it('dismissing needs a reason; the flag stays in history and can be reopened', async () => {
    const c = await raiseMariam();
    expect((await err(fuApi.dismissCase(c.id, '  '))).code).toBe('reason_required');
    const d = await fuApi.dismissCase(c.id, 'Planned family trip');
    expect(d.status).toBe('dismissed');
    expect(d.signal.status).toBe('dismissed');
    const r = await fuApi.reopenCase(c.id);
    expect(r.status).toBe('open');
    const log = await ownerApi.activity(C);
    expect(log.events.some((e) => e.text.includes('Planned family trip'))).toBe(true);
  });
});

describe('A06 / V04 / A09 messages (FUP-MSG-01..03)', () => {
  it('an approved message is locked; changing it starts a new draft (the old one keeps its status)', async () => {
    const c = await raiseMariam();
    const m = await fuApi.draftMessage(c.id);
    await fuApi.approveMessage(m.id, { checked: true });
    expect((await err(fuApi.editMessage(m.id, { text: 'changed' }))).code).toBe('message_locked');
    const n = await ownerApi.reviseMessage(m.id);
    expect(n.status).toBe('draft');
    expect(n.id).not.toBe(m.id);
    expect((await fuApi.message(m.id)).status).toBe('queued');
  });

  it('FUP-MSG-08 / OD-41: the parent feed shows approved messages only, never drafts', async () => {
    const c = await raiseMariam();
    const m = await fuApi.draftMessage(c.id);
    as('usr-parent');
    expect((await ownerApi.parentUpdates()).data).toHaveLength(0);
    as('usr-owner');
    await fuApi.approveMessage(m.id, { checked: true });
    as('usr-parent');
    const feed = (await ownerApi.parentUpdates()).data;
    expect(feed).toHaveLength(1);
    expect(feed[0]!.studentId).toBe('chd-mariam');
  });
});

describe('A07 rules (FUP-RUL-01, FUP-RUL-02)', () => {
  it('four rules with the 03 §3 defaults; only consecutive_absences is on; Rule v1', async () => {
    const rules = await ownerApi.rules(C);
    expect(rules.map((r) => [r.code, r.active, r.version])).toEqual([
      ['consecutive_absences', true, 1],
      ['score_decline', false, 1],
      ['low_participation', false, 1],
      ['repeated_concern', false, 1],
    ]);
    expect(rules[0]!.params).toEqual({ n: 2 });
    expect(rules[1]!.params).toEqual({ k: 2, drop: 10, minScores: 3 });
    expect(rules[0]!.example).toMatch(/consecutive scheduled sessions/);
  });

  it('a staff change is a proposal until the owner approves it', async () => {
    as('usr-reception');
    const p = await ownerApi.changeRule(C, 'consecutive_absences', {
      active: true,
      params: { n: 3 },
      scope: 'all',
    });
    expect(p.version).toBe(1);
    expect(p.params.n).toBe(2);
    expect(p.proposal?.params.n).toBe(3);
    expect((await err(ownerApi.approveRule(C, 'consecutive_absences'))).problem.status).toBe(403);
    as('usr-owner');
    const a = await ownerApi.approveRule(C, 'consecutive_absences');
    expect(a.version).toBe(2);
    expect(a.params.n).toBe(3);
    expect(a.proposal).toBeNull();
  });

  it('BR-APR-09 for parameters: a zero or fractional parameter is blocked, never adjusted', async () => {
    expect(
      (
        await err(
          ownerApi.changeRule(C, 'consecutive_absences', {
            active: true,
            params: { n: 0 },
            scope: 'all',
          }),
        )
      ).code,
    ).toBe('validation_failed');
  });
});

describe('A16 staff, A17 activity', () => {
  it('only the owner invites; the phone must be Egyptian', async () => {
    as('usr-reception');
    expect(
      (await err(ownerApi.invite(C, { phone: '+201000000077', role: 'teacher' }))).problem.status,
    ).toBe(403);
    as('usr-owner');
    expect((await err(ownerApi.invite(C, { phone: '12345', role: 'teacher' }))).code).toBe(
      'invalid_phone',
    );
    const list = await ownerApi.invite(C, { phone: '+201000000077', role: 'teacher' });
    expect(list.at(-1)!.status).toBe('invite_pending');
  });

  it('Reset scenario clears pending invites (they are part of the scenario)', async () => {
    await ownerApi.invite(C, { phone: '+201000000077', role: 'teacher' });
    resetFollowupDb();
    expect((await ownerApi.staff(C)).some((m) => m.status === 'invite_pending')).toBe(false);
  });

  it('FUP-DSH-04: the log is append-only with weekly counts', async () => {
    const before = (await ownerApi.activity(C)).events.length;
    await raiseMariam();
    const after = await ownerApi.activity(C);
    expect(after.events.length).toBeGreaterThan(before);
    expect(after.week.followUpsOpened).toBeGreaterThanOrEqual(1);
    expect(after.week.corrections).toBeGreaterThanOrEqual(0);
  });
});

describe('Ask Link (FUP-DSH-05)', () => {
  it('Draft tier: "send Mariam\'s guardian a note" creates a draft from confirmed facts — nothing is sent', async () => {
    await raiseMariam();
    const ev = await turn('ابعت لولي أمر مريم إنها غابت حصتين، وإننا عايزين نطمن عليها');
    expect(ev.find((e) => e.type === 'tier')).toEqual({ type: 'tier', tier: 'draft' });
    const d = ev.find((e) => e.type === 'draft') as Extract<AssistantEvent, { type: 'draft' }>;
    expect(d.evidence).toHaveLength(2);
    expect((await fuApi.message(d.messageId)).status).toBe('draft');
  });

  it('Act tier never acts: "send it now" needs approval', async () => {
    const ev = await turn('approve and send it now');
    expect(ev.find((e) => e.type === 'tier')).toEqual({ type: 'tier', tier: 'act' });
    expect(ev.some((e) => e.type === 'needs_approval')).toBe(true);
    expect((await fuApi.messages()).data).toHaveLength(0);
  });

  it('never guesses a student: "Ahmed" matches two students, so it asks', async () => {
    const ev = await turn('Send Ahmed a note');
    const text = ev
      .filter((e) => e.type === 'token')
      .map((e) => (e as { text: string }).text)
      .join('');
    expect(text).toMatch(/Ahmed Samir.*Ahmed Samy|Ahmed Samy.*Ahmed Samir/);
    expect((await fuApi.messages()).data).toHaveLength(0);
  });

  it('acts as the signed-in user: a teacher cannot use the staff assistant', async () => {
    as('usr-salma');
    await expect(turn('Who has not been contacted this week?')).rejects.toBeInstanceOf(ApiError);
  });
});
