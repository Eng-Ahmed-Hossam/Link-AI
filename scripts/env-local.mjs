// node scripts/env-local.mjs [--force] — write a fresh .env.local for this machine (or CI):
// the standard local ports and URLs, and random secrets that never leave the file. Every other
// name in .env.example is listed as a commented placeholder (`# NAME=`), so `pnpm run doctor` can tell
// the file is complete. On an EXISTING .env.local (no --force) it only appends the names it lacks
// — values it never changes — which is what `pnpm run setup` runs every time. --force rewrites the
// file (keeping the keys that protect your local data). Sample-data local stack only (docs/14 §3).
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { envNames } from './lib/checks.mjs';
import { ENV_FILE, ROOT } from './lib/env.mjs';

const force = process.argv.includes('--force');
const exampleNames = [...envNames(readFileSync(join(ROOT, '.env.example'), 'utf8')).set];

/**
 * Never replace a key the stored data depends on (decided 2026-10-09): phones are encrypted with
 * FIELD_KEY_LOCAL and found by HMAC_KEY_LOOKUP. An existing value is carried over as it is.
 */
const KEPT = ['FIELD_KEY_LOCAL', 'HMAC_KEY_LOOKUP'];
const existing = existsSync(ENV_FILE)
  ? Object.fromEntries(
      readFileSync(ENV_FILE, 'utf8')
        .split(/\r?\n/)
        .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l))
        .filter(Boolean)
        .map((m) => [m[1], m[2]]),
    )
  : {};

const secret = (bytes = 24) => randomBytes(bytes).toString('base64url');
const key32 = () => randomBytes(32).toString('base64');
const pw = {
  postgres: secret(),
  migrator: secret(),
  user: secret(),
  worker: secret(),
  ops: secret(),
};
const PG = process.env.POSTGRES_HOST_PORT || '5432';
const db = (role, pass) => `postgres://${role}:${pass}@localhost:${PG}/link`;

const values = {
  APP_ENV: 'local',
  LOG_LEVEL: 'info',
  POSTGRES_HOST_PORT: PG,
  POSTGRES_PASSWORD: pw.postgres,
  APP_MIGRATOR_PASSWORD: pw.migrator,
  APP_USER_PASSWORD: pw.user,
  APP_WORKER_PASSWORD: pw.worker,
  APP_OPS_PASSWORD: pw.ops,
  DATABASE_URL: db('app_user', pw.user),
  DATABASE_URL_WORKER: db('app_worker', pw.worker),
  DATABASE_URL_OPS: db('app_ops', pw.ops),
  DATABASE_URL_MIGRATOR: db('app_migrator', pw.migrator),
  DATABASE_REPLICA_URL: db('app_user', pw.user),
  REDIS_CACHE_URL: 'redis://localhost:6379/0',
  REDIS_STATE_URL: 'redis://localhost:6380/0',
  AWS_ACCESS_KEY_ID: 'local',
  AWS_SECRET_ACCESS_KEY: 'local',
  AWS_ENDPOINT_URL: 'http://localhost:4566',
  S3_ENDPOINT: 'http://localhost:4566',
  S3_REGION: 'eu-central-1',
  S3_BUCKET_VOICE: 'link-local-voice',
  S3_BUCKET_MEDIA: 'link-local-media',
  S3_BUCKET_EXPORTS: 'link-local-exports',
  KMS_KEY_STORAGE: 'alias/link-local-storage',
  KMS_KEY_FIELDS: 'alias/link-local-fields',
  HMAC_KEY_LOOKUP: secret(32),
  FIELD_KEY_LOCAL: key32(),
  QUEUE_PROVIDER: 'sqs',
  EVENTS_TOPIC: 'link-local-events',
  QUEUE_NOTIFICATIONS: 'link-local-notifications',
  DLQ_NOTIFICATIONS: 'link-local-notifications-dlq',
  QUEUE_PLATFORM_DEMO: 'link-local-platform-demo',
  DLQ_PLATFORM_DEMO: 'link-local-platform-demo-dlq',
  QUEUE_VOICE: 'link-local-voice',
  DLQ_VOICE: 'link-local-voice-dlq',
  QUEUE_MESSAGING: 'link-local-messaging',
  DLQ_MESSAGING: 'link-local-messaging-dlq',
  QUEUE_FOLLOWUP: 'link-local-followup',
  DLQ_FOLLOWUP: 'link-local-followup-dlq',
  JWT_ISSUER: 'http://localhost:4000',
  JWT_AUDIENCE: 'link-local',
  JWT_SIGNING_KEY_ID: 'local-dev',
  JWT_SIGNING_KEY: key32(),
  ACCESS_TOKEN_TTL: '900',
  REFRESH_TOKEN_TTL: '2592000',
  CORE_API_PORT: '4000',
  CORE_API_URL: 'http://localhost:4000',
  CORS_ALLOWED_ORIGINS: 'http://localhost:8081',
  SMS_PROVIDER: 'fake',
  SMS_SENDER_ID: 'Link',
  SMS_SINK_HOST_PORT: '8093',
  SMS_SINK_URL: 'http://localhost:8093',
  PAYMENT_PROVIDER: 'fake',
  PAYMENT_WEBHOOK_SECRET: secret(),
  FAKE_PAY_URL: 'http://localhost:8091',
  FAKE_PAY_WEBHOOK_URL: 'http://host.docker.internal:4000/v1/webhooks/payments/fake-pay',
  EMAIL_PROVIDER: 'fake',
  WHATSAPP_PROVIDER: 'fake',
  WHATSAPP_FAKE_URL: 'http://localhost:8094',
  WHATSAPP_FAKE_HOST_PORT: '8094',
  WHATSAPP_WEBHOOK_SECRET: secret(),
  WHATSAPP_FAKE_WEBHOOK_URL: 'http://host.docker.internal:4000/v1/webhooks/messaging/whatsapp-fake',
  GATEWAY_PORT: '4002',
};

