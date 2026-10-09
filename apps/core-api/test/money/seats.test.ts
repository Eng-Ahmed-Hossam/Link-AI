// pnpm test:money — seat tests (docs/08 §9, plan §6): counting per session, holds that cover a
// full session, waitlist offers as holds, the database guard, the Redis rebuild, and concurrency.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Api, startApi } from '../helpers';
import {
  NOUR_GROUP,
  checkout,
  code,
  completeOnProvider,
  groupOf,
  hold,
  newParent,
} from '../money-helpers';

let api: Api;
let n = 0;
const parent = () => newParent(api, `+2010${60_000_000 + ++n}`);
const parents = async (k: number) => {
  const out = [];
  for (let i = 0; i < k; i++) out.push(await parent());
  return out;
};
const sessions = async () => (await groupOf((await parent()).c, NOUR_GROUP)).upcomingSessions;
/** Earlier cases' unpaid holds run out (the hold-expiry job), so each case starts clean. */
async function clearHolds() {
  await sql`UPDATE market.enrolments SET hold_expires_at = now() - interval '1 second'
    WHERE group_id = ${NOUR_GROUP} AND status = 'pending_payment'`.execute(api.db);
  await api.s.jobs.expireHolds();
  await sql`UPDATE market.waitlist_entries SET status = 'left' WHERE group_id = ${NOUR_GROUP} AND status = 'waiting'`.execute(
    api.db,
  );
  await sql`UPDATE market.waitlist_entries SET offer_expires_at = now() - interval '1 second' WHERE group_id = ${NOUR_GROUP} AND status = 'offered'`.execute(
    api.db,
  );
  await api.s.jobs.expireOffers();
  await sql`UPDATE market.groups SET seat_cap = 30 WHERE id = ${NOUR_GROUP}`.execute(api.db);
  await api.s.jobs.rebuildSeats();
}
/** Seat cap so the next session has exactly `left` seats free (holds included). */
async function leaveSeats(free: number) {
  await clearHolds();
  const { c } = await parent();
  const g = await groupOf(c, NOUR_GROUP);
  await sql`UPDATE market.groups SET seat_cap = ${g.seatCap - g.upcomingSessions[0]!.seatsLeft + free} WHERE id = ${NOUR_GROUP}`.execute(
    api.db,
  );
}
const committed = async (sessionId: string) =>
  (
    await sql<{
      c: number;
    }>`SELECT committed AS c FROM market.seats_committed(ARRAY[${sessionId}]::uuid[])`.execute(
      api.db,
    )
  ).rows[0]!.c;

beforeAll(async () => {
  api = await startApi();
  await sql`UPDATE market.groups SET seat_cap = 30 WHERE id = ${NOUR_GROUP}`.execute(api.db);
}, 120_000);
afterAll(() => api.close());

describe('Seats per session (BR-ENR-02, BR-ENR-13, INV-05)', () => {
  it('a per-session buyer and a monthly buyer in the same session both count there', async () => {
    const before = await sessions();
    const a = await parent();
    const b = await parent();
    expect(
      (
        await hold(a.c, {
          studentId: a.childId,
          firstSessionId: before[0]!.id,
          plan: 'per_session',
        })
      ).status,
    ).toBe(201);
    expect((await hold(b.c, { studentId: b.childId, firstSessionId: before[0]!.id })).status).toBe(
      201,
    );
    const after = await sessions();
    expect(after[0]!.seatsLeft).toBe(before[0]!.seatsLeft - 2); // both
    expect(after[1]!.seatsLeft).toBe(before[1]!.seatsLeft - 1); // the monthly plan only
  });

  it('a hold covering one full session fails as a whole: no seat is taken anywhere', async () => {
    const s = await sessions();
    // The third session fills up with per-session holds…
    for (let i = 0; i < s[2]!.seatsLeft; i++) {
      const p = await parent();
      expect(
        (await hold(p.c, { studentId: p.childId, firstSessionId: s[2]!.id, plan: 'per_session' }))
          .status,
      ).toBe(201);
    }
    const before = await sessions();
    expect(before[2]!.seatsLeft).toBe(0);
    // …so a month from the first session cannot be held, and names the full session.
    const m = await parent();
    const r = await hold(m.c, { studentId: m.childId, firstSessionId: before[0]!.id });
    expect(r.status).toBe(409);
    expect(code(r)).toBe('seat_unavailable');
    expect((r.body as unknown as { errors: { sessionId: string }[] }).errors[0]!.sessionId).toBe(
      before[2]!.id,
    );
    expect((await sessions()).map((x) => x.seatsLeft)).toEqual(before.map((x) => x.seatsLeft));
  });

  it('INV-05: the database refuses a confirm over the seat cap even when Redis was wrong', async () => {
    const s = await sessions();
    const { rows } = await sql<{ id: string }>`
      SELECT id FROM market.enrolments WHERE group_id = ${NOUR_GROUP} AND status = 'pending_payment' LIMIT 1`.execute(
      api.db,
    );
    const used = await committed(s[0]!.id);
    await sql`UPDATE market.groups SET seat_cap = ${used} WHERE id = ${NOUR_GROUP}`
      .execute(api.db)
      .catch(() => {});
    await expect(
      sql`UPDATE market.enrolments SET status = 'confirmed' WHERE id = ${rows[0]!.id}`.execute(
        api.db,
      ),
    ).rejects.toThrow(/seat_cap|would have/);
    await sql`UPDATE market.groups SET seat_cap = 30 WHERE id = ${NOUR_GROUP}`.execute(api.db);
  });

  it('Redis counters lost (flushed): the next hold rebuilds them from the database', async () => {
    const before = await sessions();
    const keys = await api.redis.keys(`${api.config.APP_ENV}:c:*:seats:*`);
    if (keys.length) await api.redis.del(...keys);
    const p = await parent();
    expect(
      (
        await hold(p.c, {
          studentId: p.childId,
          firstSessionId: before[0]!.id,
          plan: 'per_session',
        })
      ).status,
    ).toBe(201);
    expect((await sessions())[0]!.seatsLeft).toBe(before[0]!.seatsLeft - 1);
    const drift = await api.s.jobs.rebuildSeats();
    expect(drift.drifted).toBe(0);
  });

  it('BR-ENR-10: an offered waitlist entry holds its seat for 24 hours', async () => {
    await leaveSeats(1);
    const holder = await parent();
    const s = await sessions();
    const h = await hold(holder.c, {
      studentId: holder.childId,
      firstSessionId: s[0]!.id,
      plan: 'per_session',
    });
    expect(h.status).toBe(201);
    const waiting = await parent();
    await waiting.c.call('POST', `/v1/groups/${NOUR_GROUP}/waitlist`, {
      studentId: waiting.childId,
    });
    await holder.c.call('POST', `/v1/enrolments/${h.body.id}/cancel`, {});
    // The freed seat went to the waitlist as an offer: nobody else can take it.
    const late = await parent();
    const r = await hold(late.c, {
      studentId: late.childId,
      firstSessionId: s[0]!.id,
      plan: 'per_session',
    });
    expect(code(r)).toBe('seat_unavailable');
    await sql`UPDATE market.groups SET seat_cap = 30 WHERE id = ${NOUR_GROUP}`.execute(api.db);
  });
});

