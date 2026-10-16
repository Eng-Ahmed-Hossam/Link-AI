/**
 * The hosted staging's pre-deploy step, after the migrations (Stage 3): the sample world
 * (`seeds/demo.ts`, fictional people only), but only when LINK_ENV=staging and only into an
 * EMPTY database — a database that has any user is kept as it is. Never production.
 *   node apps/core-api/dist/migrate.mjs && node apps/core-api/dist/seed-staging.mjs
 */
import pg from 'pg';
import { seedDemo } from '../seeds/demo';
import { linkEnv } from './platform/guard';

const url = process.env.DATABASE_URL_MIGRATOR;
if (linkEnv() !== 'staging') {
  console.error('✗ seed-staging runs only with LINK_ENV=staging (sample data, never production).');
  process.exit(1);
}
if (!url) {
  console.error('✗ Set DATABASE_URL_MIGRATOR.');
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
const { rows } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM identity.users');
await client.end();
if (rows[0]!.n > 0) {
  console.log(`✓ seed-staging: the database has ${rows[0]!.n} users; kept as it is.`);
  process.exit(0);
}
const r = await seedDemo(url, { emptyStaging: true });
console.log(
  `✓ seed-staging: sample world loaded into the empty database (${Object.keys(r.counts).length} tables).`,
);
process.exit(0);
