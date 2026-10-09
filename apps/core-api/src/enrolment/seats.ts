import { sql } from 'kysely';
import type { Database, Tx } from '../platform/db';
import type { Redises } from '../platform/redis';

/**
 * Seats per group_session (BR-ENR-02, docs/08 §4 "Seat check"). Redis (state) holds, per session:
 *   seats:{g:<groupId>}:<sessionId>  committed seats (live enrolments covering it); rebuilt from the
 *                                    database when missing
 *   holds:{g:<groupId>}:<sessionId>  sorted set: hold ID → expiry (checkout holds and waitlist offers)
 *   hold:{g:<groupId>}:<holdId>      the sessions one hold covers, with the hold's TTL
 * All keys of a group share the hash tag `{g:<groupId>}`, so one Lua script changes them
 * atomically: a hold is created only if EVERY covered session has a seat, never part of one.
 * Keys sit under the tenant prefix `{env}:c:{centreId}:` (CLAUDE.md).
 */

const KEEP_MS = 70 * 86_400_000; // longer than the 63-day session window

// KEYS: hold, then (seats, holds) per session. ARGV: holdId, ttlMs, nowMs, seatCap, keepMs, sessionIds…
const ACQUIRE = `
local holdId, ttl, now, cap, keep = ARGV[1], tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5])
local n = (#KEYS - 1) / 2
for i = 1, n do
  redis.call('ZREMRANGEBYSCORE', KEYS[2*i+1], '-inf', now)
  if redis.call('EXISTS', KEYS[2*i]) == 0 then return {'MISS', ARGV[5+i]} end
end
for i = 1, n do
  local used = tonumber(redis.call('GET', KEYS[2*i])) + redis.call('ZCARD', KEYS[2*i+1])
  if redis.call('ZSCORE', KEYS[2*i+1], holdId) then used = used - 1 end
  if used >= cap then return {'FULL', ARGV[5+i]} end
end
local ids = {}
for i = 1, n do
  redis.call('ZADD', KEYS[2*i+1], now + ttl, holdId)
  redis.call('PEXPIRE', KEYS[2*i+1], keep)
  ids[i] = ARGV[5+i]
end
redis.call('SET', KEYS[1], table.concat(ids, ','), 'PX', ttl)
return {'OK'}
`;

// KEYS: hold, then (seats, holds) per session. ARGV: holdId. Hold → committed seat (ZREM + INCR).
const COMMIT = `
local n = (#KEYS - 1) / 2
for i = 1, n do
  redis.call('ZREM', KEYS[2*i+1], ARGV[1])
  if redis.call('EXISTS', KEYS[2*i]) == 1 then redis.call('INCR', KEYS[2*i]) end
end
redis.call('DEL', KEYS[1])
return 'OK'
`;

// KEYS: hold, then holds per session. ARGV: holdId.
const RELEASE = `
for i = 2, #KEYS do redis.call('ZREM', KEYS[i], ARGV[1]) end
redis.call('DEL', KEYS[1])
return 'OK'
`;

// KEYS: hold, then holds per session. ARGV: holdId, newExpiryMs, ttlMs. Only a live hold extends.
const EXTEND = `
for i = 2, #KEYS do
  if not redis.call('ZSCORE', KEYS[i], ARGV[1]) then return 'GONE' end
end
for i = 2, #KEYS do redis.call('ZADD', KEYS[i], 'XX', tonumber(ARGV[2]), ARGV[1]) end
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[3]))
return 'OK'
`;

// KEYS: seats per session. A committed seat leaves (cancel, end, release of past_due).
const UNCOMMIT = `
for i = 1, #KEYS do
  if redis.call('EXISTS', KEYS[i]) == 1 and tonumber(redis.call('GET', KEYS[i])) > 0 then redis.call('DECR', KEYS[i]) end
end
return 'OK'
`;

export interface SessionRef {
  id: string;
  groupId: string;
  centreId: string;
  seatCap: number;
}

