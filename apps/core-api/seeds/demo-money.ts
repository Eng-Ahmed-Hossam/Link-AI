// The demo world's paid seats and reviews (R2b). SAMPLE DATA ONLY: fictional families, fake-pay
// payments, no real money. Every payment is posted to the ledger with the same posting builders
// the money paths use (docs/08 §2), so the balances, J07 and C07 read real ledger rows.
import { sql, type Kysely } from 'kysely';
import * as fx from '@link/mocks/fixtures';
import * as mfx from '@link/mocks/market-fixtures';
import { accountMeta, checkLines, type Line } from '../src/ledger/ledger';
import { fee, p1Capture, p2Release, p5Settlement } from '../src/ledger/postings';
import { addDays, addMonth, cairoToUtc, cairoToday } from '../src/platform/time';
import { demoId } from './demo-id';

type Db = Kysely<Record<string, Record<string, unknown>>>;
type Put = (table: string, rows: Record<string, unknown>[]) => Promise<void>;

interface SessionRow {
  id: string;
  group_id: string;
  starts_at: string;
  ends_at: string;
}

/** Fictional names for the sample families (no real people). */
const FIRST = [
  'سارة',
  'عمر',
  'ليلى',
  'آدم',
  'نور',
  'يحيى',
  'جنى',
  'مالك',
  'هنا',
  'زياد',
  'فرح',
  'كريم',
  'ملك',
  'سليم',
  'رنا',
  'تميم',
];
const LAST = ['سمير', 'عادل', 'فؤاد', 'رامي', 'وائل', 'شريف', 'حسام', 'ياسر', 'خالد', 'طارق'];
const sampleName = (i: number) =>
  `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`;

/** Sample provider fee on settlement (fake-pay charges 2%: a Link cost, OD-15). */
const providerFee = (amountPt: number) => Math.floor(amountPt * 0.02);

