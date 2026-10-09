// pnpm test:money — golden tests: the worked examples A–I of docs/01 §13, to the piaster, through
// the same posting builders, ledger and rent job the money paths use (docs/08 §9).
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoId } from '../../seeds/demo';
import { ACCOUNT, balance, post } from '../../src/ledger/ledger';
import {
  fee,
  p1Capture,
  p2Release,
  p3RentDeduction,
  p4RentTopup,
  p7RefundApproved,
  p7RefundConfirmed,
  p12RentReversal,
  refundSplit,
  rentFeeShare,
} from '../../src/ledger/postings';
import { rentInvoice, rentReversal, spread } from '../../src/ledger/rent';
import { uuidv7 } from '../../src/platform/ids';
import { type Api, startApi } from '../helpers';

let api: Api;
beforeAll(async () => {
  api = await startApi();
}, 120_000);
afterAll(() => api.close());

/** Fresh payees per example, so balances start at zero. */
const payees = () => ({ teacher: uuidv7(), centre: uuidv7() });
const tx = <T>(f: Parameters<Api['s']['db']['asSystem']>[0]) => api.s.db.asSystem(f) as Promise<T>;
const bal = (code: string) => api.s.db.asSystem((t) => balance(t, code));
const postAll = (
  ...ps: { kind: Parameters<typeof post>[1]['kind']; lines: Parameters<typeof post>[1]['lines'] }[]
) =>
  tx(async (t) => {
    for (const p of ps)
      await post(t, { ...p, key: `golden:${uuidv7()}`, description: 'golden test' });
  });

describe('Example A — hall-rent marketing fee (BR-FEE-01, BR-RNT-06)', () => {
  it('EGP 2,000 rent: 5% → 100 / 1,900; 10% → 200 / 1,800', async () => {
    for (const [pct, linkFee, net] of [
      ['5.00', 10_000, 190_000],
      ['10.00', 20_000, 180_000],
    ] as const) {
      const r = rentInvoice({
        rule: { type: 'fixed_per_session', amountPt: 200_000 },
        feePct: pct,
        heldSessions: 1,
        studentSessions: 0,
        feesBasePt: 0,
        adjustmentPt: 0,
      });
      expect([r.grossPt, r.linkFeePt, r.netToCentrePt]).toEqual([200_000, linkFee, net]);
      const { teacher, centre } = payees();
      await postAll(
        {
          kind: 'adjustment',
          lines: [
            { account: ACCOUNT.bank, debit: 200_000 },
            { account: ACCOUNT.teacherAvailable(teacher), credit: 200_000 },
          ],
        },
        {
          kind: 'rent_deduction',
          lines: p3RentDeduction({
            teacherId: teacher,
            centreId: centre,
            deducted: 200_000,
            feeShare: r.linkFeePt,
          }),
        },
      );
      expect(await bal(ACCOUNT.centreAvailable(centre))).toBe(net);
      expect(await bal(ACCOUNT.teacherAvailable(teacher))).toBe(0);
    }
  });
});

describe('Example B — one student, EGP 550, 5% commission, rent 20% of fees', () => {
  it('teacher 41,250 + centre 10,450 + Link 3,300 = 55,000', async () => {
    const { teacher, centre } = payees();
    const commission = fee(55_000, '5.00');
    expect(commission).toBe(2_750);
    const rent = rentInvoice({
      rule: { type: 'percent_of_fees', pct: '20.00' },
      feePct: '5.00',
      heldSessions: 8,
      studentSessions: 0,
      feesBasePt: 55_000,
      adjustmentPt: 0,
    });
    expect([rent.grossPt, rent.linkFeePt, rent.netToCentrePt]).toEqual([11_000, 550, 10_450]);
    const before = await bal(ACCOUNT.bookingCommission);
    const rentBefore = await bal(ACCOUNT.rentFee);
    await postAll(
      {
        kind: 'payment_captured',
        lines: p1Capture({ provider: 'fake', teacherId: teacher, amount: 55_000, commission }),
      },
      { kind: 'funds_released', lines: p2Release({ teacherId: teacher, amount: 52_250 }) },
      {
        kind: 'rent_deduction',
        lines: p3RentDeduction({
          teacherId: teacher,
          centreId: centre,
          deducted: 11_000,
          feeShare: 550,
        }),
      },
    );
    const t = await bal(ACCOUNT.teacherAvailable(teacher));
    const c = await bal(ACCOUNT.centreAvailable(centre));
    const link =
      (await bal(ACCOUNT.bookingCommission)) - before + (await bal(ACCOUNT.rentFee)) - rentBefore;
    expect([t, c, link]).toEqual([41_250, 10_450, 3_300]);
    expect(t + c + link).toBe(55_000);
  });
});

