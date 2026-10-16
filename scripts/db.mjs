// pnpm db:migrate | db:rollback | db:status | db:seed | db:backup | db:restore <file> --yes
// Migrations are plain SQL, applied by dbmate as app_migrator (ADR-0006).
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, loadEnv, requireEnv, run, fail } from './lib/env.mjs';
import { backup, backupProblems, restore, summary } from './lib/db-backup.mjs';

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

/**
 * db:migrate backs up first (docs/plan/database-v2.md §7): only the local dev database `link`,
 * never in CI or for the throwaway test database (test-api.mjs), and not with --no-backup.
 */
async function backupBeforeMigrate() {
  const dbName = new URL(DATABASE_URL_MIGRATOR).pathname.slice(1);
  if (process.env.CI || process.argv.includes('--no-backup') || dbName !== 'link') return;
  if (backupProblems(process.env).length) return;
  const { file, size } = await backup();
  console.log(`Backup before migrating: ${file} (${Math.round(size / 1024)} KB)`);
}

switch (cmd) {
  case 'backup': {
    const problems = backupProblems(process.env);
    if (problems.length) fail(`db:backup only backs up the local database: ${problems.join('; ')}`);
    const { file, size } = await backup();
    const s = summary();
    console.log(
      `✔ ${file} (${Math.round(size / 1024)} KB · ${s.users} users · migration ${s.migration})`,
    );
    break;
  }
  case 'restore': {
    const file = process.argv[3];
    const problems = backupProblems(process.env);
    if (problems.length)
      fail(`db:restore only restores the local database: ${problems.join('; ')}`);
    if (!file || file.startsWith('--')) fail('Usage: pnpm db:restore <backups/file.dump> --yes');
    if (!process.argv.includes('--yes'))
      fail(`This replaces the local database "link" with ${file}. Run again with --yes.`);
    await restore(file);
    await setLocalRolePasswords();
    const s = summary();
    console.log(`✔ Restored ${file} (${s.users} users · migration ${s.migration})`);
    break;
  }
  case 'migrate':
    await backupBeforeMigrate();
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
    // --if-empty (pnpm run setup): keep a database that already has users; seed only a fresh one.
    if (process.argv.includes('--if-empty')) {
      const pg = requireCore('pg');
      const client = new pg.Client({ connectionString: DATABASE_URL_MIGRATOR });
      await client.connect();
      const { rows } = await client.query('SELECT count(*)::int AS n FROM identity.users');
      await client.end();
      if (rows[0].n > 0) {
        console.log(
          `Database has data (${rows[0].n} users); kept. pnpm run setup --reset-data re-seeds it.`,
        );
        break;
      }
    }
    // tsx: the seed imports the mock fixtures (TypeScript workspace packages).
    run(
      process.execPath,
      [
        join(dirname(requireCore.resolve('tsx/package.json')), 'dist', 'cli.mjs'),
        join(coreApi, 'seeds', 'demo.ts'),
        ...process.argv.slice(3).filter((a) => a !== '--if-empty'),
      ],
      { cwd: coreApi },
    );
    break;
  default:
    fail('Usage: node scripts/db.mjs migrate|rollback|status|types|seed|backup|restore');
}