export type HoldResult = { ok: true } | { ok: false; fullSessionId: string };

export class Seats {
  constructor(
    private readonly redis: Redises,
    private readonly db: Database,
  ) {}

  private keys(centreId: string, groupId: string) {
    const k = (kind: string, id: string) =>
      this.redis.centreKey(centreId, `${kind}:{g:${groupId}}:${id}`);
    return {
      seats: (s: string) => k('seats', s),
      holds: (s: string) => k('holds', s),
      hold: (h: string) => k('hold', h),
    };
  }

  /**
   * Hold one seat in every covered session, atomically (BR-ENR-01/02). A counter missing from
   * Redis is rebuilt from the database and the script runs again.
   */
  async acquire(
    g: { groupId: string; centreId: string; seatCap: number },
    holdId: string,
    sessionIds: string[],
    ttlMs: number,
  ): Promise<HoldResult> {
    const k = this.keys(g.centreId, g.groupId);
    for (let attempt = 0; attempt < 3; attempt++) {
      const keys = [k.hold(holdId), ...sessionIds.flatMap((s) => [k.seats(s), k.holds(s)])];
      const r = (await this.redis.state.eval(
        ACQUIRE,
        keys.length,
        ...keys,
        holdId,
        ttlMs,
        Date.now(),
        g.seatCap,
        KEEP_MS,
        ...sessionIds,
      )) as [string, string?];
      if (r[0] === 'OK') return { ok: true };
      if (r[0] === 'FULL') return { ok: false, fullSessionId: r[1]! };
      await this.rebuild(g, sessionIds);
    }
    throw new Error('seat counters could not be rebuilt');
  }

  /** Payment succeeded while the hold was live: the hold becomes a committed seat. */
  async commit(g: { groupId: string; centreId: string }, holdId: string, sessionIds: string[]) {
    const k = this.keys(g.centreId, g.groupId);
    const keys = [k.hold(holdId), ...sessionIds.flatMap((s) => [k.seats(s), k.holds(s)])];
    await this.redis.state.eval(COMMIT, keys.length, ...keys, holdId);
  }

  /** Cancelled before paying, or the offer/hold ended: the hold goes, no seat was committed. */
  async release(g: { groupId: string; centreId: string }, holdId: string, sessionIds: string[]) {
    const k = this.keys(g.centreId, g.groupId);
    const keys = [k.hold(holdId), ...sessionIds.map((s) => k.holds(s))];
    await this.redis.state.eval(RELEASE, keys.length, ...keys, holdId);
  }

  /** Fawry: the hold runs 24 h instead of 10 minutes (OD-09). False when the hold already ran out. */
  async extend(
    g: { groupId: string; centreId: string },
    holdId: string,
    sessionIds: string[],
    expiresAt: Date,
  ): Promise<boolean> {
    const k = this.keys(g.centreId, g.groupId);
    const keys = [k.hold(holdId), ...sessionIds.map((s) => k.holds(s))];
    const ttl = Math.max(1, expiresAt.getTime() - Date.now());
    const r = await this.redis.state.eval(
      EXTEND,
      keys.length,
      ...keys,
      holdId,
      expiresAt.getTime(),
      ttl,
    );
    return r === 'OK';
  }

  /** A committed seat leaves its sessions (cancel, end, past_due released). */
  async uncommit(g: { groupId: string; centreId: string }, sessionIds: string[]) {
    if (!sessionIds.length) return;
    const k = this.keys(g.centreId, g.groupId);
    const keys = sessionIds.map((s) => k.seats(s));
    await this.redis.state.eval(UNCOMMIT, keys.length, ...keys);
  }