describe('Example C — a full group of 25 (J02 estimate)', () => {
  it('teacher keeps 10,312.50; centre 2,612.50; Link 825.00', () => {
    const fees = 25 * 55_000;
    const commission = 25 * fee(55_000, '5.00'); // taken from each payment
    const rent = rentInvoice({
      rule: { type: 'percent_of_fees', pct: '20.00' },
      feePct: '5.00',
      heldSessions: 8,
      studentSessions: 0,
      feesBasePt: fees,
      adjustmentPt: 0,
    });
    expect(fees).toBe(1_375_000);
    expect(commission).toBe(68_750);
    expect(rent.grossPt).toBe(275_000);
    expect(fees - commission - rent.grossPt).toBe(1_031_250);
    expect(rent.netToCentrePt).toBe(261_250);
    expect(commission + rent.linkFeePt).toBe(82_500);
  });
});

describe('Example D — refund before the first session (P7, BR-FEE-05)', () => {
  it('380.00 back; commission 19.00 and held 361.00 reversed; nothing left anywhere', async () => {
    const { teacher } = payees();
    const commission = fee(38_000, '5.00');
    expect(commission).toBe(1_900);
    const split = refundSplit({
      paid: 38_000,
      commission,
      ratePct: '5.00',
      alreadyRefunded: 0,
      refund: 38_000,
    });
    expect(split).toEqual({ commissionReversed: 1_900, teacherShare: 36_100 });
    const clearing = await bal(ACCOUNT.providerClearing('golden-d'));
    await postAll(
      {
        kind: 'payment_captured',
        lines: p1Capture({ provider: 'golden-d', teacherId: teacher, amount: 38_000, commission }),
      },
      {
        kind: 'refund',
        lines: p7RefundApproved({
          provider: 'golden-d',
          teacherId: teacher,
          refund: 38_000,
          commissionReversed: 1_900,
          released: false,
        }),
      },
      {
        kind: 'refund_confirmed',
        lines: p7RefundConfirmed({ provider: 'golden-d', refund: 38_000 }),
      },
    );
    expect(await bal(ACCOUNT.teacherPending(teacher))).toBe(0);
    expect(await bal(ACCOUNT.refundsInTransit('golden-d'))).toBe(0);
    expect(await bal(ACCOUNT.providerClearing('golden-d'))).toBe(clearing);
  });
});

describe('Example E — rent shortfall paid in two parts (BR-RNT-05/06, P3 + P4)', () => {
  it('1,200 deducted (fee 60) + 800 topped up (fee 40) = 2,000 (fee 100, centre 1,900)', async () => {
    const { teacher, centre } = payees();
    const part1 = rentFeeShare({
      gross: 200_000,
      fee: 10_000,
      part: 120_000,
      feeAlreadyTaken: 0,
      last: false,
    });
    const part2 = rentFeeShare({
      gross: 200_000,
      fee: 10_000,
      part: 80_000,
      feeAlreadyTaken: part1,
      last: true,
    });
    expect([part1, part2]).toEqual([6_000, 4_000]);
    await postAll(
      {
        kind: 'adjustment',
        lines: [
          { account: ACCOUNT.bank, debit: 120_000 },
          { account: ACCOUNT.teacherAvailable(teacher), credit: 120_000 },
        ],
      },
      {
        kind: 'rent_deduction',
        lines: p3RentDeduction({
          teacherId: teacher,
          centreId: centre,
          deducted: 120_000,
          feeShare: part1,
        }),
      },
      {
        kind: 'rent_topup',
        lines: p4RentTopup({ provider: 'fake', centreId: centre, amount: 80_000, feeShare: part2 }),
      },
    );
    expect(await bal(ACCOUNT.centreAvailable(centre))).toBe(190_000);
    expect(await bal(ACCOUNT.teacherAvailable(teacher))).toBe(0);
  });
});

