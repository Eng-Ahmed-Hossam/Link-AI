// pnpm test:money — property tests (docs/08 §9): random sequences of money events, posted through
// the real ledger, always keep INV-01 (every transaction balances) and INV-15 (payee balances never
// go negative), match a simple model to the piaster, and change nothing when replayed.
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNT, balance, post, trialBalance } from '../../src/ledger/ledger';
import {
  fee,
  p1Capture,
  p2Release,
  p3RentDeduction,
  p5Settlement,
  p7RefundApproved,
  p7RefundConfirmed,
  refundSplit,
  rentFeeShare,
} from '../../src/ledger/postings';
import { spread } from '../../src/ledger/rent';
import { uuidv7 } from '../../src/platform/ids';
import { type Api, startApi } from '../helpers';

let api: Api;
beforeAll(async () => {
  api = await startApi();
}, 120_000);
afterAll(() => api.close());

const RATES = ['0.00', '5.00', '7.50', '10.00', '12.25'];

describe('Pure rules (BR-FEE-04, BR-MNY-09, BR-RNT-06, BR-RNT-09)', () => {
  it('a fee is the exact percentage rounded down, never more than the gross', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50_000_000 }),
        fc.constantFrom(...RATES),
        (gross, rate) => {
          const f = fee(gross, rate);
          const exact = (gross * Number(rate)) / 100;
          expect(f).toBeLessThanOrEqual(exact);
          expect(exact - f).toBeLessThan(1);
          expect(f).toBeLessThanOrEqual(gross);
        },
      ),
    );
  });

  it('a payment spread over its sessions adds up exactly, earliest sessions first', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 1, max: 31 }),
        (amount, k) => {
          const shares = [
            ...spread(
              amount,
              Array.from({ length: k }, (_, i) => `s${i}`),
            ).values(),
          ];
          expect(shares.reduce((a, b) => a + b, 0)).toBe(amount);
          expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
          expect([...shares].sort((a, b) => b - a)).toEqual(shares);
        },
      ),
    );
  });

  it('the parts of a rent invoice carry fee shares that add up to the fee', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5_000_000 }),
        fc.constantFrom('5.00', '7.50', '10.00'),
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 5 }),
        (gross, rate, weights) => {
          const linkFee = fee(gross, rate);
          const total = weights.reduce((a, b) => a + b, 0);
          let remaining = gross;
          let taken = 0;
          weights.forEach((w, i) => {
            const last = i === weights.length - 1;
            const part = last ? remaining : Math.floor((gross * w) / total);
            const share = rentFeeShare({ gross, fee: linkFee, part, feeAlreadyTaken: taken, last });
            expect(share).toBeGreaterThanOrEqual(0);
            taken += share;
            remaining -= part;
          });
          expect(taken).toBe(linkFee);
        },
      ),
    );
  });

  it('partial refunds reverse the commission so what is kept is the fee on what was not refunded', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5_000_000 }),
        fc.constantFrom(...RATES),
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 4 }),
        (paid, rate, cuts) => {
          const commission = fee(paid, rate);
          let refunded = 0;
          let reversed = 0;
          for (const c of cuts) {
            const r = Math.min(paid - refunded, Math.max(1, Math.floor((paid * c) / 400)));
            if (r <= 0) break;
            const s = refundSplit({
              paid,
              commission,
              ratePct: rate,
              alreadyRefunded: refunded,
              refund: r,
            });
            expect(s.commissionReversed).toBeGreaterThanOrEqual(0);
            expect(s.teacherShare).toBeGreaterThanOrEqual(0);
            refunded += r;
            reversed += s.commissionReversed;
            expect(commission - reversed).toBe(
              paid - refunded > 0 ? fee(paid - refunded, rate) : 0,
            );
          }
        },
      ),
    );
  });
});

type Ev =
  | { t: 'capture'; amount: number; rate: string }
  | { t: 'release'; i: number }
  | { t: 'refund'; i: number; pct: number }
  | { t: 'settle'; i: number }
  | { t: 'rent'; gross: number };

const event: fc.Arbitrary<Ev> = fc.oneof(
  fc.record({
    t: fc.constant('capture' as const),
    amount: fc.integer({ min: 100, max: 2_000_000 }),
    rate: fc.constantFrom(...RATES),
  }),
  fc.record({ t: fc.constant('release' as const), i: fc.nat(20) }),
  fc.record({
    t: fc.constant('refund' as const),
    i: fc.nat(20),
    pct: fc.integer({ min: 1, max: 100 }),
  }),
  fc.record({ t: fc.constant('settle' as const), i: fc.nat(20) }),
  fc.record({ t: fc.constant('rent' as const), gross: fc.integer({ min: 0, max: 1_500_000 }) }),
);