  /**
   * Rebuild counters from the database (the MISS path, and the nightly rebuild with `force`):
   * committed seats, plus the live holds the database knows — unpaid enrolments before their
   * hold ends, and offered waitlist entries.
   */
  async rebuild(
    g: { groupId: string; centreId: string },
    sessionIds: string[],
    force = false,
  ): Promise<Map<string, number>> {
    const k = this.keys(g.centreId, g.groupId);
    const { committed, holds } = await this.db.asSystem(async (tx) => ({
      committed: await committedSeats(tx, sessionIds),
      holds: await sql<{ hold_id: string; session_id: string; expires_at: Date }>`
        SELECT e.id AS hold_id, s.id AS session_id, e.hold_expires_at AS expires_at
        FROM market.enrolments e JOIN market.group_sessions s ON s.group_id = e.group_id
        WHERE e.group_id = ${g.groupId} AND e.status = 'pending_payment' AND e.hold_expires_at > now()
          AND s.id = ANY (${sessionIds}::uuid[]) AND market.covers(e, s.id, market.session_day(s.starts_at))
        UNION ALL
        SELECT w.id, s, w.offer_expires_at FROM market.waitlist_entries w, unnest(w.offered_sessions) s
        WHERE w.group_id = ${g.groupId} AND w.status = 'offered' AND w.offer_expires_at > now()
          AND s = ANY (${sessionIds}::uuid[])`
        .execute(tx)
        .then((r) => r.rows),
    }));
    const multi = this.redis.state.multi();
    const drift = new Map<string, number>();
    for (const s of sessionIds) {
      const n = committed.get(s) ?? 0;
      if (force) {
        const before = await this.redis.state.get(k.seats(s));
        if (before !== null && Number(before) !== n) drift.set(s, Number(before) - n);
        multi.set(k.seats(s), n, 'PX', KEEP_MS);
      } else multi.set(k.seats(s), n, 'PX', KEEP_MS, 'NX');
    }
    for (const h of holds)
      multi.zadd(k.holds(h.session_id), 'NX', new Date(h.expires_at).getTime(), h.hold_id);
    await multi.exec();
    return drift;
  }

  /**
   * Seats left per session for display (P04–P07, J05, C03): cap − committed − live holds. Committed
   * seats come from the database; live holds from Redis.
   */
  async left(tx: Tx, sessions: SessionRef[]): Promise<Map<string, number>> {
    if (!sessions.length) return new Map();
    const committed = await committedSeats(
      tx,
      sessions.map((s) => s.id),
    );
    const now = Date.now();
    const pipe = this.redis.state.pipeline();
    for (const s of sessions)
      pipe.zcount(this.keys(s.centreId, s.groupId).holds(s.id), `(${now}`, '+inf');
    const holds = ((await pipe.exec()) ?? []).map(([, n]) => Number(n ?? 0));
    return new Map(
      sessions.map((s, i) => [
        s.id,
        Math.max(0, s.seatCap - (committed.get(s.id) ?? 0) - holds[i]!),
      ]),
    );
  }

  /** Seats filled per group in its next session (J05, C03, J07). */
  async filledNext(tx: Tx, groupIds: string[]): Promise<Map<string, number>> {
    if (!groupIds.length) return new Map();
    const next = await sql<{ group_id: string; id: string }>`
      SELECT DISTINCT ON (group_id) group_id, id FROM market.group_sessions
      WHERE group_id = ANY (${groupIds}::uuid[]) AND starts_at > now() AND status = 'scheduled'
      ORDER BY group_id, starts_at`.execute(tx);
    const committed = await committedSeats(
      tx,
      next.rows.map((r) => r.id),
    );
    return new Map(next.rows.map((r) => [r.group_id, committed.get(r.id) ?? 0]));
  }
}

/** Committed seats per session, from the database (market.seats_committed). */
export async function committedSeats(tx: Tx, sessionIds: string[]): Promise<Map<string, number>> {
  if (!sessionIds.length) return new Map();
  const { rows } = await sql<{ session_id: string; committed: number }>`
    SELECT session_id, committed FROM market.seats_committed(${sessionIds}::uuid[])`.execute(tx);
  return new Map(rows.map((r) => [r.session_id, r.committed]));
}
