// pnpm test:api | test:rls — core-api integration tests against real Postgres and Redis.
// They run on their own database (`link_test`) and Redis DB 1, never on your local data:
// the database is created if missing, migrated, and every suite re-seeds it.
//   node scripts/test-api.mjs [all|rls|money|<test file>] [extra vitest args]
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ROOT, compose, fail, loadEnv, requireEnv, run } from './lib/env.mjs';

loadEnv();
const args = process.argv.slice(2);
// --fresh: drop and recreate link_test (after editing a migration that was already applied there).
const fresh = args.includes('--fresh');
const [suite = 'all', ...rest] = args.filter((a) => a !== '--fresh');
const { DATABASE_URL_MIGRATOR } = requireEnv(
  'DATABASE_URL_MIGRATOR',
  'DATABASE_URL',
  'DATABASE_URL_WORKER',
);

// TEST_DB_NAME: another test database, e.g. a restored backup (CI's restore test); its name must
// contain link_test, so the suites' own guard still recognises it as a test database.
const DB = process.env.TEST_DB_NAME || 'link_test';
if (!DB.includes('link_test')) fail('TEST_DB_NAME must contain link_test.');
const toTestDb = (url) => {
  const u = new URL(url);
  u.pathname = `/${DB}`;
  return u.toString();
};
const toRedisDb1 = (url) => {
  const u = new URL(url);
  u.pathname = '/1';
  return u.toString();
};

// The database: created by the init script on a fresh volume; older volumes get it here.
const exists = spawnSync(
  'docker',
  compose(
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'postgres',
    '-tAc',
    `SELECT 1 FROM pg_database WHERE datname = '${DB}'`,
  ),
  { cwd: ROOT, encoding: 'utf8' },
);
if (exists.status !== 0) fail('Postgres is not running. Start it with pnpm dev:infra.');
const psql = (...a) =>
  run(
    'docker',
    compose('exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', ...a),
  );
if (fresh && exists.stdout.trim() === '1') psql('-c', `DROP DATABASE ${DB} WITH (FORCE)`);
if (fresh || exists.stdout.trim() !== '1') {
  psql('-c', `CREATE DATABASE ${DB} OWNER app_migrator`);
  psql(
    '-d',
    DB,
    '-c',
    'CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS btree_gist; ALTER SCHEMA public OWNER TO app_migrator;',
  );
}

const env = {
  ...process.env,
  DATABASE_URL: toTestDb(process.env.DATABASE_URL),
  DATABASE_URL_WORKER: toTestDb(process.env.DATABASE_URL_WORKER),
  DATABASE_URL_MIGRATOR: toTestDb(DATABASE_URL_MIGRATOR),
  REDIS_STATE_URL: toRedisDb1(process.env.REDIS_STATE_URL),
  REDIS_CACHE_URL: toRedisDb1(process.env.REDIS_CACHE_URL),
  LOG_LEVEL: 'warn',
};
run(process.execPath, [join(ROOT, 'scripts', 'db.mjs'), 'migrate'], { env });

const coreApi = join(ROOT, 'apps', 'core-api');
const vitest = join(
  dirname(createRequire(join(coreApi, 'package.json')).resolve('vitest/package.json')),
  'vitest.mjs',
);
// all = integration + RLS; rls; money (ledger golden/property and seat tests); or one file/folder.
const files = { all: ['test/integration', 'test/rls'], rls: ['test/rls'], money: ['test/money'] }[
  suite
] ?? [suite];
run(process.execPath, [vitest, 'run', ...files, ...rest], { cwd: coreApi, env });
