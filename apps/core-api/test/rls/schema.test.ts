// pnpm test:rls (database level) — docs/10 §2 cross-tenant suite. Runs as app_user, the role the
// API uses, with the real RLS context of real seeded users.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { Database } from '../../src/platform/db';
import { uuidv7 } from '../../src/platform/ids';
import { demoId } from '../../seeds/demo';
import { type Api, startApi } from '../helpers';
import { followupRowsOfB } from './rows-b';

/** App schemas: every table in them needs RLS, unless listed here with the reason. */
const SCHEMAS = [
  'identity',
  'ref',
  'org',
  'market',
  'ledger',
  'records',
  'followup',
  'messaging',
  'analytics',
  'audit',
  'platform',
];
const NO_RLS: Record<string, string> = {
  'ref.curricula': 'public reference data',
  'ref.school_years': 'public reference data',
  'ref.academic_terms': 'public reference data',
  'ref.subjects': 'public reference data',
  'platform.outbox_events': 'app_user may only INSERT (no SELECT grant)',
  'platform.inbox_events': 'app_worker only (no app_user grant)',
  'public.schema_migrations': 'dbmate bookkeeping',
  'public.spatial_ref_sys': 'PostGIS reference data',
};

let api: Api;
let db: Database;
const A = { owner: demoId('usr-owner'), centre: demoId('cen-nour') };
const B = { owner: demoId('usr-owner-b'), centre: demoId('cen-nile') };
const parent = demoId('usr-parent');

beforeAll(async () => {
  api = await startApi();
  db = new Database(process.env.DATABASE_URL!, process.env.DATABASE_URL_WORKER!);
  // Rows of centre B in tables the seed leaves empty for B, so no check passes vacuously.
  await api.db
    .insertInto('audit.audit_events')
    .values({
      id: uuidv7(),
      actor_id: B.owner,
      actor_type: 'user',
      centre_id: B.centre,
      action: 'test.b_only',
      object_type: 'centre',
      object_ref: B.centre,
    })
    .execute();
  await followupRowsOfB(api);
});
afterAll(async () => {
  await db.close();
  await api.close();
});

const tables = async () =>
  (
    await sql<{ name: string; rls: boolean; readable: boolean; centre: boolean }>`
      SELECT n.nspname || '.' || c.relname AS name, c.relrowsecurity AS rls,
             has_table_privilege('app_user', c.oid, 'SELECT') AS readable,
             EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'centre_id' AND NOT a.attisdropped) AS centre
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
        AND n.nspname = ANY (${[...SCHEMAS, 'public']})`.execute(api.db)
  ).rows;

describe('10 §2 RLS is on everywhere it must be', () => {
  it('every table in an app schema has RLS enabled, or a documented reason not to', async () => {
    const missing = (await tables())
      .filter((t) => !t.rls && !(t.name in NO_RLS))
      .map((t) => t.name);
    expect(missing).toEqual([]);
  });

  it('no application role can bypass RLS', async () => {
    const { rows } = await sql<{ rolname: string; rolbypassrls: boolean }>`
      SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('app_user', 'app_worker', 'app_ops')`.execute(
      api.db,
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => !r.rolbypassrls)).toBe(true);
  });

  it('app_user owns nothing (an owner would skip RLS)', async () => {
    const { rows } = await sql<{ n: number }>`
      SELECT count(*)::int AS n FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
      WHERE r.rolname IN ('app_user', 'app_worker', 'app_ops')`.execute(api.db);
    expect(rows[0]!.n).toBe(0);
  });
});

/** Rows that are public by rule (BR-REV-03: published public reviews and their replies). */
const PUBLIC_ROWS: Record<string, string> = {
  'market.reviews': "NOT (visibility = 'public' AND status = 'published')",
  'market.review_replies': "status <> 'published'",
};
const notPublic = (table: string) => sql.raw(PUBLIC_ROWS[table] ?? 'true');

