import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  type OnModuleDestroy,
  Param,
  Post,
} from '@nestjs/common';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { z } from 'zod';
import { demoId } from '../../seeds/demo-id';
import { Phones } from '../identity/phone';
import { pendingCentres, verifyCentre } from '../ops/verify-centre';
import { Database } from '../platform/db';
import { FLAG, centreFlag } from '../platform/flags';
import { Problem } from '../platform/problem';
import { CONFIG } from '../platform/di';
import type { Config } from '../config';
import { EnrolmentJobs } from '../enrolment/jobs';
import { RentInvoices } from '../ledger/rent-invoices';
import { Money } from '../payments/money';
import { LOGGER, type Logger } from '../platform/logger';
import { Redises } from '../platform/redis';
import { addDays, cairoToday, isoWeekday } from '../platform/time';
import { Scheduler, moneyJobs } from '../worker/jobs';

/**
 * Demo controls for live mode (docs/14 §5.2). This controller is registered ONLY when
 * APP_ENV=local (see app.module.ts), so these paths do not exist anywhere else. Sample data only.
 */
const FeaturesBody = z.object({ centreId: z.uuid(), followupExtra: z.boolean() });
const SettingsBody = z.object({
  marketplace: z.boolean().optional(),
  phase2: z.boolean().optional(),
});

/** The Phase 2 flags the demo "Phase 2" switch turns on together (api-client PHASE2_FLAGS). */
const PHASE2 = [
  'followup.owner_nav',
  'followup.records',
  'followup.voice_notes',
  'followup.whatsapp_updates',
  'parent.updates_feed',
  'teacher.recorded_badge',
];

const VerifyBody = z.object({ centreId: z.uuid() });
const JobBody = z.object({ name: z.string().max(40) });
const ExtraBody = z.object({ on: z.boolean() });

/** The connected story's fixed parts (docs/testing/walkthrough.md; same as the mock's STORY). */
const STORY = {
  centreId: demoId('cen-nour'),
  hallId: demoId('hall-nour-1'),
  teacherId: demoId('tch-salma'),
  weekday: 6,
  start: '16:00',
  childId: demoId('chd-mariam'),
};

const migratorUrl = () => {
  const url = process.env.DATABASE_URL_MIGRATOR;
  if (!url) throw new Problem(500, 'internal_error', 'DATABASE_URL_MIGRATOR is not set.');
  return url;
};

@Controller('__demo')
export class DevController implements OnModuleDestroy {
  private migrator?: Kysely<unknown>;

  private readonly scheduler: Scheduler;

  constructor(
    @Inject(Database) private readonly app: Database,
    @Inject(Phones) private readonly phones: Phones,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(Redises) redis: Redises,
    @Inject(LOGGER) log: Logger,
    @Inject(Money) money: Money,
    @Inject(EnrolmentJobs) jobs: EnrolmentJobs,
    @Inject(RentInvoices) rent: RentInvoices,
  ) {
    this.scheduler = new Scheduler(redis, log, moneyJobs({ jobs, money, rent }));
  }

  /** Flags are ops data (app_ops in production); locally the migrator writes them. */
  private db() {
    return (this.migrator ??= new Kysely<unknown>({
      dialect: new PostgresDialect({
        pool: new pg.Pool({ connectionString: migratorUrl(), max: 2 }),
      }),
    }));
  }

  async onModuleDestroy() {
    await this.migrator?.destroy();
  }

  /** Wipe the local database back to the demo world (`pnpm seed:demo`). */
  @Post('reset')
  @HttpCode(200)
  async reset() {
    // Imported here so the sample fixtures load only when someone resets.
    const { seedDemo } = await import('../../seeds/demo');
    return seedDemo(migratorUrl());
  }

  /** Paid extra per centre (OD-58), as Link ops would switch it. */
  @Post('features')
  @HttpCode(200)
  async features(@Body() raw: unknown) {
    const b = FeaturesBody.parse(raw);
    await this.setFlag(FLAG.followupExtra, 'centre', b.centreId, b.followupExtra);
    return { followupExtra: b.followupExtra };
  }

  /** Global switches: the marketplace and the Phase 2 surfaces. */
  @Post('settings')
  @HttpCode(200)
  async settings(@Body() raw: unknown) {
    const b = SettingsBody.parse(raw);
    if (b.marketplace !== undefined)
      await this.setFlag(FLAG.marketplace, 'global', null, b.marketplace);
    if (b.phase2 !== undefined)
      for (const k of PHASE2) await this.setFlag(k, 'global', null, b.phase2);
    return { ok: true };
  }

