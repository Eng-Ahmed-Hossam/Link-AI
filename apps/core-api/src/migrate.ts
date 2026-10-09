/**
 * `node dist/migrate.mjs` — the production image's migration step (ship job S1). It applies the
 * plain-SQL migrations exactly as dbmate does locally (same `schema_migrations` table, the
 * `-- migrate:up` part of each file, one transaction per file), so a database migrated by either
 * one is the same. Then, when the app roles' passwords are set (one server: the deploy .env), it
 * gives app_user, app_worker and app_ops their LOGIN passwords — what the cloud's database admin
 * does elsewhere. Runs as app_migrator. Prints names, never values.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const url = process.env.DATABASE_URL_MIGRATOR;
if (!url) {
  console.error('✗ Set DATABASE_URL_MIGRATOR.');
  process.exit(1);
}
const dir =
  process.env.MIGRATIONS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** The `-- migrate:up` part of a dbmate file. */
export function upPart(sqlText: string) {
  const start = sqlText.indexOf('-- migrate:up');
  const end = sqlText.indexOf('-- migrate:down');
  if (start < 0) throw new Error('no "-- migrate:up" marker');
  return sqlText.slice(start + '-- migrate:up'.length, end < 0 ? undefined : end);
}

async function main() {
  // Wait for the database (the container may still be starting); a pg client connects once.
  let client: pg.Client;
  for (let i = 0; ; i++) {
    client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
      break;
    } catch (e) {
      await client.end().catch(() => {});
      if (i >= 30) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS public.schema_migrations (version varchar(128) PRIMARY KEY)',
    );
    const done = new Set(
      (
        await client.query<{ version: string }>('SELECT version FROM public.schema_migrations')
      ).rows.map((r) => r.version),
    );
    const files = readdirSync(dir)
      .filter((f) => /^\d+_.*\.sql$/.test(f))
      .sort();
    let applied = 0;
    for (const f of files) {
      const version = f.split('_')[0]!;
      if (done.has(version)) continue;
      const body = upPart(readFileSync(join(dir, f), 'utf8'));
      await client.query('BEGIN');
      try {
        await client.query(body);
        await client.query('INSERT INTO public.schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`${f}: ${(e as Error).message}`, { cause: e });
      }
      console.log(`✓ applied ${f}`);
      applied++;
    }
    console.log(`✓ migrations: ${applied} applied, ${files.length - applied} already there.`);

    const roles = [
      ['app_user', process.env.APP_USER_PASSWORD],
      ['app_worker', process.env.APP_WORKER_PASSWORD],
      ['app_ops', process.env.APP_OPS_PASSWORD],
    ] as const;
    for (const [role, pw] of roles) {
      if (!pw) continue;
      const lit = (await client.query<{ q: string }>('SELECT quote_literal($1) AS q', [pw]))
        .rows[0]!.q;
      await client.query(`ALTER ROLE ${role} LOGIN PASSWORD ${lit}`);
      console.log(`✓ ${role} can log in`);
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main().catch((e: unknown) => {
    console.error(`✗ ${(e as Error).message}`);
    process.exit(1);
  });