describe('Example F — per-student rent (C07)', () => {
  it('EGP 15 × 304 student-sessions = 4,560; fee 228; net 4,332', () => {
    const r = rentInvoice({
      rule: { type: 'per_student_per_session', amountPt: 1_500 },
      feePct: '5.00',
      heldSessions: 8,
      studentSessions: 304,
      feesBasePt: 0,
      adjustmentPt: 0,
    });
    expect([r.grossPt, r.linkFeePt, r.netToCentrePt]).toEqual([456_000, 22_800, 433_200]);
  });
});

describe('Example G — rounding (BR-MNY-09, OD-16)', () => {
  it('5% of 137.45 is 6.8725: Link takes 6.87, the teacher 130.58', async () => {
    expect(fee(13_745, '5.00')).toBe(687);
    const { teacher } = payees();
    await postAll({
      kind: 'payment_captured',
      lines: p1Capture({ provider: 'fake', teacherId: teacher, amount: 13_745, commission: 687 }),
    });
    expect(await bal(ACCOUNT.teacherPending(teacher))).toBe(13_058);
  });
});

describe('Example H — "% of fees" rent with a 3rd-to-3rd plan (BR-RNT-09, OD-43)', () => {
  const sessions = [
    '2026-11-04',
    '2026-11-07',
    '2026-11-11',
    '2026-11-14',
    '2026-11-18',
    '2026-11-21',
    '2026-11-25',
    '2026-11-28',
    '2026-12-02',
  ];
  it('the spread: 6,112 + 8 × 6,111 = 55,000; Nov/Dec bases; invoices; refund adjustment (pure)', () => {
    const shares = [...spread(55_000, sessions).values()];
    expect(shares).toEqual([6_112, ...Array(8).fill(6_111)]);
    const nov = 25 * shares.slice(0, 8).reduce((a, b) => a + b, 0);
    const dec = 25 * shares[8]!;
    expect([nov, dec]).toEqual([1_222_225, 152_775]);
    const rule = { type: 'percent_of_fees' as const, pct: '20.00' };
    const iNov = rentInvoice({
      rule,
      feePct: '5.00',
      heldSessions: 8,
      studentSessions: 0,
      feesBasePt: nov,
      adjustmentPt: 0,
    });
    const iDec = rentInvoice({
      rule,
      feePct: '5.00',
      heldSessions: 1,
      studentSessions: 0,
      feesBasePt: dec,
      adjustmentPt: 0,
    });
    expect([iNov.grossPt, iNov.linkFeePt, iNov.netToCentrePt]).toEqual([244_445, 12_222, 232_223]);
    expect([iDec.grossPt, iDec.linkFeePt, iDec.netToCentrePt]).toEqual([30_555, 1_527, 29_028]);
    expect(iNov.grossPt + iDec.grossPt).toBe(275_000);
    const after = rentInvoice({
      rule,
      feePct: '5.00',
      heldSessions: 1,
      studentSessions: 0,
      feesBasePt: 24 * 6_111,
      adjustmentPt: -48_889,
    });
    expect([
      after.feesBasePt + after.adjustmentPt,
      after.grossPt,
      after.linkFeePt,
      after.netToCentrePt,
    ]).toEqual([97_775, 19_555, 977, 18_578]);
  });

  it('the same, end to end: 25 paid seats, the November and December invoices from the rent job', async () => {
    const db = api.db;
    const { teacher } = payees();
    const centre = demoId('cen-nour');
    const booking = uuidv7();
    const group = uuidv7();
    const students = Array.from({ length: 25 }, () => ({
      g: uuidv7(),
      s: uuidv7(),
      e: uuidv7(),
      p: uuidv7(),
    }));
    await sql`INSERT INTO org.teachers (id, user_id, display_name, slug) VALUES (${teacher}, ${uuidv7()}, 'Golden H', ${`golden-h-${booking.slice(-6)}`})`.execute(
      db,
    );
    await sql`INSERT INTO market.room_bookings (id, room_id, centre_id, teacher_id, weekly_slots, rent_rule, starts_on, ends_on, status)
      VALUES (${booking}, ${demoId('hall-nour-2')}, ${centre}, ${teacher}, '[]', '{"type":"percent_of_fees","pct":"20.00"}', '2026-11-01', '2027-01-01', 'active')`.execute(
      db,
    );
    await sql`INSERT INTO market.groups (id, teacher_id, centre_id, room_booking_id, subject_id, curriculum_id, school_year_id, weekdays, start_time, end_time, seat_cap, monthly_fee_pt, session_fee_pt, starts_on, status)
      VALUES (${group}, ${teacher}, ${centre}, ${booking}, ${demoId('sub-math')}, ${demoId('cur-national')}, ${demoId('sy-sec2')}, '{3,6}', '17:00', '18:30', 30, 55000, 15000, '2026-11-04', 'closed')`.execute(
      db,
    );
    const sids = sessions.map(() => uuidv7());
    for (const [i, d] of sessions.entries())
      await sql`INSERT INTO market.group_sessions (id, group_id, centre_id, starts_at, ends_at, status)
        VALUES (${sids[i]!}, ${group}, ${centre}, (${d}::date + time '17:00') AT TIME ZONE 'Africa/Cairo', (${d}::date + time '18:30') AT TIME ZONE 'Africa/Cairo', 'held')`.execute(
        db,
      );
    for (const x of students) {
      await sql`INSERT INTO org.guardians (id) VALUES (${x.g})`.execute(db);
      await sql`INSERT INTO org.students (id, display_name, curriculum_id, school_year_id, created_by_guardian_id) VALUES (${x.s}, 'Golden', ${demoId('cur-national')}, ${demoId('sy-sec2')}, ${x.g})`.execute(
        db,
      );
      await sql`INSERT INTO market.enrolments (id, student_id, guardian_id, group_id, centre_id, teacher_id, status, payment_plan, price_pt, first_session_id, current_period_start, current_period_end)
        VALUES (${x.e}, ${x.s}, ${x.g}, ${group}, ${centre}, ${teacher}, 'confirmed', 'single_month', 55000, ${sids[0]!}, '2026-11-03', '2026-12-03')`.execute(
        db,
      );
      await sql`INSERT INTO ledger.payments (id, kind, enrolment_id, payee_type, payee_id, centre_id, amount_pt, commission_pt, method, provider, provider_ref, status, period_start, period_end, idempotency_key, succeeded_at)
        VALUES (${x.p}, 'enrolment', ${x.e}, 'teacher', ${teacher}, ${centre}, 55000, 2750, 'card', 'fake', ${`golden-h-${x.p}`}, 'succeeded', '2026-11-03', '2026-12-03', ${`golden-h-${x.p}`}, now())`.execute(
        db,
      );
    }
    const nov = await api.s.db.asSystem((t) => api.s.rent.issueOne(t, booking, '2026-11'));
    const inv = async (id: string) =>
      (
        await sql<{
          fees_base_pt: string;
          fees_base_adjustment_pt: string;
          gross_amount_pt: string;
          link_fee_amount_pt: string;
          net_to_centre_pt: string;
        }>`
        SELECT fees_base_pt, fees_base_adjustment_pt, gross_amount_pt, link_fee_amount_pt, net_to_centre_pt FROM ledger.rent_invoices WHERE id = ${id}`.execute(
          db,
        )
      ).rows[0]!;
    expect(await inv(nov!)).toEqual({
      fees_base_pt: '1222225',
      fees_base_adjustment_pt: '0',
      gross_amount_pt: '244445',
      link_fee_amount_pt: '12222',
      net_to_centre_pt: '232223',
    });
    // 10 Dec: one student's EGP 550 is refunded in full, after the November invoice.
    const r = students[0]!;
    await sql`INSERT INTO ledger.refunds (id, payment_id, amount_pt, commission_reversed_pt, policy, status, enrolment_id, approved_at, idempotency_key)
      VALUES (${uuidv7()}, ${r.p}, 55000, 2750, 'dispute', 'succeeded', ${r.e}, now() + interval '1 second', ${`golden-h-refund-${r.p}`})`.execute(
      db,
    );
    const dec = await api.s.db.asSystem((t) => api.s.rent.issueOne(t, booking, '2026-12'));
    expect(await inv(dec!)).toEqual({
      fees_base_pt: '146664',
      fees_base_adjustment_pt: '-48889',
      gross_amount_pt: '19555',
      link_fee_amount_pt: '977',
      net_to_centre_pt: '18578',
    });
    // The job is safe to run twice: no second invoice.
    expect(await api.s.db.asSystem((t) => api.s.rent.issueOne(t, booking, '2026-12'))).toBeNull();
  });
});