  private async setFlag(
    key: string,
    scope: 'global' | 'centre',
    scopeId: string | null,
    on: boolean,
  ) {
    await sql`INSERT INTO platform.feature_flags (key, scope_type, scope_id, enabled)
      VALUES (${key}, ${scope}, ${scopeId ?? '00000000-0000-0000-0000-000000000000'}, ${on})
      ON CONFLICT (key, scope_type, scope_id) DO UPDATE SET enabled = EXCLUDED.enabled`.execute(
      this.db(),
    );
  }

  // ── Local ops stand-ins (the ops console comes later) ─────────────────────────
  /** Pending centres and moved pins waiting for Link ops. */
  @Get('pending-centres')
  pending() {
    return pendingCentres(this.app);
  }

  /** Verify a centre as Link ops would (audited, like `pnpm ops:verify-centre`). */
  @Post('verify-centre')
  @HttpCode(200)
  async verify(@Body() raw: unknown) {
    const b = VerifyBody.parse(raw);
    return verifyCentre(this.app, this.phones, b.centreId, 'demo_tools');
  }

  // ── The connected story (same paths and shapes as the mock server) ────────────
  /** Where the story is: its request, booking, group and enrolment, from the database. */
  @Get('story')
  story() {
    return this.app.asSystem(async (tx) => {
      const request = await tx
        .selectFrom('market.teacher_applications')
        .select(['id', 'stage', 'room_booking_id', 'requested_slots'])
        .where('teacher_id', '=', STORY.teacherId)
        .where('room_id', '=', STORY.hallId)
        .orderBy('created_at', 'desc')
        .execute()
        .then((rows) =>
          rows.find((r) =>
            (r.requested_slots as { weekday: number; start: string }[]).some(
              (x) => x.weekday === STORY.weekday && x.start === STORY.start,
            ),
          ),
        );
      const group = request?.room_booking_id
        ? await tx
            .selectFrom('market.groups')
            .select('id')
            .where('room_booking_id', '=', request.room_booking_id)
            .executeTakeFirst()
        : undefined;
      const done = group
        ? await tx
            .selectFrom('market.group_sessions')
            .select(sql<number>`count(*)::int`.as('n'))
            .where('group_id', '=', group.id)
            .where('starts_at', '<', new Date())
            .executeTakeFirstOrThrow()
        : { n: 0 };
      return {
        requestId: request?.id ?? null,
        stage: request?.stage ?? null,
        bookingId: request?.room_booking_id ?? null,
        groupId: group?.id ?? null,
        // Mariam's latest enrolment in the story group (the card seat of step 4).
        enrolmentId: group
          ? ((
              await tx
                .selectFrom('market.enrolments')
                .select('id')
                .where('group_id', '=', group.id)
                .where('student_id', '=', STORY.childId)
                .orderBy('created_at', 'desc')
                .executeTakeFirst()
            )?.id ?? null)
          : null,
        sessionsDone: done.n,
        followupExtra: await centreFlag(tx, FLAG.followupExtra, STORY.centreId),
      };
    });
  }

  /** "Reset story": the demo world, with the marketplace, Phase 2 and the Follow-up extra on. */
  @Post('story/reset')
  @HttpCode(200)
  async storyReset() {
    await this.reset();
    await this.setFlag(FLAG.marketplace, 'global', null, true);
    for (const k of PHASE2) await this.setFlag(k, 'global', null, true);
    await this.setFlag(FLAG.followupExtra, 'centre', STORY.centreId, true);
    return this.story();
  }

