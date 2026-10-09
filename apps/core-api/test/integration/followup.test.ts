// pnpm test:api — R3 follow-up on the real backend (07 §2b–§2d): records and corrections, the rules
// engine (versions, proposals, dedupe), cases, parent messages with the WhatsApp fake (status only
// from signed provider events), voice notes through storage and ai-service, the Follow-up extra
// enforced on the server, and Ask Link off in live mode. Test names carry requirement IDs.
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoId } from '../../seeds/demo';
import { FieldCipher, LocalKeyWrapper, lookupHmac } from '../../src/platform/crypto';
import { uuidv7 } from '../../src/platform/ids';
import { createServer } from 'node:http';
import { ManualSender } from '../../src/adapters/whatsapp';
import { Assistant } from '../../src/followup/assistant';
import { Messages } from '../../src/followup/messages';
import { Phones } from '../../src/identity/phone';
import { createLogger } from '../../src/platform/logger';
import { AI_TOKEN, type Api, Client, PHONES, startApi } from '../helpers';

let api: Api;
const teacher = () => clients.teacher;
const owner = () => clients.owner;
const reception = () => clients.reception;
const clients = {} as Record<'teacher' | 'owner' | 'reception' | 'parent', Client>;
const WS = demoId('grp-salma-ws');
const NOUR = demoId('cen-nour');
const code = (r: { body: unknown }) => (r.body as { code?: string }).code;

beforeAll(async () => {
  api = await startApi();
  for (const [k, phone] of [
    ['teacher', PHONES.teacher],
    ['owner', PHONES.owner],
    ['reception', PHONES.reception],
    ['parent', PHONES.parent],
  ] as const) {
    clients[k] = new Client(api);
    await clients[k].signIn(phone);
  }
}, 120_000);
afterAll(() => api.close());

/** The group's latest session that took place (the one the seed left open, as the mock does). */
async function latestSession(groupId = WS) {
  const { rows } = await sql<{ id: string; day: string }>`
    SELECT id, market.session_day(starts_at)::text AS day FROM market.group_sessions
    WHERE group_id = ${groupId} AND status NOT IN ('cancelled', 'not_held')
      AND market.session_day(starts_at) <= (now() AT TIME ZONE 'Africa/Cairo')::date
    ORDER BY starts_at DESC LIMIT 1`.execute(api.db);
  return rows[0]!;
}
async function seededCase() {
  const c = await api.db
    .selectFrom('followup.cases')
    .select(['id', 'student_id', 'signal_id'])
    .where('group_id', '=', WS)
    .orderBy('created_at')
    .executeTakeFirstOrThrow();
  return c;
}
interface Rec {
  id: string;
  status: string;
  entries: { id: string; student: { id: string }; attendance: string; score: number | null }[];
  signals: { id: string; rule: string; status: string; student: { id: string } }[];
}

