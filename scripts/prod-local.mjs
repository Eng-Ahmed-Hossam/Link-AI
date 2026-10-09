// pnpm prod:local [--story] [--down] [--wipe] — the PRODUCTION images and compose, on this
// machine, with LINK_ENV=staging: the only mode where the local fakes (fake-pay, sms-sink,
// whatsapp-fake) and the sample demo world run next to production builds. Deploys nothing.
//   (default)  build the images, start everything, wait for health, load the sample world
//   --no-build use the images already built
//   --story    then run the connected story (9 steps) against it, the same spec as pnpm dev
//   --down     stop it (keeps the data);  --wipe  stop it and delete its volumes
// Uses deploy/.env.staging (written once with fresh secrets; never committed).
// Behind a TLS-inspecting proxy set EXTRA_CA_FILE=<ca.crt> so image builds can reach npm and PyPI.
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail } from './lib/env.mjs';
import { renderEnv } from './lib/prod-env.mjs';

const args = process.argv.slice(2);
const envFile = join(ROOT, 'deploy', '.env.staging');
const compose = [
  'compose',
  '-p',
  'link-staging',
  '-f',
  join(ROOT, 'deploy', 'docker-compose.prod.yml'),
  '-f',
  join(ROOT, 'deploy', 'docker-compose.staging.yml'),
  '--env-file',
  envFile,
];
const env = { ...process.env, LINK_ENV_FILE: '.env.staging' };
const sh = (cmd, a, opts = {}) => {
  const r = spawnSync(cmd, a, { cwd: ROOT, stdio: 'inherit', env, ...opts });
  if (r.status !== 0) fail(`${cmd} ${a.slice(0, 6).join(' ')} … failed (exit ${r.status})`);
};

if (args.includes('--down') || args.includes('--wipe')) {
  sh('docker', [...compose, 'down', ...(args.includes('--wipe') ? ['--volumes'] : [])]);
  process.exit(0);
}

// The story's ports must be free: pnpm dev / pnpm demo and the dev fakes use the same ones.
const { createServer } = await import('node:net');
const free = (port) =>
  new Promise((res) => {
    const srv = createServer().once('error', () => res(false));
    srv.listen(port, '0.0.0.0', () => srv.close(() => res(true)));
  });
const ours = spawnSync('docker', [...compose, 'ps', '-q'], { encoding: 'utf8', env }).stdout.trim();
if (!ours) {
  const busy = [];
  for (const p of [3000, 4000, 8081, 8091, 8093, 8094]) if (!(await free(p))) busy.push(p);
  if (busy.length)
    fail(
      `Ports in use: ${busy.join(', ')}. Stop pnpm dev / pnpm demo and the dev fakes first:\n` +
        '  docker compose -f infra/local/docker-compose.yml stop fake-pay sms-sink whatsapp-fake',
    );
}

if (!existsSync(envFile)) {
  writeFileSync(
    envFile,
    renderEnv({
      LINK_ENV: 'staging',
      APP_ENV: 'staging',
      LINK_DOMAIN: 'localhost',
      ACME_EMAIL: 'staging@link.invalid',
      LINK_VERSION: 'local',
      WEB_APP_ENV: 'staging',
      JWT_ISSUER: 'http://localhost:4000',
      JWT_AUDIENCE: 'link-staging',
      JWT_SIGNING_KEY_ID: 'staging',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      PAYMENT_PROVIDER: 'fake',
      SMS_PROVIDER: 'fake',
      WHATSAPP_PROVIDER: 'fake',
      STORAGE_PROVIDER: 'file',
    }),
    { mode: 0o600 },
  );
  console.log('✓ Wrote deploy/.env.staging (fresh secrets, sample data only).');
}

// Images: built here so one optional proxy CA reaches every build (compose would need a file).
const ca = process.env.EXTRA_CA_FILE;
const build = (file, tag, buildArgs = []) => {
  const t = Date.now();
  sh('docker', [
    'build',
    ...(ca ? ['--network', 'host', '--secret', `id=extra_ca,src=${ca}`] : []),
    '-f',
    file,
    '-t',
    tag,
    ...buildArgs.flatMap((b) => ['--build-arg', b]),
    '.',
  ]);
  console.log(`  ✓ ${tag} in ${((Date.now() - t) / 1000).toFixed(0)} s`);
};
const skipBuild = args.includes('--no-build');
if (!skipBuild) console.log('\nBuilding the production images…');
if (!skipBuild) build('apps/core-api/Dockerfile', 'link/core-api:local');
if (!skipBuild)
  build('apps/web/Dockerfile', 'link/web:staging', [
    'NEXT_PUBLIC_APP_ENV=staging',
    'NEXT_PUBLIC_SITE_URL=http://localhost:3000',
    'CORE_API_URL=http://api:4000',
  ]);
if (!skipBuild)
  build('apps/teacher-app/Dockerfile.web', 'link/teacher-web:staging', [
    'EXPO_PUBLIC_API_BASE_URL=http://localhost:4000',
  ]);
if (!skipBuild && !process.env.PROD_LOCAL_SKIP_PG_BUILD)
  build('infra/local/postgres/Dockerfile', 'link/postgres:16-postgis-pgvector');
for (const fake of skipBuild ? [] : ['sms-sink', 'fake-pay', 'whatsapp-fake'])
  sh(
    'docker',
    ['build', '-q', '--build-arg', `FAKE=${fake}`, '-t', `link/${fake}:local`, 'infra/local/fakes'],
    {
      stdio: ['ignore', 'ignore', 'inherit'],
    },
  );

console.log('\nStarting (LINK_ENV=staging)…');
sh('docker', [...compose, 'up', '-d', '--no-build', '--wait', '--wait-timeout', '300']);

// The sample world, through the staging demo routes (the same seed as pnpm seed:demo).
const r = await fetch('http://localhost:4000/__demo/story/reset', { method: 'POST' });
if (!r.ok) fail(`Loading the sample world failed: ${r.status} ${await r.text()}`);
console.log('✓ Sample world loaded.');

const sizes = spawnSync(
  'docker',
  ['images', '--format', '{{.Repository}}:{{.Tag}}  {{.Size}}', '--filter', 'reference=link/*'],
  { encoding: 'utf8' },
).stdout;
console.log(`
Link — production images, staging mode (sample data only)
  Web          http://localhost:3000/ar/welcome    (production build behind Caddy, LINK_ENV=staging)
  Teacher app  http://localhost:8081
  core-api     http://localhost:4000/ready
  Codes        http://localhost:8093
Images:
${sizes
  .trim()
  .split('\n')
  .map((l) => `  ${l}`)
  .join('\n')}
Stop: pnpm prod:local --down   (or --wipe to delete its data)`);

if (args.includes('--story')) {
  const t = Date.now();
  sh(process.execPath, [join(ROOT, 'scripts', 'e2e-modes.mjs'), 'live', 'story.spec.ts']);
  console.log(
    `✓ Connected story passed against the production images in ${((Date.now() - t) / 1000).toFixed(0)} s.`,
  );
}