  /**
   * "Simulate first session done": the story group's calendar moves back so its next session took
   * place last Saturday (the booking, the enrolments' paid periods and the payments move with it),
   * exactly as the mock does. Session IDs stay, so seat counters stay right.
   */
  @Post('story/session-done')
  @HttpCode(200)
  async storySessionDone() {
    const { groupId } = await this.story();
    if (!groupId) throw new Problem(409, 'no_story_group', 'Open the story group first (step 3).');
    const today = cairoToday();
    let target = addDays(today, -1);
    while (isoWeekday(target) !== STORY.weekday) target = addDays(target, -1);
    // Moving a calendar is data surgery for the demo only: the migrator does it, as for flags.
    await this.db()
      .transaction()
      .execute(async (tx) => {
        const next = await sql<{ day: string }>`
        SELECT market.session_day(starts_at)::text AS day FROM market.group_sessions
        WHERE group_id = ${groupId} AND market.session_day(starts_at) >= ${today}::date
        ORDER BY starts_at LIMIT 1`.execute(tx);
        const day = next.rows[0]?.day;
        if (!day) throw new Problem(409, 'no_session', 'No upcoming session to complete.');
        const days = Math.round((Date.parse(day) - Date.parse(target)) / 86_400_000);
        const by = sql.lit(`${days} days`);
        // Two steps: shifting in place would meet the (group, starts_at) key on the way.
        await sql`UPDATE market.group_sessions SET starts_at = starts_at + interval '1000 years', ends_at = ends_at + interval '1000 years' WHERE group_id = ${groupId}`.execute(
          tx,
        );
        await sql`UPDATE market.group_sessions SET starts_at = starts_at - interval '1000 years' - ${by}::interval, ends_at = ends_at - interval '1000 years' - ${by}::interval WHERE group_id = ${groupId}`.execute(
          tx,
        );
        await sql`UPDATE market.group_sessions SET status = 'held', status_changed_at = now() WHERE group_id = ${groupId} AND status = 'scheduled' AND ends_at <= now()`.execute(
          tx,
        );
        await sql`UPDATE market.groups SET starts_on = starts_on - ${days}::int WHERE id = ${groupId}`.execute(
          tx,
        );
        await sql`UPDATE market.room_bookings b SET starts_on = b.starts_on - ${days}::int FROM market.groups g WHERE g.id = ${groupId} AND b.id = g.room_booking_id`.execute(
          tx,
        );
        await sql`UPDATE market.room_booking_slots s SET active_dates = daterange(lower(s.active_dates) - ${days}::int, upper(s.active_dates), '[)') FROM market.groups g WHERE g.id = ${groupId} AND s.booking_id = g.room_booking_id`.execute(
          tx,
        );
        await sql`UPDATE market.teacher_applications a SET starts_on = a.starts_on - ${days}::int FROM market.groups g WHERE g.id = ${groupId} AND a.room_booking_id = g.room_booking_id`.execute(
          tx,
        );
        await sql`UPDATE market.enrolments SET current_period_start = current_period_start - ${days}::int, current_period_end = current_period_end - ${days}::int WHERE group_id = ${groupId} AND current_period_start IS NOT NULL`.execute(
          tx,
        );
        await sql`UPDATE ledger.payments p SET period_start = p.period_start - ${days}::int, period_end = p.period_end - ${days}::int FROM market.enrolments e WHERE e.id = p.enrolment_id AND e.group_id = ${groupId} AND p.period_start IS NOT NULL`.execute(
          tx,
        );
      });
    return this.story();
  }

  /** The parent pays a Fawry reference at an outlet (fake-pay sends the signed webhook). */
  @Post('fawry/:enrolmentId/pay')
  @HttpCode(200)
  async payFawry(@Param('enrolmentId') enrolmentId: string) {
    const p = await this.app.asSystem((tx) =>
      tx
        .selectFrom('ledger.payments')
        .select('fawry_reference')
        .where('enrolment_id', '=', z.uuid().parse(enrolmentId))
        .where('method', '=', 'fawry')
        .where('fawry_reference', 'is not', null)
        .orderBy('created_at', 'desc')
        .executeTakeFirst(),
    );
    if (!p?.fawry_reference)
      throw new Problem(404, 'not_found', 'No Fawry reference for this enrolment.');
    const r = await fetch(
      `${this.config.FAKE_PAY_URL}/v1/fawry-references/${p.fawry_reference}/pay`,
      { method: 'POST' },
    );
    return { ok: r.ok };
  }

  /** Run one scheduled job now (hold-expiry, funds-release, settlement, rent-invoices, …). */
  @Post('jobs/run')
  @HttpCode(200)
  async runJob(@Body() raw: unknown) {
    const b = JobBody.parse(raw);
    try {
      return { job: b.name, result: (await this.scheduler.runNow(b.name)) ?? null };
    } catch (e) {
      throw new Problem(422, 'unknown_job', (e as Error).message);
    }
  }

  @Post('story/extra')
  @HttpCode(200)
  async storyExtra(@Body() raw: unknown) {
    const b = ExtraBody.parse(raw);
    await this.setFlag(FLAG.followupExtra, 'centre', STORY.centreId, b.on);
    return this.story();
  }
}