describe('Records (FUP-REC-01…08, BR-APR-01/07/08/09)', () => {
  let recordId = '';
  it('FUP-REC-01: Today shows reminders only from confirmed observations, with their source', async () => {
    const r = await teacher().call<{
      reminders: { text: string; source: { recordId: string } }[];
      recordDue: { groupId: string } | null;
    }>('GET', '/v1/teachers/me/today');
    expect(r.status).toBe(200);
    expect(r.body.reminders.some((x) => x.text.includes('قواعد الإشارات'))).toBe(true);
    expect(r.body.recordDue).not.toBeNull();
  });

  it('FUP-REC-09: the roster is the paid seats; `none` = no confirmed record; open flags shown', async () => {
    const c = await seededCase();
    const r = await teacher().call<
      { student: { id: string }; lastSessions: string[]; flags: { rule: string }[] }[]
    >('GET', `/v1/groups/${WS}/roster`);
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(5);
    const row = r.body.find((x) => x.student.id === c.student_id)!;
    expect(row.flags.map((f) => f.rule)).toEqual(['consecutive_absences']);
    // The latest session has no confirmed record yet: "none", never "absent" (BR-APR-07).
    expect(row.lastSessions.at(-1)).toBe('none');
  });

  it('FUP-REC-02: a draft opens for a session that took place; everyone starts "not recorded"', async () => {
    const s = await latestSession();
    const a = await teacher().call<Rec>('POST', `/v1/groups/${WS}/session-records`, {
      groupSessionId: s.id,
    });
    expect(a.status).toBe(201);
    expect(a.body.entries.every((e) => e.attendance === 'not_recorded')).toBe(true);
    const b = await teacher().call<Rec>('POST', `/v1/groups/${WS}/session-records`, {
      groupSessionId: s.id,
    });
    expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
    recordId = a.body.id;
    // A future session cannot be recorded.
    const { rows } = await sql<{ id: string }>`SELECT id FROM market.group_sessions
      WHERE group_id = ${WS} AND starts_at > now() + interval '2 days' ORDER BY starts_at LIMIT 1`.execute(
      api.db,
    );
    const f = await teacher().call('POST', `/v1/groups/${WS}/session-records`, {
      groupSessionId: rows[0]!.id,
    });
    expect(code(f)).toBe('session_not_recordable');
    // Only the group's teacher writes records (BR-APR-01).
    expect(
      (await owner().call('POST', `/v1/groups/${WS}/session-records`, { groupSessionId: s.id }))
        .status,
    ).toBe(403);
  });

  it('BR-APR-09: a score above the maximum is blocked, never capped; no score for an absence', async () => {
    const rec = (await teacher().call<Rec>('GET', `/v1/session-records/${recordId}`)).body;
    const [x, y] = rec.entries;
    const noAssessment = await teacher().call('PATCH', `/v1/session-records/${recordId}`, {
      entries: [{ studentId: x!.student.id, attendance: 'present', score: 5 }],
    });
    expect(code(noAssessment)).toBe('assessment_required');
    const over = await teacher().call('PATCH', `/v1/session-records/${recordId}`, {
      assessment: { title: 'Quiz', series: 'sign-rules-practice', maxScore: 20 },
      entries: [{ studentId: x!.student.id, attendance: 'present', score: 21 }],
    });
    expect(over.status).toBe(422);
    expect(over.body).toMatchObject({ code: 'score_out_of_range', value: 21, max: 20 });
    const absent = await teacher().call('PATCH', `/v1/session-records/${recordId}`, {
      assessment: { title: 'Quiz', series: 'sign-rules-practice', maxScore: 20 },
      entries: [{ studentId: y!.student.id, attendance: 'absent', score: 3 }],
    });
    expect(code(absent)).toBe('score_for_absent');
    const stranger = await teacher().call('PATCH', `/v1/session-records/${recordId}`, {
      entries: [{ studentId: uuidv7(), attendance: 'present' }],
    });
    expect(code(stranger)).toBe('unknown_student');
    // The database itself refuses an over-maximum score, whatever writes it (INV-10).
    const entry = await api.db
      .selectFrom('records.record_entries')
      .select('id')
      .where('session_record_id', '=', recordId)
      .executeTakeFirstOrThrow();
    const asm = uuidv7();
    await api.db
      .insertInto('records.assessments')
      .values({
        id: asm,
        group_id: WS,
        centre_id: NOUR,
        title: 'x',
        max_score: '10',
        taken_on: '2026-01-01',
      })
      .execute();
    await expect(
      api.db
        .updateTable('records.record_entries')
        .set({ score: '11', assessment_id: asm })
        .where('id', '=', entry.id)
        .execute(),
    ).rejects.toThrow(/above the maximum/);
  });

  it('FUP-REC-05/07, FUP-RUL-03, INV-08: confirm runs the rules once; the same key replays; one flag per student', async () => {
    const c = await seededCase();
    const rec = (await teacher().call<Rec>('GET', `/v1/session-records/${recordId}`)).body;
    const save = await teacher().call<Rec>('PATCH', `/v1/session-records/${recordId}`, {
      assessment: { title: 'Quiz', series: 'sign-rules-practice', maxScore: 20 },
      entries: rec.entries.map((e, i) => ({
        studentId: e.student.id,
        attendance: e.student.id === c.student_id ? 'absent' : 'present',
        score: e.student.id === c.student_id ? null : i < 3 ? 14 : null,
      })),
    });
    expect(save.status).toBe(200);
    // Drafts never trigger rules (BR-APR-08): still exactly one flag for this student.
    const before = await api.db
      .selectFrom('followup.signals')
      .select(['id', 'evidence'])
      .where('student_id', '=', c.student_id)
      .execute();
    expect(before).toHaveLength(1);
    const key = `confirm-${uuidv7()}`;
    const r = await teacher().call<Rec>(
      'POST',
      `/v1/session-records/${recordId}/confirm`,
      undefined,
      {
        'idempotency-key': key,
      },
    );
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('confirmed');
    // The open flag got the new evidence; no second flag (INV-08).
    const after = await api.db
      .selectFrom('followup.signals')
      .select(['id', 'evidence'])
      .where('student_id', '=', c.student_id)
      .execute();
    expect(after.map((s) => s.id)).toEqual(before.map((s) => s.id));
    expect((after[0]!.evidence as { recordIds: string[] }).recordIds).toContain(recordId);
    expect(r.body.signals.map((s) => s.student.id)).toContain(c.student_id);
    // A retry with the same key replays the same answer (FUP-REC-07 AC3).
    const again = await teacher().call<Rec>(
      'POST',
      `/v1/session-records/${recordId}/confirm`,
      undefined,
      {
        'idempotency-key': key,
      },
    );
    expect(again.headers.get('idempotent-replayed')).toBe('true');
    expect(again.body.id).toBe(recordId);
    const other = await teacher().call('POST', `/v1/session-records/${recordId}/confirm`);
    expect(code(other)).toBe('record_confirmed');
    const patch = await teacher().call('PATCH', `/v1/session-records/${recordId}`, { entries: [] });
    expect(code(patch)).toBe('record_confirmed');
  });

  it('INV-09: a confirmed entry changes only through a correction (the database refuses a direct edit)', async () => {
    await expect(
      api.db
        .updateTable('records.record_entries')
        .set({ attendance: 'late' })
        .where('session_record_id', '=', recordId)
        .execute(),
    ).rejects.toThrow(/add a correction/);
  });

  it('FUP-REC-08: a correction keeps the original and resolves a flag that no longer applies', async () => {
    const c = await seededCase();
    const rec = (await teacher().call<Rec>('GET', `/v1/session-records/${recordId}`)).body;
    const e = rec.entries.find((x) => x.student.id === c.student_id)!;
    const noReason = await teacher().call('POST', `/v1/record-entries/${e.id}/corrections`, {
      field: 'attendance',
      newValue: 'present',
      reason: ' ',
    });
    expect(code(noReason)).toBe('reason_required');
    const fix = await teacher().call<{ oldValue: string; newValue: string }>(
      'POST',
      `/v1/record-entries/${e.id}/corrections`,
      { field: 'attendance', newValue: 'present', reason: 'She came late, I tapped the wrong one' },
    );
    expect(fix.status).toBe(201);
    expect(fix.body).toMatchObject({ oldValue: 'absent', newValue: 'present' });
    const sig = await api.db
      .selectFrom('followup.signals')
      .select('status')
      .where('id', '=', c.signal_id)
      .executeTakeFirstOrThrow();
    expect(sig.status).toBe('resolved_by_correction');
    const timeline = await owner().call<{ timeline: { kind: string }[] }>(
      'GET',
      `/v1/cases/${c.id}`,
    );
    expect(timeline.body.timeline.map((t) => t.kind)).toContain('resolved_by_correction');
    // Append-only (INV-02).
    await expect(sql`UPDATE records.corrections SET reason = 'x'`.execute(api.db)).rejects.toThrow(
      /append-only/,
    );
    const view = (
      await teacher().call<{ corrections: unknown[] }>('GET', `/v1/session-records/${recordId}`)
    ).body;
    expect(view.corrections).toHaveLength(1);
  });

  it('CF-34: the owner asks for a correction; only the teacher corrects; a correction closes the request', async () => {
    const r = await owner().call<{ id: string; status: string }>(
      'POST',
      `/v1/session-records/${recordId}/correction-requests`,
      { text: 'Please check the quiz scores.' },
    );
    expect(r.status).toBe(201);
    expect(
      (
        await reception().call('POST', `/v1/session-records/${recordId}/correction-requests`, {
          text: 'x',
        })
      ).status,
    ).toBe(403);
    const today = await teacher().call<{ correctionRequests: { id: string }[] }>(
      'GET',
      '/v1/teachers/me/today',
    );
    expect(today.body.correctionRequests.map((q) => q.id)).toContain(r.body.id);
    const close = await teacher().call<{ status: string }>(
      'POST',
      `/v1/correction-requests/${r.body.id}/close`,
    );
    expect(close.body.status).toBe('done');
  });
});

