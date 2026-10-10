// S2 ops console against real Postgres: access (MKT-OPS-08), L01 centres (MKT-OPS-01), teacher
// verification (MKT-OPS-02), L02 reviews (MKT-OPS-03), L03 refunds (MKT-OPS-04), data-subject
// requests (MKT-OPS-09). Test names carry requirement IDs.
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_AGENT_PHONE, OPS_FINANCE_PHONE, demoId } from '../../seeds/demo';
import { uuidv7 } from '../../src/platform/ids';
import { type Api, Client, PHONES, startApi } from '../helpers';
import {
  type EnrolmentBody,
  NOUR_GROUP,
  checkout,
  completeOnProvider,
  groupOf,
  hold,
  newParent,
} from '../money-helpers';

let api: Api;
let agent: Client;
let finance: Client;
let owner: Client;
let parent: Client;
beforeAll(async () => {
  api = await startApi();
  agent = new Client(api, { web: true });
  await agent.signIn(OPS_AGENT_PHONE);
  finance = new Client(api, { web: true });
  await finance.signIn(OPS_FINANCE_PHONE);
  owner = new Client(api);
  await owner.signIn(PHONES.owner);
  parent = new Client(api);
  await parent.signIn(PHONES.parent);
}, 120_000);
afterAll(() => api.close());

const code = (r: { body: unknown }) => (r.body as { code?: string }).code;
const CHECKS = [
  'owner_call',
  'address_pin_match',
  'site_visit_or_video',
  'owner_id',
  'owner_profile_approval',
];
const audit = async (ref: string) =>
  (
    await sql<{ action: string; actor_id: string | null; reason: string | null }>`
      SELECT action, actor_id, reason FROM audit.audit_events WHERE object_ref = ${ref}
      ORDER BY occurred_at, id`.execute(api.db)
  ).rows;

/** A new centre join request (C01): pending, owned by a sample user. */
async function pendingCentre() {
  const id = uuidv7();
  await sql`INSERT INTO org.centres (id, owner_id, name, slug, area, verification)
    VALUES (${id}, ${demoId('usr-owner-b')}, 'Sample pending centre', ${`sample-${id.slice(-8)}`},
            'Nasr City', 'pending')`.execute(api.db);
  return id;
}

describe('MKT-OPS-08 ops access', () => {
  it('only link_ops users reach /v1/ops; the bundle decides the rest (OD-37)', async () => {
    expect(code(await owner.call('GET', '/v1/ops/me'))).toBe('ops_permission_required');
    expect((await owner.call('GET', '/v1/ops/me')).status).toBe(403);
    const me = await agent.call<{ permissions: string[]; name: string }>('GET', '/v1/ops/me');
    expect(me.status).toBe(200);
    expect(me.body.permissions).toEqual(['ops.verify', 'ops.moderate']);
    // Agent: no money; finance: no verification.
    const r1 = await agent.call('GET', '/v1/ops/refunds');
    expect([r1.status, code(r1)]).toEqual([403, 'ops_permission_required']);
    const r2 = await finance.call('GET', '/v1/ops/centre-applications');
    expect([r2.status, code(r2)]).toEqual([403, 'ops_permission_required']);
    // Signed out: 401 before anything else.
    expect((await new Client(api).call('GET', '/v1/ops/me')).status).toBe(401);
  });

  it('MKT-OPS-08: an ops user is not an app role (Me lists none)', async () => {
    const me = await agent.call<{ roles: string[] }>('GET', '/v1/me');
    expect(me.body.roles).not.toContain('link_ops');
  });
});