describe('Example I — refund adjustment larger than the month (BR-RNT-09, OD-43, P12)', () => {
  const rule = { type: 'percent_of_fees' as const, pct: '20.00' };
  it('February floors at 0 and carries −18,889; March 81,111 → 16,222 / 811 / 15,411', () => {
    const feb = rentInvoice({
      rule,
      feePct: '5.00',
      heldSessions: 4,
      studentSessions: 0,
      feesBasePt: 30_000,
      adjustmentPt: -48_889,
    });
    expect([feb.grossPt, feb.linkFeePt, feb.carriedPt]).toEqual([0, 0, -18_889]);
    const mar = rentInvoice({
      rule,
      feePct: '5.00',
      heldSessions: 4,
      studentSessions: 0,
      feesBasePt: 100_000,
      adjustmentPt: feb.carriedPt,
    });
    expect([
      mar.feesBasePt + mar.adjustmentPt,
      mar.grossPt,
      mar.linkFeePt,
      mar.netToCentrePt,
    ]).toEqual([81_111, 16_222, 811, 15_411]);
  });

  it('the booking ended: P12 posts Dr centre 3,589 + Dr rent fee 188 / Cr teacher 3,777, balanced', async () => {
    const r = rentReversal({ pct: '20.00', feePct: '5.00', unabsorbedPt: 18_889 });
    expect(r).toEqual({ rent: 3_777, linkFee: 188, centre: 3_589 });
    const { teacher, centre } = payees();
    const lines = p12RentReversal({
      teacherId: teacher,
      centreId: centre,
      rent: r.rent,
      fee: r.linkFee,
    });
    expect(lines).toEqual([
      { account: ACCOUNT.centreAvailable(centre), debit: 3_589 },
      { account: ACCOUNT.rentFee, debit: 188 },
      { account: ACCOUNT.teacherAvailable(teacher), credit: 3_777 },
    ]);
    await postAll({ kind: 'rent_reversal', lines });
    expect(await bal(ACCOUNT.teacherAvailable(teacher))).toBe(3_777);
  });
});

