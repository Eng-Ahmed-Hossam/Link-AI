import { Redis } from 'ioredis';

/**
 * Two Redis instances (docs/05 §6, docs/14 §2):
 * - `state` (noeviction, AOF): OTP codes, rate limits, idempotency, seat holds (R2), job locks.
 * - `cache` (allkeys-lru): read caches only — never balances, payment status or consent.
 * Every key is prefixed with the environment; tenant keys add `c:{centreId}:` (CLAUDE.md).
 */
export class Redises {
  readonly state: Redis;
  readonly cache: Redis;
  constructor(
    stateUrl: string,
    cacheUrl: string,
    readonly prefix: string,
  ) {
    const opts = { maxRetriesPerRequest: 2, lazyConnect: false, enableOfflineQueue: true };
    this.state = new Redis(stateUrl, opts);
    this.cache = new Redis(cacheUrl, opts);
  }

  /** `{env}:<parts…>` */
  key(...parts: string[]) {
    return [this.prefix, ...parts].join(':');
  }

  /** `{env}:c:{centreId}:<parts…>` — tenant-scoped keys. */
  centreKey(centreId: string, ...parts: string[]) {
    return [this.prefix, 'c', centreId, ...parts].join(':');
  }

  async ping() {
    await Promise.all([this.state.ping(), this.cache.ping()]);
  }

  async close() {
    await Promise.allSettled([this.state.quit(), this.cache.quit()]);
  }
}

/**
 * Fixed-window counter: returns how many hits this window has seen (this one included) and the
 * seconds until it resets. Used for the 07 §1 rate limits.
 */
export async function hit(r: Redis, key: string, windowSeconds: number) {
  const [[, count], [, ttl]] = (await r.multi().incr(key).ttl(key).exec()) as [
    [null, number],
    [null, number],
  ];
  if (ttl < 0) await r.expire(key, windowSeconds);
  return { count, retryAfter: ttl < 0 ? windowSeconds : ttl };
}
