import type { EnrolmentJobs } from '../enrolment/jobs';
import type { RentInvoices } from '../ledger/rent-invoices';
import type { Money } from '../payments/money';
import type { Logger } from '../platform/logger';
import type { Redises } from '../platform/redis';
import { cairoClock, cairoToday, isoWeekday } from '../platform/time';
import type { Payouts } from '../ledger/payouts';

/**
 * Scheduled jobs (docs/05 §4, docs/08 §4–§8). Each job takes a Redis lock (`SET NX PX`), so only
 * one worker instance runs it; daily and monthly jobs also remember the Cairo day they last ran.
 * Every job is idempotent, so a rerun after a crash is safe.
 */
export interface Job {
  name: string;
  /** Run every N milliseconds … */
  everyMs?: number;
  /** … or once a day at this Cairo time (`HH:MM`) … */
  dailyAt?: string;
  /** … or on this day of the month at `dailyAt` … */
  monthDay?: number;
  /** … or on this ISO weekday (4 = Thursday) at `dailyAt`. */
  weekDay?: number;
  run: () => Promise<unknown>;
}

export function moneyJobs(d: {
  jobs: EnrolmentJobs;
  money: Money;
  rent: RentInvoices;
  /** Off a developer machine only: locally ops press "Run now" (the sample earnings stay put). */
  payouts?: Payouts;
}): Job[] {
  return [
    { name: 'hold-expiry', everyMs: 15_000, run: () => d.jobs.expireHolds() },
    { name: 'waitlist-offer-expiry', everyMs: 60_000, run: () => d.jobs.expireOffers() },
    { name: 'awaiting-teacher-48h', everyMs: 300_000, run: () => d.jobs.autoConfirm() },
    { name: 'sessions-held', everyMs: 60_000, run: () => d.jobs.markHeld() },
    { name: 'plans-ended', everyMs: 300_000, run: () => d.jobs.endFinished() },
    { name: 'funds-release', everyMs: 900_000, run: () => d.money.releaseDue() },
    { name: 'refund-sender', everyMs: 60_000, run: () => d.money.sendPendingRefunds() },
    { name: 'past-due', everyMs: 900_000, run: () => d.jobs.pastDue() },
    { name: 'renewals', dailyAt: '08:00', run: () => d.jobs.renew() },
    { name: 'settlement', dailyAt: '06:00', run: () => d.money.settle() },
    { name: 'seat-rebuild', dailyAt: '03:00', run: () => d.jobs.rebuildSeats() },
    { name: 'rent-invoices', dailyAt: '02:00', monthDay: 1, run: () => d.rent.issue() },
    // S3 (08 §8, OD-04): the weekly payout batch, Thursday 09:00 Cairo, after the 06:00 settlement.
    ...(d.payouts
      ? [{ name: 'payouts', dailyAt: '09:00', weekDay: 4, run: () => d.payouts!.runWeek() }]
      : []),
  ];
}

export class Scheduler {
  constructor(
    private readonly redis: Redises,
    private readonly log: Logger,
    private readonly jobs: Job[],
  ) {}

  async tick(now = new Date()) {
    for (const j of this.jobs) {
      try {
        if (await this.due(j, now)) await this.runLocked(j, now);
      } catch (err) {
        this.log.error({ err, job: j.name }, 'job failed');
      }
    }
  }

  private async due(j: Job, now: Date) {
    if (j.everyMs) return true; // the lock's expiry spaces the runs
    const today = cairoToday(now);
    if (j.monthDay && Number(today.slice(8, 10)) !== j.monthDay) return false;
    if (j.weekDay && isoWeekday(today) !== j.weekDay) return false;
    if (cairoClock(now) < j.dailyAt!) return false;
    return (await this.redis.state.get(this.redis.key('job', 'last', j.name))) !== today;
  }

  private async runLocked(j: Job, now: Date) {
    const lockMs = j.everyMs ?? 10 * 60_000;
    const lock = this.redis.key('job', 'lock', j.name);
    if ((await this.redis.state.set(lock, '1', 'PX', lockMs, 'NX')) !== 'OK') return;
    const started = Date.now();
    const result = await j.run();
    if (!j.everyMs) {
      await this.redis.state.set(
        this.redis.key('job', 'last', j.name),
        cairoToday(now),
        'EX',
        3 * 86_400,
      );
      this.log.info({ job: j.name, result, ms: Date.now() - started }, 'job ran');
    } else if (result) this.log.debug({ job: j.name, result }, 'job ran');
  }

  /** Run one job now, ignoring its schedule (local Demo tools and tests). */
  async runNow(name: string) {
    const j = this.jobs.find((x) => x.name === name);
    if (!j) throw new Error(`unknown job ${name}`);
    return j.run();
  }
}
