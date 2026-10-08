import { SignJWT, errors, jwtVerify } from 'jose';
import type { Config } from '../config';
import { randomToken, sha256 } from '../platform/crypto';
import type { Database, RlsContext } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import { Problem, unauthenticated } from '../platform/problem';

/**
 * Tokens (MKT-ACC-04, 07 §1, 10 §7). Access: a JWT for 15 minutes. Refresh: an opaque random token
 * for 30 days, stored only as a SHA-256 hash in identity.auth_sessions and rotated on every use.
 * Presenting a token that was already rotated revokes the whole chain (a stolen copy dies with it),
 * except within a few seconds of the rotation, which is two tabs refreshing at once.
 */
export const RACE_GRACE_MS = 15_000;

export interface AccessClaims {
  sub: string;
  lang: 'ar' | 'en';
}

export type Client = 'web' | 'app';

export class Tokens {
  private readonly key: Uint8Array;

  constructor(
    private readonly c: Config,
    private readonly db: Database,
  ) {
    this.key = new Uint8Array(Buffer.from(c.JWT_SIGNING_KEY, 'base64'));
  }

  async access(userId: string, ctx: Omit<RlsContext, 'userId'> | null, lang: 'ar' | 'en') {
    return new SignJWT({
      roles: ctx?.roles ?? [],
      centreIds: ctx?.centreIds ?? [],
      teacherId: ctx?.teacherId ?? null,
      guardianId: ctx?.guardianId ?? null,
      lang,
    })
      .setProtectedHeader({ alg: 'HS256', kid: this.c.JWT_SIGNING_KEY_ID })
      .setSubject(userId)
      .setIssuer(this.c.JWT_ISSUER)
      .setAudience(this.c.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.c.ACCESS_TOKEN_TTL}s`)
      .sign(this.key);
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: this.c.JWT_ISSUER,
        audience: this.c.JWT_AUDIENCE,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string') throw unauthenticated();
      return { sub: payload.sub, lang: payload.lang === 'en' ? 'en' : 'ar' };
    } catch (e) {
      if (e instanceof errors.JWTExpired)
        throw unauthenticated('token_expired', 'Your session timed out. Refreshing…');
      throw unauthenticated();
    }
  }

  /** A new sign-in: a new chain (family) with its first refresh token. */
  async startSession(userId: string, client: Client) {
    const token = randomToken();
    await this.db.system
      .insertInto('identity.auth_sessions')
      .values({
        id: uuidv7(),
        user_id: userId,
        family_id: uuidv7(),
        refresh_token_hash: sha256(token),
        client,
        last_used_at: new Date(),
        expires_at: new Date(Date.now() + this.c.REFRESH_TOKEN_TTL * 1000),
      })
      .execute();
    return token;
  }

  /** Rotate: returns the user and a fresh refresh token, or throws `refresh_invalid`. */
  async rotate(token: string, client: Client) {
    const invalid = () => unauthenticated('refresh_invalid', 'Sign in again to continue.');
    // The outcome is decided inside the transaction and thrown after it commits, so revoking a
    // chain on reuse is kept (a throw inside would roll the revocation back).
    const outcome = await this.db.asSystem(async (tx) => {
      const row = await tx
        .selectFrom('identity.auth_sessions')
        .selectAll()
        .where('refresh_token_hash', '=', sha256(token))
        .forUpdate()
        .executeTakeFirst();
      if (!row) return { kind: 'invalid' as const };
      if (row.replaced_by || row.revoked_at) {
        const rotatedAt = row.revoked_at ? new Date(row.revoked_at).getTime() : 0;
        if (row.replaced_by && Date.now() - rotatedAt < RACE_GRACE_MS)
          return { kind: 'raced' as const };
        // Reuse of a rotated or revoked token: revoke the whole chain (10 §7).
        await tx
          .updateTable('identity.auth_sessions')
          .set({ revoked_at: new Date() })
          .where('family_id', '=', row.family_id)
          .where('revoked_at', 'is', null)
          .execute();
        return { kind: 'invalid' as const };
      }
      if (new Date(row.expires_at).getTime() < Date.now()) return { kind: 'invalid' as const };
      const next = randomToken();
      const id = uuidv7();
      await tx
        .insertInto('identity.auth_sessions')
        .values({
          id,
          user_id: row.user_id,
          family_id: row.family_id,
          refresh_token_hash: sha256(next),
          client,
          last_used_at: new Date(),
          // The chain keeps its 30 days from each use (MKT-ACC-04: 30 days, rotated on use).
          expires_at: new Date(Date.now() + this.c.REFRESH_TOKEN_TTL * 1000),
        })
        .execute();
      await tx
        .updateTable('identity.auth_sessions')
        .set({ replaced_by: id, revoked_at: new Date(), last_used_at: new Date() })
        .where('id', '=', row.id)
        .execute();
      return { kind: 'ok' as const, userId: row.user_id, refreshToken: next };
    });
    if (outcome.kind === 'raced')
      throw new Problem(409, 'refresh_raced', 'Already refreshed; retry the request.');
    if (outcome.kind === 'invalid') throw invalid();
    return { userId: outcome.userId, refreshToken: outcome.refreshToken };
  }

  /** Logout: the chain this token belongs to ends. Unknown tokens are ignored (204 either way). */
  async revoke(token: string) {
    const row = await this.db.system
      .selectFrom('identity.auth_sessions')
      .select('family_id')
      .where('refresh_token_hash', '=', sha256(token))
      .executeTakeFirst();
    if (!row) return;
    await this.db.system
      .updateTable('identity.auth_sessions')
      .set({ revoked_at: new Date() })
      .where('family_id', '=', row.family_id)
      .where('revoked_at', 'is', null)
      .execute();
  }
}