describe('MKT-OPS-01 L01 centre join requests (BR-VER-01, BR-VER-02)', () => {
  it('new → call scheduled → checks → approve; every step audited with the ops user', async () => {
    const id = await pendingCentre();
    type Apps = {
      centres: {
        id: string;
        stage: string;
        canApprove: boolean;
        callDueAt: string | null;
        checks: { code: string; status: string; doneByName: string | null }[];
        notes: { body: string; authorName: string }[];
      }[];
      leads: { id: string; status: string }[];
    };
    const list = async (stage?: string) =>
      (
        await agent.call<Apps>(
          'GET',
          `/v1/ops/centre-applications${stage ? `?stage=${stage}` : ''}`,
        )
      ).body;
    let c = (await list('new')).centres.find((x) => x.id === id)!;
    expect(c).toMatchObject({ stage: 'new', canApprove: false });
    expect(c.callDueAt).toBeTruthy();
    expect(c.checks.map((x) => x.code)).toEqual(CHECKS);
    // The sample landing lead is in "New" too.
    expect((await list()).leads.some((l) => l.id === demoId('lead-sample'))).toBe(true);

    // AC2: approve stays locked until every check is done.
    const early = await agent.call('POST', `/v1/ops/centres/${id}/approve`, {});
    expect([early.status, code(early)]).toEqual([409, 'checks_incomplete']);

    expect(
      (await agent.call('POST', `/v1/ops/centres/${id}/stage`, { stage: 'call_scheduled' })).status,
    ).toBe(200);
    for (const check of CHECKS)
      expect(
        (
          await agent.call('PUT', `/v1/ops/verifications/centre/${id}/checks/${check}`, {
            status: 'done',
            notes: check === 'owner_call' ? 'Sample: spoke to the owner' : undefined,
          })
        ).status,
      ).toBe(200);
    // A teacher check is not a centre check.
    const wrong = await agent.call('PUT', `/v1/ops/verifications/centre/${id}/checks/degree`, {
      status: 'done',
    });
    expect(code(wrong)).toBe('check_not_for');

    // AC3: an internal note.
    const note = await agent.call<{ body: string; authorName: string }>('POST', '/v1/ops/notes', {
      subjectType: 'centre',
      subjectId: id,
      body: 'Sample: visit on Sunday',
    });
    expect(note.status).toBe(201);
    c = (await list('call_scheduled')).centres.find((x) => x.id === id)!;
    expect(c.canApprove).toBe(true);
    expect(c.checks.every((x) => x.status === 'done' && x.doneByName)).toBe(true);
    expect(c.notes.map((n) => n.body)).toEqual(['Sample: visit on Sunday']);

    expect((await agent.call('POST', `/v1/ops/centres/${id}/approve`, {})).status).toBe(200);
    expect((await list('live')).centres.some((x) => x.id === id)).toBe(true);
    const rejectLive = await agent.call('POST', `/v1/ops/centres/${id}/reject`, { reason: 'x' });
    expect(code(rejectLive)).toBe('already_decided');

    const a = await audit(id);
    expect(a.map((x) => x.action)).toEqual([
      'centre.stage_changed',
      ...CHECKS.map(() => 'verification_check.recorded'),
      'ops_note.added',
      'centre.verified',
    ]);
    expect(a.every((x) => x.actor_id === demoId('usr-ops-agent'))).toBe(true);
    const { rows } = await sql<{
      n: number;
    }>`SELECT count(*)::int AS n FROM platform.outbox_events WHERE type = 'centre.verified' AND aggregate_id = ${id}`.execute(
      api.db,
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('BR-VER-06: revoke needs a reason and hides a verified centre; reject a pending one', async () => {
    const id = await pendingCentre();
    const noReason = await agent.call('POST', `/v1/ops/centres/${id}/reject`, { reason: ' ' });
    expect(noReason.status).toBe(422);
    expect(
      (await agent.call('POST', `/v1/ops/centres/${id}/reject`, { reason: 'Sample: no site' }))
        .status,
    ).toBe(200);
    const nour = demoId('cen-nile');
    const r = await agent.call('POST', `/v1/ops/centres/${nour}/revoke`, {
      reason: 'Sample: revoked in a test',
    });
    expect(r.status).toBe(200);
    const { rows } = await sql<{
      verification: string;
    }>`SELECT verification FROM org.centres WHERE id = ${nour}`.execute(api.db);
    expect(rows[0]!.verification).toBe('revoked');
    // Put it back for the other suites.
    await sql`UPDATE org.centres SET verification = 'verified' WHERE id = ${nour}`.execute(api.db);
  });

  it('MKT-WEB-01: a lead is marked contacted', async () => {
    const r = await agent.call('POST', `/v1/ops/leads/${demoId('lead-sample')}/status`, {
      status: 'contacted',
    });
    expect(r.status).toBe(200);
    expect((await audit(demoId('lead-sample'))).map((x) => x.action)).toEqual([
      'lead.status_changed',
    ]);
  });
});

describe('MKT-OPS-02 teacher verification', () => {
  it('BR-VER-03: verify records the ID check; reject needs a reason', async () => {
    type T = { id: string; verification: string; checks: { code: string; status: string }[] };
    const queue = (await agent.call<T[]>('GET', '/v1/ops/teachers')).body;
    const pending = queue.find((t) => t.verification === 'pending')!;
    expect(pending).toBeTruthy();
    expect(pending.checks.map((c) => c.code)).toEqual(['ekyc_id', 'degree', 'reference']);
    expect(
      (await agent.call('POST', `/v1/ops/teachers/${pending.id}/reject`, { reason: '' })).status,
    ).toBe(422);
    expect((await agent.call('POST', `/v1/ops/teachers/${pending.id}/verify`, {})).status).toBe(
      200,
    );
    const all = (await agent.call<T[]>('GET', '/v1/ops/teachers?verification=verified')).body;
    const t = all.find((x) => x.id === pending.id)!;
    expect(t.checks.find((c) => c.code === 'ekyc_id')!.status).toBe('done');
    const again = await agent.call('POST', `/v1/ops/teachers/${pending.id}/verify`, {});
    expect(code(again)).toBe('already_decided');
  });
});

describe('MKT-OPS-03 L02 review moderation (BR-REV-05)', () => {
  it('a held review is in the queue with its flag and 48-hour target; publish takes it out', async () => {
    const { rows } = await sql<{
      id: string;
      guardian_id: string;
      centre_id: string;
      teacher_id: string;
      school_year_id: string;
    }>`SELECT e.id, e.guardian_id, e.centre_id, e.teacher_id, g.school_year_id
       FROM market.enrolments e JOIN market.groups g ON g.id = e.group_id
       WHERE e.status = 'confirmed'
         AND NOT EXISTS (SELECT 1 FROM market.reviews r WHERE r.enrolment_id = e.id)
       LIMIT 1`.execute(api.db);
    const e = rows[0]!;
    const id = uuidv7();
    await sql`INSERT INTO market.reviews (id, enrolment_id, guardian_id, target_type, target_id,
        centre_id, school_year_id, stars, body, visibility, status, flags)
      VALUES (${id}, ${e.id}, ${e.guardian_id}, 'teacher', ${e.teacher_id}, ${e.centre_id},
        ${e.school_year_id}, 4, 'Sample: call me on 01000000000', 'public', 'held',
        ARRAY['contact_details'])`.execute(api.db);
    type Q = { id: string; flags: string[]; dueAt: string; createdAt: string }[];
    const item = (await agent.call<Q>('GET', '/v1/ops/reviews/queue')).body.find(
      (x) => x.id === id,
    )!;
    expect(item.flags).toEqual(['contact_details']);
    expect(new Date(item.dueAt).getTime() - new Date(item.createdAt).getTime()).toBe(48 * 3.6e6);
    // Finance cannot moderate.
    expect((await finance.call('GET', '/v1/ops/reviews/queue')).status).toBe(403);
    const noNote = await agent.call('POST', `/v1/ops/reviews/${id}/decision`, {
      decision: 'request_edit',
    });
    expect(code(noNote)).toBe('reason_required');
    expect(
      (await agent.call('POST', `/v1/ops/reviews/${id}/decision`, { decision: 'publish' })).status,
    ).toBe(200);
    expect(
      (await agent.call<Q>('GET', '/v1/ops/reviews/queue')).body.some((x) => x.id === id),
    ).toBe(false);
    expect((await audit(id)).map((x) => x.action)).toEqual(['review.published']);
  });
});

describe('MKT-OPS-04 L03 refunds (BR-REF-07, OD-42)', () => {
  let n = 0;
  async function requestedRefund() {
    const { c, childId } = await newParent(api, `+2010${71_000_000 + ++n}`);
    const next = (await groupOf(c, NOUR_GROUP)).upcomingSessions[0]!;
    const h = await hold(c, { studentId: childId, firstSessionId: next.id, plan: 'single_month' });
    const co = await checkout(c, h.body.id, 'card');
    await completeOnProvider(co.body.checkoutUrl!, 'succeeded');
    const x = await c.call<EnrolmentBody>('POST', `/v1/enrolments/${h.body.id}/cancel`, {});
    expect(x.body.refund).toMatchObject({ status: 'requested' });
    const { rows } = await sql<{
      id: string;
    }>`SELECT id FROM ledger.refunds WHERE enrolment_id = ${h.body.id}`.execute(api.db);
    return rows[0]!.id;
  }

  it('the finance user sees the request with the payment and approves it; the audit names them', async () => {
    const id = await requestedRefund();
    type R = { id: string; amount: { amountPt: number }; paid: { amountPt: number } }[];
    const r = (await finance.call<R>('GET', '/v1/ops/refunds')).body.find((x) => x.id === id)!;
    expect(r.amount.amountPt).toBe(55_000);
    expect(r.paid.amountPt).toBe(55_000);
    expect((await finance.call('POST', `/v1/ops/refunds/${id}/approve`, {})).status).toBe(200);
    const again = await finance.call('POST', `/v1/ops/refunds/${id}/approve`, {});
    expect(code(again)).toBe('already_decided');
    const a = (await audit(id)).find((x) => x.action === 'refund.approved')!;
    expect(a.actor_id).toBe(demoId('usr-ops-finance'));
  });

  it('reject needs a reason and posts nothing', async () => {
    const id = await requestedRefund();
    expect(
      (await finance.call('POST', `/v1/ops/refunds/${id}/reject`, { reason: '' })).status,
    ).toBe(422);
    expect(
      (await finance.call('POST', `/v1/ops/refunds/${id}/reject`, { reason: 'Sample: policy' }))
        .status,
    ).toBe(200);
    const a = (await audit(id)).find((x) => x.action === 'refund.rejected')!;
    expect(a.actor_id).toBe(demoId('usr-ops-finance'));
  });
});

describe('MKT-OPS-09 data-subject requests (PDPL)', () => {
  it('a parent asks for deletion once; ops complete it with what was done', async () => {
    const r = await parent.call<{ id: string; status: string }>('POST', '/v1/me/data-requests', {
      kind: 'deletion',
      details: 'Sample: delete my account',
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('open');
    const dup = await parent.call('POST', '/v1/me/data-requests', { kind: 'deletion' });
    expect([dup.status, code(dup)]).toEqual([409, 'already_open']);
    type O = { id: string; userName: string; roles: string[]; dueAt: string }[];
    const queue = (await agent.call<O>('GET', '/v1/ops/data-requests')).body;
    const item = queue.find((x) => x.id === r.body.id)!;
    expect(item.roles).toContain('parent');
    expect(
      (
        await agent.call('POST', `/v1/ops/data-requests/${r.body.id}/complete`, {
          result: 'completed',
          outcome: 'Sample: account anonymised; payments kept with names removed',
        })
      ).status,
    ).toBe(200);
    const mine = await parent.call<{ id: string; status: string; outcome: string }[]>(
      'GET',
      '/v1/me/data-requests',
    );
    expect(mine.body.find((x) => x.id === r.body.id)).toMatchObject({ status: 'completed' });
    // Finance does not handle data requests (ops.verify).
    expect((await finance.call('GET', '/v1/ops/data-requests')).status).toBe(403);
    // A parent never reaches the ops queue.
    expect((await parent.call('GET', '/v1/ops/data-requests')).status).toBe(403);
  });

  it('MKT-OPS-08: ops lookups of the audit log show who did it', async () => {
    const rows = (
      await agent.call<{ action: string; actorName: string | null }[]>(
        'GET',
        `/v1/ops/audit?objectType=lead&objectRef=${demoId('lead-sample')}`,
      )
    ).body;
    expect(rows[0]).toMatchObject({ action: 'lead.status_changed' });
    expect(rows[0]!.actorName).toBeTruthy();
  });
});
