// pnpm db:migrate | db:rollback | db:status | db:seed
// Migrations are plain SQL, applied by dbmate as app_migrator (ADR-0006).
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, loadEnv, requireEnv, run, fail } from './lib/env.mjs';

loadEnv();
const cmd = process.argv[2];
const { DATABASE_URL_MIGRATOR } = requireEnv('DATABASE_URL_MIGRATOR');
const coreApi = join(ROOT, 'apps', 'core-api');
const requireCore = createRequire(join(coreApi, 'package.json'));
// Run dbmate's JS launcher with node directly: no shell, so URLs with `&` stay intact on Windows.
const dbmateCli = join(dirname(requireCore.resolve('dbmate/package.json')), 'dist', 'cli.js');
const url =
  DATABASE_URL_MIGRATOR + (DATABASE_URL_MIGRATOR.includes('?') ? '&' : '?') + 'sslmode=disable';
const dbmate = (...args) =>
  run(process.execPath, [
    dbmateCli,
    '--url',
    url,
    '--migrations-dir',
    join(coreApi, 'migrations'),
    '--no-dump-schema',
    '--wait',
    ...args,
  ]);

// Local only: the app roles are NOLOGIN in migrations; give them local passwords from .env.local.
async function setLocalRolePasswords() {
  if (process.env.APP_ENV !== 'local') return;
  const { APP_USER_PASSWORD, APP_WORKER_PASSWORD, APP_OPS_PASSWORD } = requireEnv(
    'APP_USER_PASSWORD',
    'APP_WORKER_PASSWORD',
    'APP_OPS_PASSWORD',
  );
  const pg = requireCore('pg');
  const client = new pg.Client({ connectionString: DATABASE_URL_MIGRATOR });
  await client.connect();
  try {
    for (const [role, pw] of [
      ['app_user', APP_USER_PASSWORD],
      ['app_worker', APP_WORKER_PASSWORD],
      ['app_ops', APP_OPS_PASSWORD],
    ]) {
      const lit = (await client.query('SELECT quote_literal($1) AS q', [pw])).rows[0].q;
      await client.query(`ALTER ROLE ${role} LOGIN PASSWORD ${lit}`);
    }
    console.log('Local passwords set for app_user, app_worker, app_ops.');
  } finally {
    await client.end();
  }
}

switch (cmd) {
  case 'migrate':
    dbmate('up');
    await setLocalRolePasswords();
    break;
  case 'rollback':
    dbmate('rollback');
    break;
  case 'status':
    dbmate('status');
    break;
  case 'types':
    // Kysely row types from the migrated schema (ADR-0006). CI regenerates and fails on a diff.
    run(
      process.execPath,
      [
        join(dirname(requireCore.resolve('kysely-codegen/package.json')), 'dist', 'cli', 'bin.js'),
        '--dialect',
        'postgres',
        '--out-file',
        join(coreApi, 'src', 'db', 'schema.ts'),
        '--include-pattern',
        '(identity|ref|org|market|ledger|records|followup|messaging|analytics|audit|platform).*',
        '--camel-case=false',
      ],
      { env: { ...process.env, DATABASE_URL: url } },
    );
    break;
  case 'seed':
    if (process.env.APP_ENV === 'prod') fail('Refusing to seed sample data when APP_ENV=prod.');
    if (process.env.APP_ENV !== 'local')
      fail('seed:demo wipes the app tables; APP_ENV must be local.');
    // tsx: the seed imports the mock fixtures (TypeScript workspace packages).
    run(process.execPath, [
      join(dirname(requireCore.resolve('tsx/package.json')), 'dist', 'cli.mjs'),
      join(coreApi, 'seeds', 'demo.ts'),
    ]);
    break;
  default:
    fail('Usage: node scripts/db.mjs migrate|rollback|status|types|seed');
}
