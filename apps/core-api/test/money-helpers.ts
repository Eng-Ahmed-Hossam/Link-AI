import { sql } from 'kysely';
import { demoId } from '../seeds/demo';
import { type Api, Client, PHONES } from './helpers';

/** Shared steps for the enrolment, payment and money suites (sample data only). */
export const NOUR_GROUP = demoId('grp-salma-ws'); // Wed & Sat 17:00, Room 2, 55,000 pt a month
export const MARIAM = demoId('chd-mariam');
export const YOUSSEF = demoId('chd-youssef');

type Problemish = { code?: string };
export const code = (r: { body: unknown }) => (r.body as Problemish).code;

export interface EnrolmentBody {
  id: string;
  status: string;
  holdExpiresAt: string | null;
  sessionIds: string[];
  lastPaymentFailed: boolean;
  payment: { amount: { amountPt: number }; method: string; cardLast4: string | null } | null;
  fawry: { reference: string; expiresAt: string } | null;
  refund: { status: string; policy: string; amount: { amountPt: number } } | null;
  canReview: boolean;
  firstSessionStarted: boolean;
}

export async function sampleParent(api: Api) {
  const c = new Client(api);
  await c.signIn(PHONES.parent);
  return c;
}

/** A new parent with one child (signs up through the API, like P01). */
export async function newParent(api: Api, phone: string) {
  const c = new Client(api);
  const me = await c.signIn(phone);
  if (!me.user.roles.includes('parent')) {
    const r = await c.call('POST', '/v1/me/roles', { role: 'parent' });
    if (r.status >= 300) throw new Error(`addRole ${r.status} ${JSON.stringify(r.body)}`);
  }
  const g = await groupOf(c, NOUR_GROUP);
  const kid = await c.call<{ id: string }>('POST', '/v1/me/children', {
    displayName: 'طالب تجريبي',
    curriculumId: g.curriculum.id,
    schoolYearId: g.schoolYear.id,
  });
  if (kid.status !== 201) throw new Error(`child ${kid.status} ${JSON.stringify(kid.body)}`);
  return { c, childId: kid.body.id };
}

export async function groupOf(c: Client, groupId: string) {
  const r = await c.call<{
    curriculum: { id: string };
    schoolYear: { id: string };
    seatCap: number;
    upcomingSessions: { id: string; startsAt: string; seatsLeft: number }[];
  }>('GET', `/v1/groups/${groupId}`);
  if (r.status !== 200) throw new Error(`group ${r.status}`);
  return r.body;
}

export function hold(
  c: Client,
  a: { groupId?: string; studentId: string; plan?: string; firstSessionId: string; key?: string },
) {
  const plan = a.plan ?? 'single_month';
  return c.call<EnrolmentBody>(
    'POST',
    '/v1/enrolments',
    {
      groupId: a.groupId ?? NOUR_GROUP,
      studentId: a.studentId,
      paymentPlan: plan,
      ...(plan === 'per_session'
        ? { sessionId: a.firstSessionId }
        : { firstSessionId: a.firstSessionId }),
      sharePhone: false,
    },
    a.key ? { 'idempotency-key': a.key } : {},
  );
}

export function checkout(c: Client, id: string, method: 'card' | 'fawry' | 'wallet') {
  return c.call<{
    kind: string;
    checkoutUrl?: string;
    fawryReference?: string;
    expiresAt?: string;
  }>('POST', `/v1/enrolments/${id}/checkout`, { method });
}

/** The parent finishes on fake-pay's hosted page; fake-pay signs and sends the webhook first. */
export async function completeOnProvider(checkoutUrl: string, result: 'succeeded' | 'failed') {
  const r = await fetch(`${checkoutUrl}/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `result=${result}`,
    redirect: 'manual',
  });
  if (r.status >= 400) throw new Error(`fake-pay complete ${r.status}`);
}

export async function payFawryAtOutlet(api: Api, reference: string) {
  const r = await fetch(`${api.fakeBase}/v1/fawry-references/${reference}/pay`, { method: 'POST' });
  if (!r.ok) throw new Error(`fawry pay ${r.status}`);
}

/** Wait until a condition holds (webhooks fake-pay sends a moment later: refunds, renewals). */
export async function until<T>(f: () => Promise<T>, ok: (v: T) => boolean, ms = 5000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await f();
    if (ok(v) || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** A hold's end moved into the past, as if the minutes had passed (the job then expires it). */
export async function ageHold(api: Api, enrolmentId: string) {
  await sql`UPDATE market.enrolments SET hold_expires_at = now() - interval '1 second' WHERE id = ${enrolmentId}`.execute(
    api.db,
  );
}

/**
 * The ledger lines of a payment: transaction by transaction, debits first, then by account code
 * (lines inside one transaction have no order of their own).
 */
export async function ledgerOf(api: Api, paymentId: string) {
  const { rows } = await sql<{
    kind: string;
    code: string;
    debit: string;
    credit: string;
    key: string;
  }>`
    SELECT t.kind, a.code, e.debit_pt AS debit, e.credit_pt AS credit, t.idempotency_key AS key
    FROM ledger.ledger_entries e JOIN ledger.ledger_transactions t ON t.id = e.transaction_id
    JOIN ledger.ledger_accounts a ON a.id = e.account_id
    WHERE t.payment_id = ${paymentId}
    ORDER BY t.created_at, t.id, e.debit_pt DESC, a.code`.execute(api.db);
  return rows.map((r) => ({ ...r, debit: Number(r.debit), credit: Number(r.credit) }));
}

export async function paymentsOf(api: Api, enrolmentId: string) {
  const { rows } = await sql<{
    id: string;
    status: string;
    amount_pt: string;
    commission_pt: string | null;
    provider_ref: string | null;
    method: string;
  }>`
    SELECT id, status, amount_pt, commission_pt, provider_ref, method FROM ledger.payments
    WHERE enrolment_id = ${enrolmentId} ORDER BY created_at`.execute(api.db);
  return rows;
}

export async function count(api: Api, table: string, where = 'true') {
  const { rows } = await sql<{
    n: number;
  }>`SELECT count(*)::int AS n FROM ${sql.raw(table)} WHERE ${sql.raw(where)}`.execute(api.db);
  return rows[0]!.n;
}

/** Σ debit and Σ credit over the whole ledger (INV-01: always equal). */
export async function trial(api: Api) {
  const { rows } = await sql<{ d: string; c: string }>`
    SELECT coalesce(sum(debit_pt), 0) AS d, coalesce(sum(credit_pt), 0) AS c FROM ledger.ledger_entries`.execute(
    api.db,
  );
  return { debit: Number(rows[0]!.d), credit: Number(rows[0]!.c) };
}
