import { Body, Controller, HttpCode, type OnModuleDestroy, Post } from '@nestjs/common';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { z } from 'zod';
import { FLAG } from '../platform/flags';
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

const migratorUrl = () => {
  const url = process.env.DATABASE_URL_MIGRATOR;
  if (!url) throw new Problem(500, 'internal_error', 'DATABASE_URL_MIGRATOR is not set.');
  return url;
};

@Controller('__demo')
export class DevController implements OnModuleDestroy {
  private migrator?: Kysely<unknown>;

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
}
