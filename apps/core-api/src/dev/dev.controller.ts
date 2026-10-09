import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  type OnModuleDestroy,
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
const ExtraBody = z.object({ on: z.boolean() });

/** The connected story's fixed parts (docs/testing/walkthrough.md; same as the mock's STORY). */
const STORY = {
  centreId: demoId('cen-nour'),
  hallId: demoId('hall-nour-1'),
  teacherId: demoId('tch-salma'),
  weekday: 6,
  start: '16:00',
};

const migratorUrl = () => {
  const url = process.env.DATABASE_URL_MIGRATOR;
  if (!url) throw new Problem(500, 'internal_error', 'DATABASE_URL_MIGRATOR is not set.');
  return url;
};

@Controller('__demo')
export class DevController implements OnModuleDestroy {
  private migrator?: Kysely<unknown>;

  constructor(
    @Inject(Database) private readonly app: Database,
    @Inject(Phones) private readonly phones: Phones,
  ) {}

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
        // Enrolments arrive in R2b.
        enrolmentId: null,
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

  @Post('story/extra')
  @HttpCode(200)
  async storyExtra(@Body() raw: unknown) {
    const b = ExtraBody.parse(raw);
    await this.setFlag(FLAG.followupExtra, 'centre', STORY.centreId, b.on);
    return this.story();
  }
}
