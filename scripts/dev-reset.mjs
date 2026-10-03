// pnpm dev:reset — drop the local volumes, start the services, migrate and seed again.
// Asks for confirmation (pass --yes to skip, e.g. in CI).
import { createInterface } from 'node:readline/promises';
import { loadEnv, run, compose, fail } from './lib/env.mjs';

loadEnv();
if (process.env.APP_ENV !== 'local')
  fail(`dev:reset only runs with APP_ENV=local (got "${process.env.APP_ENV}").`);

if (!process.argv.includes('--yes')) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    'This deletes ALL local data (Postgres and Redis-state volumes). Type "reset" to continue: ',
  );
  rl.close();
  if (answer.trim() !== 'reset') fail('Cancelled. Nothing was changed.');
}

run('docker', compose('down', '--volumes', '--remove-orphans'));
run(process.execPath, ['scripts/dev-infra.mjs']);
run(process.execPath, ['scripts/db.mjs', 'migrate']);
run(process.execPath, ['scripts/db.mjs', 'seed']);
console.log('\n✔ Local environment reset: migrated and seeded.');