describe('10 §2 centre A never sees centre B', () => {
  it('for every table with centre_id: the owner of A reads zero rows of B (and B zero of A)', async () => {
    // Tables app_user cannot read at all (the ledger itself) are closed to every request.
    const tenant = (await tables()).filter((t) => t.centre && t.rls && t.readable);
    expect(tenant.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'market.rooms',
        'identity.role_assignments',
        'audit.audit_events',
        'market.enrolments',
        'ledger.payments',
        'market.reviews',
        // R3 follow-up tables: centre A never reads B's records, flags, cases or messages.
        'records.session_records',
        'records.record_entries',
        'records.notes',
        'records.voice_notes',
        'followup.signals',
        'followup.cases',
        'followup.case_events',
        'messaging.messages',
      ]),
    );
    expect((await tables()).filter((t) => !t.readable && t.centre).map((t) => t.name)).toEqual(
      expect.arrayContaining(['ledger.ledger_transactions']),
    );
    for (const [me, other] of [
      [A, B],
      [B, A],
    ] as const) {
      for (const t of tenant) {
        const seenByOwner = await db.asUser(me.owner, async (tx) => {
          const { rows } = await sql<{
            n: number;
          }>`SELECT count(*)::int AS n FROM ${sql.table(t.name)}
                                                    WHERE centre_id = ${other.centre} AND ${notPublic(t.name)}`.execute(
            tx,
          );
          return rows[0]!.n;
        });
        expect({ table: t.name, rows: seenByOwner }).toEqual({ table: t.name, rows: 0 });
      }
    }
  });

  it('the seed really has rows of B (the check above is not vacuous)', async () => {
    const n = await api.db
      .selectFrom('market.rooms')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('centre_id', '=', B.centre)
      .executeTakeFirstOrThrow();
    expect(n.n).toBeGreaterThan(0);
  });

  it('the owner of A does see A’s own rows', async () => {
    const n = await db.asUser(A.owner, (tx) =>
      tx
        .selectFrom('market.rooms')
        .select(sql<number>`count(*)::int`.as('n'))
        .executeTakeFirstOrThrow(),
    );
    expect(n.n).toBe(4); // the four halls of Al Nour
  });

  it('centres: A reads its own centre row only', async () => {
    const ids = await db.asUser(A.owner, (tx) =>
      tx.selectFrom('org.centres').select('id').execute(),
    );
    expect(ids.map((r) => r.id)).toEqual([A.centre]);
  });

  it('a request with no context (anonymous) reads no centre’s rows', async () => {
    for (const t of (await tables()).filter((x) => x.centre && x.rls && x.readable)) {
      const n = await db.asAnonymous(async (tx) => {
        // Rows with no centre (e.g. the global commission rules) are not tenant rows.
        const { rows } = await sql<{
          n: number;
        }>`SELECT count(*)::int AS n FROM ${sql.table(t.name)}
                                                  WHERE centre_id IS NOT NULL AND ${notPublic(t.name)}`.execute(
          tx,
        );
        return rows[0]!.n;
      });
      expect({ table: t.name, rows: n }).toEqual({ table: t.name, rows: 0 });
    }
  });
});

describe('10 §2 people: only their own rows', () => {
  it('users: each person reads only their own user row', async () => {
    const rows = await db.asUser(A.owner, (tx) =>
      tx.selectFrom('identity.users').select('id').execute(),
    );
    expect(rows.map((r) => r.id)).toEqual([A.owner]);
  });

  it('children: the parent sees Mariam and Youssef; an owner sees no child', async () => {
    const mine = await db.asUser(parent, (tx) =>
      tx.selectFrom('org.students').select('id').execute(),
    );
    expect(mine).toHaveLength(2);
    const owners = await db.asUser(A.owner, (tx) =>
      tx.selectFrom('org.students').select('id').execute(),
    );
    expect(owners).toEqual([]);
  });

  it('a parent cannot write a child under another guardian', async () => {
    const otherGuardian = uuidv7();
    await api.db.insertInto('org.guardians').values({ id: otherGuardian, user_id: null }).execute();
    await expect(
      db.asUser(parent, (tx) =>
        tx
          .insertInto('org.students')
          .values({
            id: uuidv7(),
            display_name: 'X',
            curriculum_id: demoId('cur-national'),
            school_year_id: demoId('sy-sec2'),
            created_by_guardian_id: otherGuardian,
          })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('consents: append-only (UPDATE and DELETE are refused even for the owner of the table)', async () => {
    await expect(
      sql`UPDATE org.consent_events SET granted = false`.execute(api.db),
    ).rejects.toThrow(/append-only/);
    await expect(sql`DELETE FROM audit.audit_events`.execute(api.db)).rejects.toThrow(
      /append-only/,
    );
  });

  it('phones are never stored in clear', async () => {
    const { rows } = await sql<{ column_name: string; table: string }>`
      SELECT table_schema || '.' || table_name AS table, column_name FROM information_schema.columns
      WHERE table_schema = ANY (${SCHEMAS}) AND column_name ~ '(phone|whatsapp)'
        AND data_type NOT IN ('bytea', 'boolean')
        AND column_name !~ '_last4$'`.execute(api.db);
    expect(rows).toEqual([]);
  });
});