export async function seedMoney(
  db: Db,
  put: Put,
  o: {
    sessions: SessionRow[];
    parentGuardian: string;
    parentUser: string;
    ownerOf: (centreId: string) => string;
    bookingRule: { id: string; ratePct: string };
  },
) {
  const now = new Date();
  const today = cairoToday(now);
  const dayOf = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date(iso));
  const sessionsOf = (groupKey: string) =>
    o.sessions
      .filter((s) => s.group_id === demoId(groupKey))
      .map((s) => ({ ...s, day: dayOf(s.starts_at) }))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const guardians: Record<string, unknown>[] = [];
  const students: Record<string, unknown>[] = [];
  const links: Record<string, unknown>[] = [];
  const enrolments: Record<string, unknown>[] = [];
  const payments: Record<string, unknown>[] = [];
  const accounts = new Map<string, Record<string, unknown>>();
  const txns: Record<string, unknown>[] = [];
  const entries: Record<string, unknown>[] = [];
  let n = 0;

  const postRows = (
    key: string,
    kind: string,
    at: Date,
    lines: Line[],
    extra: Record<string, unknown>,
  ) => {
    const id = demoId(`ltx:${key}`);
    txns.push({
      id,
      kind,
      idempotency_key: key,
      description: `Sample: ${kind}`,
      occurred_at: at,
      created_at: at,
      ...extra,
    });
    for (const l of checkLines(lines)) {
      if (!accounts.has(l.account)) {
        const m = accountMeta(l.account);
        accounts.set(l.account, {
          id: demoId(`acct:${l.account}`),
          code: l.account,
          type: m.type,
          owner_type: m.ownerType,
          owner_id: m.ownerId,
        });
      }
      entries.push({
        id: demoId(`le:${key}:${entries.length}`),
        transaction_id: id,
        account_id: demoId(`acct:${l.account}`),
        debit_pt: l.debit ?? 0,
        credit_pt: l.credit ?? 0,
        payment_id: extra.payment_id ?? null,
        created_at: at,
      });
    }
  };

  /** One paid, confirmed seat with its payment and ledger postings (P1, then P2 and P5 if due). */
  const seat = (a: {
    key: string;
    reference?: string;
    group: (typeof fx.groups)[number];
    studentId: string;
    guardianId: string;
    payerUserId: string | null;
    plan: 'monthly_recurring' | 'single_month' | 'per_session';
    startedDaysAgo: number;
    method: 'card' | 'fawry' | 'wallet';
  }) => {
    const ss = sessionsOf(a.group.id);
    const first = ss.find((s) => s.day >= addDays(today, -a.startedDaysAgo));
    if (!first) return null;
    const perSession = a.plan === 'per_session';
    const start = perSession ? null : first.day;
    const end = start ? addMonth(start) : null;
    const price = perSession ? a.group.sessionFeePt : a.group.monthlyFeePt;
    const enrolmentId = demoId(`enr:${a.key}`);
    enrolments.push({
      id: enrolmentId,
      ...(a.reference ? { reference: a.reference } : {}),
      student_id: a.studentId,
      guardian_id: a.guardianId,
      group_id: demoId(a.group.id),
      centre_id: demoId(a.group.centreId),
      teacher_id: demoId(a.group.teacherId),
      status: 'confirmed',
      payment_plan: a.plan,
      method: a.method,
      price_pt: price,
      first_session_id: first.id,
      session_id: perSession ? first.id : null,
      current_period_start: start,
      current_period_end: end,
      phone_shared: true,
      status_changed_at: new Date(cairoToUtc(addDays(first.day, -2), '10:00')),
      created_at: new Date(cairoToUtc(addDays(first.day, -2), '09:50')),
    });
    const paymentId = demoId(`pay:${a.key}`);
    const paidAt = new Date(cairoToUtc(addDays(first.day, -2), '10:00'));
    const commission = fee(price, o.bookingRule.ratePct);
    const released = new Date(first.starts_at) <= now ? new Date(first.starts_at) : null;
    const settledAt =
      addDays(dayOf(paidAt.toISOString()), 1) < today
        ? new Date(cairoToUtc(addDays(dayOf(paidAt.toISOString()), 1), '06:00'))
        : null;
    const ref = a.method === 'fawry' ? String(70000000 + ++n) : `seed_${a.key}`;
    payments.push({
      id: paymentId,
      kind: 'enrolment',
      enrolment_id: enrolmentId,
      payer_user_id: a.payerUserId,
      payee_type: 'teacher',
      payee_id: demoId(a.group.teacherId),
      centre_id: demoId(a.group.centreId),
      amount_pt: price,
      commission_pt: commission,
      commission_rule_id: o.bookingRule.id,
      commission_rate_pct: o.bookingRule.ratePct,
      method: a.method,
      provider: 'fake',
      provider_ref: ref,
      fawry_reference: a.method === 'fawry' ? ref : null,
      card_last4: a.method === 'card' ? '4242' : null,
      status: 'succeeded',
      period_start: start,
      period_end: end,
      succeeded_at: paidAt,
      released_at: released,
      settled_at: settledAt,
      idempotency_key: `seed:${a.key}`,
      created_at: paidAt,
    });
    const teacherId = demoId(a.group.teacherId);
    const scope = {
      payment_id: paymentId,
      centre_id: demoId(a.group.centreId),
      teacher_id: teacherId,
    };
    postRows(
      `capture:fake:${ref}`,
      'payment_captured',
      paidAt,
      p1Capture({ provider: 'fake', teacherId, amount: price, commission }),
      scope,
    );
    if (released)
      postRows(
        `release:${paymentId}`,
        'funds_released',
        released,
        p2Release({ teacherId, amount: price - commission }),
        scope,
      );
    if (settledAt)
      postRows(
        `settle:fake:${ref}`,
        'settlement',
        settledAt,
        p5Settlement({ provider: 'fake', amount: price, providerFee: providerFee(price) }),
        scope,
      );
    if (a.plan === 'monthly_recurring')
      mandates.push({
        id: demoId(`mandate:${a.key}`),
        guardian_id: a.guardianId,
        enrolment_id: enrolmentId,
        provider: 'fake',
        // fake-pay accepts `tok_seed_…` tokens as saved sample cards.
        provider_token_ref: `tok_seed_${a.key}`,
        card_brand: 'visa',
        card_last4: '4242',
        card_exp_month: 12,
        card_exp_year: 2030,
      });
    return enrolmentId;
  };
  const mandates: Record<string, unknown>[] = [];

  // The fixture enrolments (Mariam's physics plan; other families in Ms Salma's Nile group).
  for (const e of fx.seedEnrolments) {
    const g = fx.groups.find((x) => x.id === e.groupId)!;
    let studentId: string;
    let guardianId: string;
    let payer: string | null = null;
    if (fx.children.some((c) => c.id === e.studentId)) {
      studentId = demoId(e.studentId);
      guardianId = o.parentGuardian;
      payer = o.parentUser;
    } else {
      const other = fx.otherStudents[e.studentId]!;
      guardianId = demoId(`gdn:${e.studentId}`);
      studentId = demoId(e.studentId);
      guardians.push({ id: guardianId });
      students.push({
        id: studentId,
        display_name: other.name.ar,
        curriculum_id: demoId(g.curriculumId),
        school_year_id: demoId(g.schoolYearId),
        created_by_guardian_id: guardianId,
      });
      links.push({
        student_id: studentId,
        guardian_id: guardianId,
        relation: 'guardian',
        consent_version: 'draft-2026-10',
        consent_at: '2026-09-01T09:00:00Z',
      });
    }
    seat({
      key: e.id,
      reference: e.reference,
      group: g,
      studentId,
      guardianId,
      payerUserId: payer,
      plan: e.plan,
      startedDaysAgo: e.startedDaysAgo,
      method: 'card',
    });
  }

  // Seats already taken by sample families, as many as the mock's fixture shows (takenUpcoming).
  const familySeats = new Map<string, string[]>();
  let k = 0;
  for (const g of fx.groups) {
    if (!sessionsOf(g.id).length) continue;
    const own = fx.seedEnrolments.filter((e) => e.groupId === g.id).length;
    const count = Math.max(0, Math.min(g.takenUpcoming[0] ?? 0, g.seatCap - own));
    for (let i = 0; i < count; i++, k++) {
      const key = `fam-${g.id}-${i}`;
      const guardianId = demoId(`gdn:${key}`);
      const studentId = demoId(`stu:${key}`);
      guardians.push({ id: guardianId });
      students.push({
        id: studentId,
        display_name: sampleName(k),
        curriculum_id: demoId(g.curriculumId),
        school_year_id: demoId(g.schoolYearId),
        created_by_guardian_id: guardianId,
      });
      links.push({
        student_id: studentId,
        guardian_id: guardianId,
        relation: 'guardian',
        consent_version: 'draft-2026-10',
        consent_at: '2026-09-01T09:00:00Z',
      });
      // Single-month plans started over the last four weeks, so every seat covers the coming week.
      const id = seat({
        key,
        group: g,
        studentId,
        guardianId,
        payerUserId: null,
        plan: 'single_month',
        startedDaysAgo: (i * 3) % 24,
        method: i % 5 === 4 ? 'fawry' : 'card',
      });
      if (id) familySeats.set(g.id, [...(familySeats.get(g.id) ?? []), id]);
    }
  }

  await put('org.guardians', guardians);
  await put('org.students', students);
  await put('org.student_guardians', links);
  await put('market.enrolments', enrolments);
  await put('ledger.payments', payments);
  await put('ledger.payment_mandates', mandates);
  await put('ledger.ledger_accounts', [...accounts.values()]);
  await put('ledger.ledger_transactions', txns);
  await put('ledger.ledger_entries', entries);

  // Sample payout accounts: masked numbers only (the details stay empty in the demo).
  await put('ledger.payout_accounts', [
    ...fx.teachers.map((t, i) => ({
      id: demoId(`payout:${t.id}`),
      owner_type: 'teacher',
      owner_id: demoId(t.id),
      kind: i % 2 ? 'bank' : 'wallet',
      display_last4: String(4400 + i * 7).slice(-4),
      status: 'verified',
      verified_at: now,
    })),
    ...fx.centres.map((c, i) => ({
      id: demoId(`payout:${c.id}`),
      owner_type: 'centre',
      owner_id: demoId(c.id),
      kind: 'bank',
      display_last4: String(8100 + i * 13).slice(-4),
      status: 'verified',
      verified_at: now,
    })),
  ]);

  // Published reviews and private feedback, each from a sample family's enrolment (BR-REV-01).
  const reviewRows: Record<string, unknown>[] = [];
  const replies: Record<string, unknown>[] = [];
  const used = new Map<string, number>();
  const enrolmentFor = (targetType: 'centre' | 'teacher', targetId: string) => {
    const groups = fx.groups.filter(
      (g) => (targetType === 'centre' ? g.centreId : g.teacherId) === targetId,
    );
    for (const g of groups) {
      const list = familySeats.get(g.id) ?? [];
      const at = used.get(`${targetType}:${g.id}`) ?? 0;
      if (at < list.length) {
        used.set(`${targetType}:${g.id}`, at + 1);
        return { enrolmentId: list[at]!, g };
      }
    }
    return null;
  };
  const guardianOf = (enrolmentId: string) =>
    enrolments.find((e) => e.id === enrolmentId)!.guardian_id;
  for (const r of fx.reviews) {
    const at = enrolmentFor(r.targetType, r.targetId);
    if (!at) continue;
    const id = demoId(r.id);
    reviewRows.push({
      id,
      enrolment_id: at.enrolmentId,
      guardian_id: guardianOf(at.enrolmentId),
      target_type: r.targetType,
      target_id: demoId(r.targetId),
      centre_id: demoId(at.g.centreId),
      school_year_id: demoId(r.schoolYearId),
      stars: r.stars,
      tags: r.tags,
      body: r.body.ar,
      visibility: 'public',
      status: 'published',
      published_at: cairoToUtc(r.publishedOn, '12:00'),
      created_at: cairoToUtc(r.publishedOn, '12:00'),
    });
    if (r.reply)
      replies.push({
        id: demoId(`reply:${r.id}`),
        review_id: id,
        centre_id: demoId(at.g.centreId),
        author_user_id: o.ownerOf(at.g.centreId),
        body: r.reply.body.ar,
        created_at: cairoToUtc(r.publishedOn, '18:00'),
      });
  }
  for (const p of mfx.privateFeedback) {
    const at = enrolmentFor(p.target, p.targetId);
    if (!at) continue;
    reviewRows.push({
      id: demoId(p.id),
      enrolment_id: at.enrolmentId,
      guardian_id: guardianOf(at.enrolmentId),
      target_type: p.target,
      target_id: demoId(p.targetId),
      centre_id: demoId(at.g.centreId),
      school_year_id: demoId(p.schoolYearId),
      stars: p.stars,
      tags: [],
      body: p.body.ar,
      visibility: 'private',
      status: 'published',
      published_at: cairoToUtc(addDays(today, -p.daysAgo), '12:00'),
      created_at: cairoToUtc(addDays(today, -p.daysAgo), '12:00'),
    });
  }
  await put('market.reviews', reviewRows);
  await put('market.review_replies', replies);
  // The sample ratings are the fixtures' distributions (more reviews than the rows above), so the
  // stats the review trigger just counted are replaced by them.
  await sql`DELETE FROM market.review_stats`.execute(db);
  return { enrolments: enrolments.length, payments: payments.length, transactions: txns.length };
}
