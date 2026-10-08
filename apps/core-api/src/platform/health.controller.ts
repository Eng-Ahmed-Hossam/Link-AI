import { Controller, Get, HttpCode, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Database } from './db';
import { Redises } from './redis';

/**
 * Liveness (`/health`: the process answers) and readiness (`/ready`: Postgres and both Redis
 * instances answer). Not part of the /v1 contract.
 */
@Controller()
export class HealthController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Redises) private readonly redis: Redises,
  ) {}

  @Get('health')
  @HttpCode(200)
  health() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const checks: Record<string, 'ok' | 'down'> = {};
    await Promise.all([
      this.db.ping().then(
        () => (checks.postgres = 'ok'),
        () => (checks.postgres = 'down'),
      ),
      this.redis.ping().then(
        () => (checks.redis = 'ok'),
        () => (checks.redis = 'down'),
      ),
    ]);
    const ok = Object.values(checks).every((v) => v === 'ok');
    res.status(ok ? 200 : 503);
    return { status: ok ? 'ready' : 'not_ready', checks };
  }
}