if (existsSync(ENV_FILE) && !force) {
  // Append only: the names this file lacks. A known name gets its local default; any other name a
  // commented placeholder. Nothing already in the file changes.
  const have = envNames(readFileSync(ENV_FILE, 'utf8'));
  const known = (n) => have.set.has(n) || have.listed.has(n);
  const add = [...new Set([...Object.keys(values), ...exampleNames])].filter((n) => !known(n));
  if (!add.length) {
    console.log('✔ .env.local is complete (nothing changed).');
    process.exit(0);
  }
  const lines = add.map((n) => (n in values ? `${n}=${values[n]}` : `# ${n}=`));
  appendFileSync(
    ENV_FILE,
    `\n# Added by scripts/env-local.mjs (names newer than this file; existing values untouched)\n${lines.join('\n')}\n`,
  );
  console.log(
    `✔ .env.local: added ${add.length} name(s) (${lines.filter((l) => !l.startsWith('#')).length} with local defaults, the rest as commented placeholders); nothing else changed.`,
  );
  process.exit(0);
}

for (const k of KEPT) if (existing[k]) values[k] = existing[k];
const kept = KEPT.filter((k) => existing[k]);
const body = Object.entries(values)
  .map(([k, v]) => `${k}=${v}`)
  .join('\n');
const placeholders = exampleNames
  .filter((n) => !(n in values))
  .map((n) => `# ${n}=`)
  .join('\n');
writeFileSync(
  ENV_FILE,
  `# Generated by scripts/env-local.mjs — local sample stack only. Never commit this file.\n${body}\n\n# Optional locally (see .env.example); uncomment to set\n${placeholders}\n`,
);
console.log(
  `✔ Wrote .env.local (${Object.keys(values).length} values, fresh secrets` +
    (kept.length ? `; kept ${kept.join(' and ')}, so your local data stays readable).` : ').'),
);
console.log(
  '  If FIELD_KEY_LOCAL or HMAC_KEY_LOOKUP ever changes, run pnpm seed:demo --reset (sample data).',
);