describe('INV-01 in the database itself', () => {
  it('an unbalanced transaction is refused at commit, whatever writes it', async () => {
    await expect(
      api.s.db.asSystem(async (t) => {
        const id = uuidv7();
        await t
          .insertInto('ledger.ledger_transactions')
          .values({
            id,
            kind: 'adjustment',
            idempotency_key: `bad:${id}`,
            description: 'unbalanced',
          })
          .execute();
        const acct = await t
          .selectFrom('ledger.ledger_accounts')
          .select('id')
          .where('code', '=', ACCOUNT.bank)
          .executeTakeFirstOrThrow();
        await t
          .insertInto('ledger.ledger_entries')
          .values({
            id: uuidv7(),
            transaction_id: id,
            account_id: acct.id,
            debit_pt: '100',
            credit_pt: '0',
          })
          .execute();
      }),
    ).rejects.toThrow(/does not balance/);
  });

  it('entries are append-only: a correction is a reversing transaction', async () => {
    await expect(
      sql`UPDATE ledger.ledger_entries SET debit_pt = debit_pt`.execute(api.db),
    ).rejects.toThrow(/append-only/);
    await expect(sql`DELETE FROM ledger.ledger_transactions`.execute(api.db)).rejects.toThrow(
      /append-only/,
    );
  });

  it('BR-MNY-04: posting the same key twice moves money once', async () => {
    const { teacher } = payees();
    const p = {
      kind: 'payment_captured' as const,
      key: `golden:twice:${teacher}`,
      description: 'twice',
      lines: p1Capture({ provider: 'fake', teacherId: teacher, amount: 10_000, commission: 500 }),
    };
    const a = await api.s.db.asSystem((t) => post(t, p));
    const b = await api.s.db.asSystem((t) => post(t, p));
    expect([a.created, b.created, a.id === b.id]).toEqual([true, false, true]);
    expect(await bal(ACCOUNT.teacherPending(teacher))).toBe(9_500);
  });
});