describe('Rules (FUP-RUL-01/02/03, BR-APR-12)', () => {
  it('FUP-RUL-02: a staff change is a proposal; only the owner approves; each version is kept', async () => {
    const before = await owner().call<{ code: string; version: number }[]>(
      'GET',
      `/v1/centres/${NOUR}/rules`,
    );
    const rc = before.body.find((r) => r.code === 'repeated_concern')!;
    const bad = await reception().call('PUT', `/v1/centres/${NOUR}/rules/repeated_concern`, {
      active: true,
      params: { count: 0, windowDays: 30 },
      scope: 'all',
    });
    expect(code(bad)).toBe('validation_failed');
    const p = await reception().call<{ version: number; active: boolean; proposal: unknown }>(
      'PUT',
      `/v1/centres/${NOUR}/rules/repeated_concern`,
      { active: true, params: { count: 3, windowDays: 30 }, scope: 'all' },
    );
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ version: rc.version, active: false });
    expect(p.body.proposal).not.toBeNull();
    expect(
      (await reception().call('POST', `/v1/centres/${NOUR}/rules/repeated_concern/approve`)).status,
    ).toBe(403);
    const ok = await owner().call<{ version: number; active: boolean; history: unknown[] }>(
      'POST',
      `/v1/centres/${NOUR}/rules/repeated_concern/approve`,
    );
    expect(ok.body).toMatchObject({ version: rc.version + 1, active: true });
    expect(ok.body.history).toHaveLength(2);
    expect(
      code(await owner().call('POST', `/v1/centres/${NOUR}/rules/repeated_concern/approve`)),
    ).toBe('no_proposal');
  });

  it('BR-APR-08 / FUP-RUL-03: three saved notes on the same topic raise `repeated_concern` (v2)', async () => {
    const roster = (
      await teacher().call<{ student: { id: string } }[]>('GET', `/v1/groups/${WS}/roster`)
    ).body;
    const student = roster.at(-1)!.student.id;
    const long = await teacher().call('POST', `/v1/students/${student}/notes`, {
      groupId: WS,
      tag: 'behaviour',
      body: 'x'.repeat(501),
    });
    expect(code(long)).toBe('too_long');
    for (let i = 0; i < 3; i++) {
      const n = await teacher().call('POST', `/v1/students/${student}/notes`, {
        groupId: WS,
        tag: 'behaviour',
        body: `Talked over the class (${i + 1})`,
      });
      expect(n.status).toBe(201);
    }
    const sig = await api.db
      .selectFrom('followup.signals')
      .select(['rule_code', 'rule_version', 'explanation_en', 'status'])
      .where('student_id', '=', student)
      .where('rule_code', '=', 'repeated_concern')
      .execute();
    expect(sig).toHaveLength(1);
    expect(sig[0]).toMatchObject({ rule_version: 2, status: 'case_opened' });
    expect(sig[0]!.explanation_en).toMatch(/Behaviour" noted 3 times/);
  });
});

/** The seeded absentee's guardian gets a phone and WhatsApp opt-in (sample data). */
async function optIn(guardianId: string, phone: string) {
  const cipher = new FieldCipher(new LocalKeyWrapper(api.config.FIELD_KEY_LOCAL!));
  await api.db
    .updateTable('org.guardians')
    .set({
      phone_encrypted: cipher.encrypt(phone),
      phone_hmac: lookupHmac(api.config.HMAC_KEY_LOOKUP, phone),
    })
    .where('id', '=', guardianId)
    .execute();
  await api.db
    .insertInto('org.consent_events')
    .values({
      id: uuidv7(),
      guardian_id: guardianId,
      kind: 'whatsapp_updates',
      granted: true,
      version: 'test',
      source: 'settings',
    })
    .execute();
}

