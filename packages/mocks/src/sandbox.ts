/**
 * Per-visitor sandboxes for the hosted demo API (the public trial, ADR-0010). Each visitor's
 * browser makes an unguessable sandbox id (128 bits) and sends every request under
 * `/sb/<id>/…`; the server swaps that visitor's whole mock world in (marketplace, follow-up, demo
 * flags, payout accounts), handles the request, and swaps it out. Requests run one at a time, so
 * worlds never mix. A new id starts from a fresh copy of the sample seed; the seed itself is never
 * written. Idle sandboxes expire, the oldest is dropped past the cap, and each address may only
 * open so many sandboxes and send so many requests.
 */
import * as db from './db';
import * as fu from './followup/db';
import { payoutAccountsRestore, payoutAccountsSnapshot } from './market/handlers';

export const SANDBOX_ID = /^[A-Za-z0-9_-]{22,64}$/;
export const SANDBOX_PREFIX = /^\/sb\/([A-Za-z0-9_-]{22,64})(\/.*)?$/;

export interface SandboxLimits {
  /** Live sandboxes at most; past it the least recently used is dropped. */
  max: number;
  /** A sandbox nobody used for this long is dropped. */
  idleMs: number;
  /** And none lives longer than this. */
  maxAgeMs: number;
  /** New sandboxes one address may open per hour. */
  newPerIpHour: number;
  /** Requests one address may send per minute. */
  requestsPerIpMinute: number;
}

export const DEFAULT_LIMITS: SandboxLimits = {
  max: 300,
  idleMs: 2 * 3600_000,
  maxAgeMs: 8 * 3600_000,
  newPerIpHour: 20,
  requestsPerIpMinute: 600,
};

interface Box {
  db: ReturnType<typeof db.exportState>;
  fu: ReturnType<typeof fu.exportState>;
  pay: ReturnType<typeof payoutAccountsSnapshot>;
  createdAt: number;
  usedAt: number;
}

let current: string | null = null;
/** The sandbox the request being handled belongs to (null outside sandbox mode). */
export const currentSandbox = () => current;

export class Sandboxes {
  private boxes = new Map<string, Box>();
  private queue: Promise<unknown> = Promise.resolve();
  private hits = new Map<string, { n: number; until: number }>();

  constructor(
    readonly limits: SandboxLimits = DEFAULT_LIMITS,
    private readonly now: () => number = Date.now,
  ) {}

  get size() {
    return this.boxes.size;
  }
  has(id: string) {
    return this.boxes.has(id);
  }

  /** Fixed-window counter per key; true while under `limit`. */
  private allow(key: string, limit: number, windowMs: number) {
    const t = this.now();
    const h = this.hits.get(key);
    if (!h || h.until <= t) {
      this.hits.set(key, { n: 1, until: t + windowMs });
      return true;
    }
    h.n++;
    return h.n <= limit;
  }

  /** 'ok' | 'rate_limited' (too many requests) | 'too_many_sandboxes' (too many new ones). */
  admit(id: string, ip: string): 'ok' | 'rate_limited' | 'too_many_sandboxes' {
    if (!this.allow(`r:${ip}`, this.limits.requestsPerIpMinute, 60_000)) return 'rate_limited';
    if (!this.boxes.has(id) && !this.allow(`n:${ip}`, this.limits.newPerIpHour, 3600_000))
      return 'too_many_sandboxes';
    return 'ok';
  }

  /** Drops expired sandboxes, then the least recently used past the cap. */
  sweep() {
    const t = this.now();
    for (const [id, b] of this.boxes)
      if (t - b.usedAt > this.limits.idleMs || t - b.createdAt > this.limits.maxAgeMs)
        this.boxes.delete(id);
    while (this.boxes.size > this.limits.max) {
      let oldest: string | null = null;
      let at = Infinity;
      for (const [id, b] of this.boxes) if (b.usedAt < at) [oldest, at] = [id, b.usedAt];
      this.boxes.delete(oldest!);
    }
    for (const [k, h] of this.hits) if (h.until <= t) this.hits.delete(k);
  }

  /** Runs `fn` inside sandbox `id` (a fresh copy of the seed for a new id), one at a time. */
  run<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const go = async () => {
      const t = this.now();
      const box = this.boxes.get(id);
      db.importState(box?.db ?? null);
      fu.importState(box?.fu ?? null);
      payoutAccountsRestore(box?.pay ?? []);
      current = id;
      try {
        return await fn();
      } finally {
        current = null;
        this.boxes.set(id, {
          db: db.exportState(),
          fu: fu.exportState(),
          pay: payoutAccountsSnapshot(),
          createdAt: box?.createdAt ?? t,
          usedAt: t,
        });
        if (this.boxes.size > this.limits.max) this.sweep();
      }
    };
    const p = this.queue.then(go, go);
    this.queue = p.catch(() => undefined);
    return p;
  }
}