describe('Concurrency (plan §6, R2b report)', () => {
  it('20 parents try for the last 3 seats at the same moment: exactly 3 win, nothing is double-sold', async () => {
    const families = await parents(20);
    await leaveSeats(3);
    const s = await sessions();
    const next = s[0]!;
    const capBefore = (await groupOf(families[0]!.c, NOUR_GROUP)).seatCap;
    const t0 = Date.now();
    const results = await Promise.all(
      families.map((f) => hold(f.c, { studentId: f.childId, firstSessionId: next.id })),
    );
    const ms = Date.now() - t0;
    const won = results.filter((r) => r.status === 201);
    const full = results.filter((r) => r.status === 409 && code(r) === 'seat_unavailable');
    expect(won).toHaveLength(3);
    expect(full).toHaveLength(17);
    expect((await sessions())[0]!.seatsLeft).toBe(0);
    // The 17 others join the waitlist.
    const waiting = await Promise.all(
      families
        .filter((_, i) => results[i]!.status === 409)
        .map((f) =>
          f.c.call<{ status: string; position: number }>(
            'POST',
            `/v1/groups/${NOUR_GROUP}/waitlist`,
            { studentId: f.childId },
          ),
        ),
    );
    expect(waiting.every((w) => w.status === 201 && w.body.status === 'waiting')).toBe(true);
    // The 3 winners pay; their seats become committed. No session goes over the cap.
    for (const [i, r] of results.entries()) {
      if (r.status !== 201) continue;
      const co = await checkout(families[i]!.c, r.body.id, 'card');
      await completeOnProvider(co.body.checkoutUrl!, 'succeeded');
    }
    const used = await committed(next.id);
    expect(used).toBe(capBefore);
    const { rows } = await sql<{ over: number }>`
      SELECT count(*)::int AS over FROM market.group_sessions s, market.seats_committed(ARRAY[s.id]) c
      WHERE s.group_id = ${NOUR_GROUP} AND c.committed > ${capBefore}`.execute(api.db);
    expect(rows[0]!.over).toBe(0);
    writeFileSync(
      join(tmpdir(), 'link-r2b-concurrency.json'),
      JSON.stringify({
        parents: 20,
        seatsLeft: 3,
        won: won.length,
        full: full.length,
        waitlisted: waiting.length,
        holdMs: ms,
        committedAfterPayment: used,
        seatCap: capBefore,
        sessionsOverCap: rows[0]!.over,
      }),
    );
    await sql`UPDATE market.groups SET seat_cap = 30 WHERE id = ${NOUR_GROUP}`
      .execute(api.db)
      .catch(() => {});
  });

  it('50 parallel holds for the last seat: exactly one wins', async () => {
    const families = await parents(50);
    await sql`UPDATE market.groups SET seat_cap = 30 WHERE id = ${NOUR_GROUP}`.execute(api.db);
    await leaveSeats(1);
    const next = (await sessions())[0]!;
    const results = await Promise.all(
      families.map((f) =>
        hold(f.c, { studentId: f.childId, firstSessionId: next.id, plan: 'per_session' }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => code(r) === 'seat_unavailable')).toHaveLength(49);
  });
});