describe('Cases and parent messages (FUP-CAS, FUP-MSG, BR-APR-02/10/11, BR-DAT-02)', () => {
  let caseId = '';
  let messageId = '';
  const phone = '+201066000001';
  it('FUP-RUL-03, FUP-CAS-02: two confirmed absences raise a flag; Reception sees the rule, version, dates', async () => {
    // Ms Salma's Friday group: its two latest sessions are recorded, one student absent in both.
    const FRI = demoId('grp-salma-fri');
    const { rows: two } = await sql<{ id: string }>`
      SELECT id FROM market.group_sessions WHERE group_id = ${FRI} AND status NOT IN ('cancelled', 'not_held')
        AND market.session_day(starts_at) <= (now() AT TIME ZONE 'Africa/Cairo')::date
      ORDER BY starts_at DESC LIMIT 2`.execute(api.db);
    let absentee = '';
    for (const s of [...two].reverse()) {
      const rec = (
        await teacher().call<Rec>('POST', `/v1/groups/${FRI}/session-records`, {
          groupSessionId: s.id,
        })
      ).body;
      absentee ||= rec.entries[0]!.student.id;
      await teacher().call('PATCH', `/v1/session-records/${rec.id}`, {
        entries: rec.entries.map((e) => ({
          studentId: e.student.id,
          attendance: e.student.id === absentee ? 'absent' : 'present',
        })),
      });
      const c = await teacher().call<Rec>('POST', `/v1/session-records/${rec.id}/confirm`);
      expect(c.status).toBe(200);
    }
    const open = await api.db
      .selectFrom('followup.cases')
      .select(['id', 'student_id'])
      .where('group_id', '=', FRI)
      .where('student_id', '=', absentee)
      .executeTakeFirstOrThrow();
    caseId = open.id;
    const all = await reception().call<{ data: { id: string }[] }>('GET', '/v1/cases');
    expect(all.body.data.map((c) => c.id)).toContain(caseId);
    const c = await reception().call<{
      signal: {
        ruleText: string;
        ruleVersion: number;
        explanation: string;
        evidence: { attendance: string; confirmedBy: { displayName: string } }[];
      };
      assignee: { role: string };
      dueOn: string;
    }>('GET', `/v1/cases/${caseId}`);
    expect(c.body.signal.ruleText).toMatch(/Rule v1/);
    expect(c.body.signal.explanation).toMatch(/^Absent from two consecutive scheduled sessions/);
    expect(c.body.signal.evidence.map((e) => e.attendance)).toEqual(['absent', 'absent']);
    expect(c.body.assignee.role).toBe('Reception');
    const e = await api.db
      .selectFrom('market.enrolments')
      .select('guardian_id')
      .where('student_id', '=', open.student_id)
      .executeTakeFirstOrThrow();
    await optIn(e.guardian_id, phone);
  });

  it('FUP-MSG-01/02: a draft from confirmed facts; approval needs messages.approve and the tick; then locked', async () => {
    const d = await reception().call<{
      id: string;
      status: string;
      groundedFacts: unknown[];
      draft: string;
    }>('POST', '/v1/messages/drafts', { caseId, tone: 'neutral' });
    expect(d.status).toBe(201);
    expect(d.body.status).toBe('draft');
    expect(d.body.groundedFacts.length).toBeGreaterThan(0);
    messageId = d.body.id;
    const noTick = await reception().call('POST', `/v1/messages/${messageId}/approve`, {});
    expect(code(noTick)).toBe('check_required');
    // A teacher (no centre role) cannot approve.
    expect(
      (await teacher().call('POST', `/v1/messages/${messageId}/approve`, { checked: true })).status,
    ).toBe(404);
    const a = await reception().call<{ status: string; channel: string; finalText: string }>(
      'POST',
      `/v1/messages/${messageId}/approve`,
      { checked: true },
    );
    expect(a.body).toMatchObject({ status: 'queued', channel: 'whatsapp' });
    const edit = await reception().call('PATCH', `/v1/messages/${messageId}`, { text: 'changed' });
    expect(code(edit)).toBe('message_locked');
    await expect(
      api.db
        .updateTable('messaging.messages')
        .set({ final_text: 'x' })
        .where('id', '=', messageId)
        .execute(),
    ).rejects.toThrow(/locked/);
    // FUP-MSG-03 AC4: sending logs an attempt; the case stays open.
    const c = await reception().call<{ status: string; attempts: { result: string }[] }>(
      'GET',
      `/v1/cases/${caseId}`,
    );
    expect(c.body.status).toBe('in_progress');
    expect(c.body.attempts.map((x) => x.result)).toContain('message_sent');
  });

  it('BR-APR-11: the status moves only on signed provider events (sent → delivered); a bad signature is refused', async () => {
    expect(await api.s.messages.send(messageId)).toBe('handed_over');
    const m = await api.db
      .selectFrom('messaging.messages')
      .select(['provider_message_id', 'delivery_status'])
      .where('id', '=', messageId)
      .executeTakeFirstOrThrow();
    expect(m.delivery_status).toBe('queued'); // handed over is not "sent"
    expect(api.wa.messages.get(m.provider_message_id!)!.to).toBe(phone);
    // A sending retry never sends twice (the provider dedupes on Link's message ID).
    expect(await api.s.messages.send(messageId)).toBe('skipped');
    const forged = await fetch(`${api.base}/v1/webhooks/messaging/whatsapp-fake`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-whatsapp-fake-signature': 'sha256=00' },
      body: JSON.stringify({
        eventId: 'x',
        type: 'status',
        messageId: m.provider_message_id,
        status: 'read',
      }),
    });
    expect(forged.status).toBe(401);
    for (const status of ['sent', 'delivered']) {
      const r = await fetch(`${api.waBase}/v1/messages/${m.provider_message_id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      expect(r.status).toBe(200);
    }
    const msg = await reception().call<{ status: string; history: { status: string }[] }>(
      'GET',
      `/v1/messages/${messageId}`,
    );
    expect(msg.body.status).toBe('delivered');
    expect(msg.body.history.map((h) => h.status)).toEqual([
      'draft',
      'approved',
      'queued',
      'sent',
      'delivered',
    ]);
    // A duplicate delivery of the same event changes nothing.
    const last = api.wa.sent.at(-1)!;
    await fetch(`${api.waBase}/v1/test-controls/redeliver`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventId: last.eventId }),
    });
    const n = await api.db
      .selectFrom('messaging.message_status_events')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('message_id', '=', messageId)
      .executeTakeFirstOrThrow();
    expect(n.n).toBe(5);
  });

  it('FUP-MSG-05, BR-DAT-02: a reply joins the case; STOP takes effect at once — the next approval is not sendable', async () => {
    await fetch(`${api.waBase}/v1/inbound`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: phone, body: 'عندها درس تاني الأربع' }),
    });
    const m = await reception().call<{ replies: { body: string }[] }>(
      'GET',
      `/v1/messages/${messageId}`,
    );
    expect(m.body.replies.map((r) => r.body)).toEqual(['عندها درس تاني الأربع']);
    await fetch(`${api.waBase}/v1/inbound`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: phone, body: 'STOP' }),
    });
    const next = await reception().call<{ id: string }>('POST', `/v1/messages/${messageId}/revise`);
    expect(next.status).toBe(201);
    const a = await reception().call<{ status: string; guardian: { stopped: boolean } }>(
      'POST',
      `/v1/messages/${next.body.id}/approve`,
      { checked: true },
    );
    expect(a.body).toMatchObject({ status: 'not_sendable', guardian: { stopped: true } });
  });

  it('OD-56 manual path: "I sent it" is a contact attempt by that person, never a delivery', async () => {
    const cipher = new FieldCipher(new LocalKeyWrapper(api.config.FIELD_KEY_LOCAL!));
    const manual = new Messages(
      api.s.db,
      new ManualSender(),
      new Phones(api.config.HMAC_KEY_LOOKUP, cipher),
      createLogger('silent', 'test'),
    );
    const d = await reception().call<{ id: string }>('POST', '/v1/messages/drafts', { caseId });
    const recUser = (await reception().call<{ id: string }>('GET', '/v1/me')).body.id;
    const a = await manual.approve(recUser, d.body.id, { checked: true }, 'en');
    expect(a).toMatchObject({ status: 'approved', channel: null });
    const m = await manual.sentManually(recUser, d.body.id, 'en');
    expect(m.status).toBe('approved'); // never Delivered or Read (BR-APR-11)
    expect(m.sentManually?.by.id).toBe(recUser);
    await expect(manual.sentManually(recUser, d.body.id, 'en')).rejects.toMatchObject({
      code: 'already_sent',
    });
    const c = await reception().call<{ attempts: { channel: string; messageId: string }[] }>(
      'GET',
      `/v1/cases/${caseId}`,
    );
    expect(c.body.attempts.find((x) => x.messageId === d.body.id)?.channel).toBe('whatsapp_manual');
    // With a provider that sends, "I sent it" is refused: Link sends, and only provider events count.
    const queued = await reception().call('POST', `/v1/messages/${messageId}/sent-manually`);
    expect(code(queued)).toBe('not_approved');
  });

  it('FUP-CAS-03/04, BR-APR-10: an outcome keeps the case open; dismiss needs a reason; reopen', async () => {
    const o = await reception().call<{ status: string }>('POST', `/v1/cases/${caseId}/attempts`, {
      channel: 'phone',
      result: 'reached',
      learned: 'Family trip, back on Saturday.',
    });
    expect(o.status).toBe(201);
    expect(o.body.status).toBe('awaiting_confirmation');
    expect(
      code(await reception().call('POST', `/v1/cases/${caseId}/dismiss`, { reason: '' })),
    ).toBe('reason_required');
    const d = await reception().call<{ status: string; dismissReason: string }>(
      'POST',
      `/v1/cases/${caseId}/dismiss`,
      { reason: 'Planned family trip' },
    );
    expect(d.body).toMatchObject({ status: 'dismissed', dismissReason: 'Planned family trip' });
    expect(
      code(
        await reception().call('POST', `/v1/cases/${caseId}/attempts`, {
          channel: 'phone',
          result: 'reached',
        }),
      ),
    ).toBe('case_closed');
    const r = await reception().call<{ status: string }>('POST', `/v1/cases/${caseId}/reopen`);
    expect(r.body.status).toBe('open');
  });

  it('A17 (FUP-DSH-04): the activity log reads the append-only audit; A01 counts from confirmed records', async () => {
    const a = await owner().call<{
      events: { kind: string; text: string }[];
      week: { recordsConfirmed: number };
    }>('GET', `/v1/centres/${NOUR}/activity`);
    expect(a.status).toBe(200);
    expect(a.body.week.recordsConfirmed).toBeGreaterThan(0);
    expect(new Set(a.body.events.map((e) => e.kind))).toEqual(
      new Set(['records', 'followups', 'messages', 'corrections', 'access']),
    );
    const t = await owner().call<{ recordsComplete: { confirmed: number; eligible: number } }>(
      'GET',
      `/v1/centres/${NOUR}/today`,
    );
    expect(t.body.recordsComplete.confirmed).toBeGreaterThan(0);
    expect(t.body.recordsComplete.eligible).toBeGreaterThanOrEqual(
      t.body.recordsComplete.confirmed,
    );
    const s = await reception().call<{ data: unknown[] }>('GET', `/v1/centres/${NOUR}/students`);
    expect(s.body.data.length).toBeGreaterThan(0);
  });
});

describe('Voice notes (FUP-VOI, docs/09, ADR-0007)', () => {
  let recordId = '';
  let voiceId = '';
  let uploadUrl = '';
  it('FUP-VOI-01/02: a note gets a short-lived signed upload; the audio goes to encrypted storage', async () => {
    // A draft for one of the other groups' latest sessions.
    const s = await latestSession(demoId('grp-salma-st'));
    const rec = await teacher().call<Rec>(
      'POST',
      `/v1/groups/${demoId('grp-salma-st')}/session-records`,
      {
        groupSessionId: s.id,
      },
    );
    recordId = rec.body.id;
    const key = `vn-${uuidv7()}`;
    const v = await teacher().call<{ id: string; uploadUrl: string; status: string }>(
      'POST',
      '/v1/voice-notes',
      { sessionRecordId: recordId, durationS: 42 },
      { 'idempotency-key': key },
    );
    expect(v.status).toBe(201);
    voiceId = v.body.id;
    uploadUrl = v.body.uploadUrl;
    expect(uploadUrl).toMatch(/\/audio\?exp=\d+&sig=/);
    const forged = await fetch(`${api.base}${uploadUrl.replace(/sig=[^&]+/, 'sig=AAAA')}`, {
      method: 'PUT',
      headers: { 'content-type': 'audio/mp4' },
      body: new Uint8Array([1, 2, 3]),
    });
    expect(forged.status).toBe(403);
    expect(code(await teacher().call('POST', `/v1/voice-notes/${voiceId}/uploaded`))).toBe(
      'not_uploaded',
    );
    const put = await fetch(`${api.base}${uploadUrl}`, {
      method: 'PUT',
      headers: { 'content-type': 'audio/mp4' },
      body: new Uint8Array(2048).fill(7),
    });
    expect(put.status).toBe(200);
    const row = await api.db
      .selectFrom('records.voice_notes')
      .select(['audio_key', 'data_class', 'delete_after', 'uploaded_at'])
      .where('id', '=', voiceId)
      .executeTakeFirstOrThrow();
    expect(api.audio.objects.get(row.audio_key!)!.bytes.length).toBe(2048);
    expect(row.data_class).toBe('synthetic'); // local: sample audio only
    expect(row.delete_after!.getTime() - row.uploaded_at!.getTime()).toBe(30 * 86_400_000);
  });

  it('FUP-VOI-02: `voice.uploaded` hands the audio and the session roster to ai-service', async () => {
    const u = await teacher().call<{ status: string }>(
      'POST',
      `/v1/voice-notes/${voiceId}/uploaded`,
    );
    expect(u.body.status).toBe('transcribing');
    const ev = await api.db
      .selectFrom('platform.outbox_events')
      .select('type')
      .where('aggregate_id', '=', voiceId)
      .execute();
    expect(ev.map((e) => e.type)).toEqual(['voice.uploaded']);
    expect(await api.s.voice.dispatch(voiceId)).toBe('submitted');
    const job = api.ai.jobs.at(-1)!;
    expect(job).toMatchObject({
      bytes: 2048,
      mime: 'audio/mp4',
      job: { voiceId, dataClass: 'synthetic' },
    });
    const rec = (await teacher().call<Rec>('GET', `/v1/session-records/${recordId}`)).body;
    expect(job.job.roster.map((r) => r.id).sort()).toEqual(
      rec.entries.map((e) => e.student.id).sort(),
    );
    const pending = await teacher().call<{ status: string }>(
      'GET',
      `/v1/voice-notes/${voiceId}/extraction`,
    );
    expect(pending.status).toBe(202);
  });

  it('FUP-VOI-04, AI-02: never guess — a name off the roster stays unmatched; an ambiguous one blocks confirm', async () => {
    const rec = (await teacher().call<Rec>('GET', `/v1/session-records/${recordId}`)).body;
    const [a, b] = rec.entries.map((e) => e.student.id);
    const item = (id: string, over: Record<string, unknown>) => ({
      id,
      identity: 'matched',
      studentId: a,
      candidates: [],
      mention: 'x',
      field: 'attendance',
      value: 'absent',
      confidence: 0.9,
      span: { start: 0, end: 1 },
      sourceText: 'x',
      outOfRange: false,
      ...over,
    });
    const body = {
      status: 'ready',
      result: {
        transcript: 'نص تجريبي',
        modelVersion: 'whisper-test+rules',
        items: [
          item('i1', {}),
          item('i2', { identity: 'ambiguous', studentId: null, candidates: [a, b] }),
          item('i3', { studentId: uuidv7() }), // a student of another group: never attached
        ],
      },
    };
    const wrongToken = await fetch(`${api.base}/v1/internal/voice-results/${voiceId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-link-internal-token': 'nope' },
      body: JSON.stringify(body),
    });
    expect(wrongToken.status).toBe(404);
    const ok = await fetch(`${api.base}/v1/internal/voice-results/${voiceId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-link-internal-token': AI_TOKEN },
      body: JSON.stringify(body),
    });
    expect(ok.status).toBe(204);
    const x = await teacher().call<{
      id: string;
      status: string;
      transcript: string;
      items: { id: string; identity: string; student: unknown }[];
    }>('GET', `/v1/voice-notes/${voiceId}/extraction`);
    expect(x.status).toBe(200);
    expect(x.body.status).toBe('clarification_needed');
    expect(x.body.items.find((i) => i.id === 'i3')).toMatchObject({
      identity: 'unknown',
      student: null,
    });
    expect(code(await teacher().call('POST', `/v1/session-records/${recordId}/confirm`))).toBe(
      'identity_unresolved',
    );
    const notListed = await teacher().call(
      'POST',
      `/v1/voice-extractions/${x.body.id}/resolve-identity`,
      {
        itemId: 'i2',
        studentId: rec.entries.at(-1)!.student.id,
      },
    );
    expect(code(notListed)).toBe('not_a_candidate');
    await teacher().call('POST', `/v1/voice-extractions/${x.body.id}/resolve-identity`, {
      itemId: 'i2',
      studentId: b,
    });
    const d = await teacher().call<{ status: string }>(
      'POST',
      `/v1/voice-extractions/${x.body.id}/discard-item`,
      {
        itemId: 'i3',
      },
    );
    expect(d.body.status).toBe('proposed');
    // The transcript is the teacher's receipt; the owner never gets the extraction (BR-APR-05).
    expect((await owner().call('GET', `/v1/voice-notes/${voiceId}/extraction`)).status).toBe(403);
  });

  it('ADR-0007: `consented_real` audio never goes to a provider that is not local; no ai-service → "Type it instead"', async () => {
    await api.db
      .updateTable('records.voice_notes')
      .set({ data_class: 'consented_real', status: 'transcribing' })
      .where('id', '=', voiceId)
      .execute();
    api.ai.local = false;
    try {
      const before = api.ai.jobs.length;
      expect(await api.s.voice.dispatch(voiceId)).toBe('data_safety_refused');
      expect(api.ai.jobs.length).toBe(before);
      const f = await teacher().call<{ reason: string }>(
        'GET',
        `/v1/voice-notes/${voiceId}/extraction`,
      );
      expect(f.status).toBe(503);
      expect(f.body.reason).toBe('data_safety_refused');
    } finally {
      api.ai.local = true;
    }
    api.ai.down = true;
    try {
      await api.db
        .updateTable('records.voice_notes')
        .set({ data_class: 'synthetic' })
        .where('id', '=', voiceId)
        .execute();
      const r = await teacher().call<{ status: string }>(
        'POST',
        `/v1/voice-notes/${voiceId}/retry`,
      );
      expect(r.body.status).toBe('transcribing');
      expect(await api.s.voice.dispatch(voiceId)).toBe('stt_unavailable');
      expect(code(await teacher().call('GET', `/v1/voice-notes/${voiceId}/extraction`))).toBe(
        'stt_unavailable',
      );
    } finally {
      api.ai.down = false;
    }
  });

  it('BR-DAT-04, docs/10 §4: the retention job deletes audio after 30 days and blanks transcripts after 90', async () => {
    const r1 = await api.s.voice.retention(new Date(Date.now() + 29 * 86_400_000));
    expect(r1.audioDeleted).toBe(0);
    const r2 = await api.s.voice.retention(new Date(Date.now() + 31 * 86_400_000));
    expect(r2.audioDeleted).toBeGreaterThanOrEqual(1);
    const v = await api.db
      .selectFrom('records.voice_notes')
      .select(['audio_key', 'status'])
      .where('id', '=', voiceId)
      .executeTakeFirstOrThrow();
    expect(v).toMatchObject({ audio_key: null, status: 'audio_deleted' });
    expect([...api.audio.objects.keys()].some((k) => k.endsWith(voiceId))).toBe(false);
    const audit = await api.db
      .selectFrom('audit.audit_events')
      .select('action')
      .where('object_ref', '=', voiceId)
      .execute();
    expect(audit.map((a) => a.action)).toContain('voice.audio_deleted');
  });
});

describe('The Follow-up extra enforced on the server (OD-58, R3.3)', () => {
  it('OD-58: with the extra off, every follow-up endpoint refuses, the voice upload too, and no rule runs', async () => {
    await api.db
      .updateTable('platform.feature_flags')
      .set({ enabled: false })
      .where('key', '=', 'followup.extra')
      .where('scope_id', '=', NOUR)
      .execute();
    try {
      const rec = await api.db
        .selectFrom('records.session_records')
        .select(['id'])
        .where('group_id', '=', WS)
        .where('status', '=', 'confirmed')
        .executeTakeFirstOrThrow();
      const anyCase = await api.db
        .selectFrom('followup.cases')
        .select('id')
        .where('centre_id', '=', NOUR)
        .executeTakeFirstOrThrow();
      const anyMsg = await api.db
        .selectFrom('messaging.messages')
        .select('id')
        .where('centre_id', '=', NOUR)
        .executeTakeFirstOrThrow();
      const calls: [Client, string, string, unknown?][] = [
        [teacher(), 'GET', '/v1/teachers/me/today'],
        [teacher(), 'GET', `/v1/groups/${WS}/roster`],
        [teacher(), 'GET', `/v1/groups/${WS}/session-records`],
        [teacher(), 'GET', `/v1/session-records/${rec.id}`],
        [teacher(), 'POST', '/v1/voice-notes', { sessionRecordId: rec.id, durationS: 10 }],
        [reception(), 'GET', '/v1/cases'],
        [reception(), 'GET', `/v1/cases/${anyCase.id}`],
        [reception(), 'GET', '/v1/messages'],
        [reception(), 'GET', `/v1/messages/${anyMsg.id}`],
        [reception(), 'POST', '/v1/messages/drafts', { caseId: anyCase.id }],
        [owner(), 'GET', `/v1/centres/${NOUR}/today`],
        [owner(), 'GET', `/v1/centres/${NOUR}/students`],
        [owner(), 'GET', `/v1/centres/${NOUR}/sessions`],
        [owner(), 'GET', `/v1/centres/${NOUR}/rules`],
        [owner(), 'GET', `/v1/centres/${NOUR}/activity`],
      ];
      for (const [c, method, path, body] of calls) {
        const r = await c.call(method, path, body);
        expect({ path, status: r.status, code: code(r) }).toEqual({
          path,
          status: 403,
          code: 'extra_not_enabled',
        });
      }
      // No rule runs, even for an event queued before the switch.
      const { evaluate } = await import('../../src/followup/rules');
      const raised = await api.s.db.asSystem((tx) =>
        evaluate(tx, { groupId: WS, studentIds: [uuidv7()], trigger: 'record' }),
      );
      expect(raised).toEqual([]);
      // The parent's feed is empty and the extra reads off; the teacher's groups carry no follow-up.
      expect(
        (await clients.parent.call<{ data: unknown[] }>('GET', '/v1/me/updates')).body.data,
      ).toEqual([]);
      const g = await teacher().call<{ id: string; followup: unknown }[]>(
        'GET',
        '/v1/teachers/me/groups',
      );
      expect(g.body.find((x) => x.id === WS)!.followup).toBeNull();
      expect(
        (await teacher().call<{ followupExtra: boolean }>('GET', '/v1/teachers/me/features')).body
          .followupExtra,
      ).toBe(false);
    } finally {
      await api.db
        .updateTable('platform.feature_flags')
        .set({ enabled: true })
        .where('key', '=', 'followup.extra')
        .where('scope_id', '=', NOUR)
        .execute();
    }
    const on = await teacher().call<
      { id: string; followup: { recordsComplete: unknown } | null }[]
    >('GET', '/v1/teachers/me/groups');
    expect(on.body.find((x) => x.id === WS)!.followup).not.toBeNull();
    // On again: the teacher and the parent read it as on (the centre's flag row is staff-only
    // under RLS, so these two read it for their own centres through the system role).
    expect(
      (await teacher().call<{ followupExtra: boolean }>('GET', '/v1/teachers/me/features')).body
        .followupExtra,
    ).toBe(true);
    expect(
      (await clients.parent.call<{ followupExtra: boolean }>('GET', '/v1/me/features')).body
        .followupExtra,
    ).toBe(true);
  });

  it('R3.4: Ask Link is off in live mode without a local LLM (the scripted assistant never runs here)', async () => {
    const f = await owner().call<{ flags: Record<string, boolean> }>('GET', '/v1/feature-flags');
    expect(f.body.flags['followup.assistant']).toBe(false);
    for (const [m, path, body] of [
      ['GET', '/v1/assistant/briefing', undefined],
      ['POST', '/v1/assistant/turns', { text: 'Who needs a call today?' }],
    ] as const) {
      const r = await owner().call(m, path, body);
      expect({ path, status: r.status, code: code(r) }).toEqual({
        path,
        status: 503,
        code: 'assistant_unavailable',
      });
    }
  });

  it('R3.4, docs/10 §7: with a local LLM, Ask Link reads only; no student name reaches the model; it never acts', async () => {
    const prompts: string[] = [];
    const ollama = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const p = (JSON.parse(raw) as { prompt: string }).prompt;
        prompts.push(p);
        const tok = /<S\d+>/.exec(p.split('Facts')[1] ?? '')?.[0] ?? '';
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ response: `${tok} needs a call today.` }));
      });
    });
    await new Promise<void>((r) => ollama.listen(0, '127.0.0.1', () => r()));
    const port = (ollama.address() as { port: number }).port;
    const assistant = new Assistant(
      api.s.cases,
      api.s.messages,
      { ...api.config, OLLAMA_URL: `http://127.0.0.1:${port}` },
      createLogger('silent', 'test'),
    );
    try {
      const ownerId = (await owner().call<{ id: string }>('GET', '/v1/me')).body.id;
      const b = await assistant.briefing(ownerId, 'en');
      expect(b.items.length).toBeGreaterThan(0);
      const events = await assistant.turn(ownerId, 'Who needs a call today?', 'en');
      expect(events[0]).toEqual({ type: 'tier', tier: 'read' });
      const names = b.items.map((i) => i.student.displayName);
      for (const n of names) for (const p of prompts) expect(p).not.toContain(n.split(' ')[0]);
      const text = events.flatMap((e) => (e.type === 'token' ? [e.text] : [])).join('');
      expect(names.some((n) => text.includes(n))).toBe(true); // restored after the model
      const act = await assistant.turn(ownerId, 'Approve and send it', 'en');
      expect(act.map((e) => e.type)).toEqual(['tier', 'needs_approval', 'done']);
      expect(prompts).toHaveLength(1); // the act request never reached the model
    } finally {
      ollama.close();
    }
  });
});
