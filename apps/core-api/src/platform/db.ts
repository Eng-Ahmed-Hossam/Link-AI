import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';
import type { DB } from '../db/schema';
import { Problem, forbidden, unauthenticated } from './problem';

export type Tx = Transaction<DB>;

/**
 * The per-request RLS context (docs/10 §2). `userId` comes from the verified token; everything
 * else is loaded from `identity.load_context()` inside the same transaction, so a revoked role or
 * a new centre counts on the very next request.
 */
export interface RlsContext {
  userId: string;
  roles: string[];
  centreIds: string[];
  /** Centres this user owns (a subset of `centreIds`). */
  ownerCentreIds: string[];
  teacherId: string | null;
  guardianId: string | null;
  /** Staff permissions per centre. Owners hold every permission of their centre. */
  permissions: Record<string, string[]>;
}

export const isOwnerOf = (c: RlsContext, centreId: string) => c.ownerCentreIds.includes(centreId);
export const isStaffOf = (c: RlsContext, centreId: string) => c.centreIds.includes(centreId);
/** Owners hold every permission of their centre; staff hold what the owner gave them. */
export const can = (c: RlsContext, centreId: string, permission: string) =>
  isOwnerOf(c, centreId) || (c.permissions[centreId]?.includes(permission) ?? false);

/**
 * Two connection pools, two roles (ADR-0006): `app_user` for requests (RLS enforced, no
 * BYPASSRLS) and `app_worker` for the SYSTEM paths — sign-in, sign-up, jobs and the outbox relay.
 */
export class Database {
  readonly user: Kysely<DB>;
  readonly system: Kysely<DB>;
  /** `app_ops` for the ops console (MKT-OPS-08); null when DATABASE_URL_OPS is not set. */
  readonly ops: Kysely<DB> | null;

  constructor(userUrl: string, systemUrl: string, opsUrl?: string) {
    const pool = (url: string, max: number) =>
      new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max }) });
    this.user = new Kysely<DB>({ dialect: pool(userUrl, 20) });
    this.system = new Kysely<DB>({ dialect: pool(systemUrl, 10) });
    this.ops = opsUrl ? new Kysely<DB>({ dialect: pool(opsUrl, 4) }) : null;
  }

  /** Run `fn` in one transaction as the signed-in user, with the RLS context set (SET LOCAL). */
  asUser<T>(userId: string, fn: (tx: Tx, ctx: RlsContext) => Promise<T>): Promise<T> {
    return this.user.transaction().execute(async (tx) => {
      await sql`SELECT set_config('app.user_id', ${userId}, true)`.execute(tx);
      const ctx = await loadContext(tx, userId);
      await setContext(tx, ctx);
      return fn(tx, ctx);
    });
  }

  /**
   * Run `fn` as an ops user (role `app_ops`, MKT-OPS-08): the RLS context of a `link_ops` user,
   * whose policies (platform.ctx_is_ops()) open the rows ops work on. The caller checks the
   * permission first; a user without an active `link_ops` role gets 403 here too.
   */
  asOps<T>(userId: string, fn: (tx: Tx, ctx: RlsContext) => Promise<T>): Promise<T> {
    const ops = this.ops;
    if (!ops)
      throw new Problem(503, 'ops_off', 'The ops console is not set up (DATABASE_URL_OPS).');
    return ops.transaction().execute(async (tx) => {
      await sql`SELECT set_config('app.user_id', ${userId}, true)`.execute(tx);
      const ctx = await loadContext(tx, userId);
      if (!ctx.roles.includes('link_ops')) throw forbidden('This needs a Link ops account.');
      await setContext(tx, ctx);
      return fn(tx, ctx);
    });
  }

  /** A public read (no user): RLS sees an empty context, so only public rows pass. */
  asAnonymous<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.user.transaction().execute(fn);
  }

  /** SYSTEM work as `app_worker` (sign-in, sign-up, jobs). */
  asSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.system.transaction().execute(fn);
  }

  async ping() {
    await sql`SELECT 1`.execute(this.user);
    await sql`SELECT 1`.execute(this.system);
  }

  async close() {
    await Promise.all([this.user.destroy(), this.system.destroy(), this.ops?.destroy()]);
  }
}

/** The caller's roles, centres and permissions (`identity.load_context()`), in this transaction. */
async function loadContext(tx: Tx, userId: string): Promise<RlsContext> {
  const { rows } = await sql<{
    roles: string[];
    centre_ids: string[];
    owner_centre_ids: string[];
    teacher_id: string | null;
    guardian_id: string | null;
    permissions: Record<string, string[]>;
  }>`SELECT * FROM identity.load_context()`.execute(tx);
  const row = rows[0];
  // No row: the account was deleted or suspended since the token was issued.
  if (!row) throw unauthenticated();
  return {
    userId,
    roles: row.roles,
    centreIds: row.centre_ids,
    ownerCentreIds: row.owner_centre_ids,
    teacherId: row.teacher_id,
    guardianId: row.guardian_id,
    permissions: row.permissions,
  };
}

/** SET LOCAL the context the policies read (platform.ctx_* in migration 0001). */
export async function setContext(tx: Tx, c: RlsContext) {
  const arr = (xs: string[]) => `{${xs.join(',')}}`;
  await sql`SELECT
    set_config('app.roles', ${arr(c.roles)}, true),
    set_config('app.centre_ids', ${arr(c.centreIds)}, true),
    set_config('app.teacher_id', ${c.teacherId ?? ''}, true),
    set_config('app.guardian_id', ${c.guardianId ?? ''}, true)`.execute(tx);
}