describe('Random event sequences on the real ledger (INV-01, INV-15, BR-MNY-04)', () => {
  it('balances match the model, never go negative, and a replay moves nothing', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(event, { minLength: 1, maxLength: 25 }), async (events) => {
        const teacher = uuidv7();
        const centre = uuidv7();
        const provider = `prop-${teacher.slice(-8)}`;
        const pays: {
          key: string;
          amount: number;
          rate: string;
          commission: number;
          refunded: number;
          released: boolean;
          settled: boolean;
        }[] = [];
        const m = { pending: 0, available: 0, centre: 0 };
        const posted: Parameters<typeof post>[1][] = [];
        for (const e of events) {
          let p: Parameters<typeof post>[1] | null = null;
          if (e.t === 'capture') {
            const commission = fee(e.amount, e.rate);
            const key = `prop:capture:${uuidv7()}`;
            pays.push({
              key,
              amount: e.amount,
              rate: e.rate,
              commission,
              refunded: 0,
              released: false,
              settled: false,
            });
            p = {
              kind: 'payment_captured',
              key,
              description: 'p',
              lines: p1Capture({ provider, teacherId: teacher, amount: e.amount, commission }),
            };
            m.pending += e.amount - commission;
          } else if (e.t === 'release') {
            const x = pays[e.i % Math.max(1, pays.length)];
            if (x && !x.released) {
              // Pending for this payment: its share less what refunds already took back.
              const share = x.amount - x.commission - (x.refunded ? sharesTaken(x) : 0);
              x.released = true;
              if (share > 0) {
                p = {
                  kind: 'funds_released',
                  key: `prop:release:${x.key}`,
                  description: 'p',
                  lines: p2Release({ teacherId: teacher, amount: share }),
                };
                m.pending -= share;
                m.available += share;
              }
            }
          } else if (e.t === 'refund') {
            const x = pays[e.i % Math.max(1, pays.length)];
            const r = x
              ? Math.min(x.amount - x.refunded, Math.max(1, Math.floor((x.amount * e.pct) / 100)))
              : 0;
            if (x && r > 0) {
              const s = refundSplit({
                paid: x.amount,
                commission: x.commission,
                ratePct: x.rate,
                alreadyRefunded: x.refunded,
                refund: r,
              });
              // INV-15: a refund after release that the balance cannot cover is an ops case, not generated here.
              if (!x.released || m.available >= s.teacherShare) {
                const key = `prop:refund:${uuidv7()}`;
                p = {
                  kind: 'refund',
                  key,
                  description: 'p',
                  lines: p7RefundApproved({
                    provider,
                    teacherId: teacher,
                    refund: r,
                    commissionReversed: s.commissionReversed,
                    released: x.released,
                  }),
                };
                posted.push(p);
                await api.s.db.asSystem((t) => post(t, p!));
                p = {
                  kind: 'refund_confirmed',
                  key: `${key}:confirmed`,
                  description: 'p',
                  lines: p7RefundConfirmed({ provider, refund: r }),
                };
                if (x.released) m.available -= s.teacherShare;
                else m.pending -= s.teacherShare;
                x.refunded += r;
                takenBy.set(x.key, (takenBy.get(x.key) ?? 0) + s.teacherShare);
              }
            }
          } else if (e.t === 'settle') {
            const x = pays[e.i % Math.max(1, pays.length)];
            if (x && !x.settled) {
              x.settled = true;
              p = {
                kind: 'settlement',
                key: `prop:settle:${x.key}`,
                description: 'p',
                lines: p5Settlement({
                  provider,
                  amount: x.amount,
                  providerFee: Math.floor(x.amount * 0.02),
                }),
              };
            }
          } else {
            const deducted = Math.min(e.gross, m.available);
            if (deducted > 0) {
              const linkFee = fee(e.gross, '5.00');
              const share = rentFeeShare({
                gross: e.gross,
                fee: linkFee,
                part: deducted,
                feeAlreadyTaken: 0,
                last: deducted === e.gross,
              });
              p = {
                kind: 'rent_deduction',
                key: `prop:rent:${uuidv7()}`,
                description: 'p',
                lines: p3RentDeduction({
                  teacherId: teacher,
                  centreId: centre,
                  deducted,
                  feeShare: share,
                }),
              };
              m.available -= deducted;
              m.centre += deducted - share;
            }
          }
          if (p) {
            posted.push(p);
            await api.s.db.asSystem((t) => post(t, p!));
          }
        }
        const got = await api.s.db.asSystem(async (t) => ({
          pending: await balance(t, ACCOUNT.teacherPending(teacher)),
          available: await balance(t, ACCOUNT.teacherAvailable(teacher)),
          centre: await balance(t, ACCOUNT.centreAvailable(centre)),
          trial: await trialBalance(t),
        }));
        expect({ pending: got.pending, available: got.available, centre: got.centre }).toEqual(m);
        expect(got.pending).toBeGreaterThanOrEqual(0);
        expect(got.available).toBeGreaterThanOrEqual(0);
        expect(got.centre).toBeGreaterThanOrEqual(0);
        expect(got.trial.debit).toBe(got.trial.credit);
        // Every event again (a retried webhook or job): nothing is created, nothing moves.
        for (const p of posted)
          expect((await api.s.db.asSystem((t) => post(t, p))).created).toBe(false);
        expect(await api.s.db.asSystem((t) => balance(t, ACCOUNT.teacherPending(teacher)))).toBe(
          m.pending,
        );
      }),
      { numRuns: 60 },
    );
  }, 300_000);
});

/** What refunds took back from a payment's pending share, per payment (P7 before release). */
const takenBy = new Map<string, number>();
function sharesTaken(x: { key: string }) {
  return takenBy.get(x.key) ?? 0;
}
