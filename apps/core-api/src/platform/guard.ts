import { sql } from 'kysely';
import { demoId } from '../../seeds/demo-id';
import type { Config } from '../config';
import type { Database } from './db';
import { draftConsentTexts } from '../identity/consent-pack';

/**
 * The production guard (ship job S1). `LINK_ENV` says what kind of deployment this is:
 *   development — a developer machine (the default);
 *   staging     — a production build with the local fakes allowed (`pnpm prod:local`);
 *   production  — real users: no fake provider, no demo route, no sample data, no local key.
 * In production, start-up refuses to run while any setting below is wrong, and names each one.
 * Staging and development pass everything except settings that make no sense there.
 */
export type LinkEnv = 'development' | 'staging' | 'production';

export function linkEnv(env: NodeJS.ProcessEnv = process.env): LinkEnv {
  const v = (env.LINK_ENV ?? 'development').trim();
  if (v === 'development' || v === 'staging' || v === 'production') return v;
  throw new Error(`LINK_ENV must be development, staging or production (got "${v}").`);
}

/** Demo routes (`/__demo/*`): a developer machine, or staging when DEMO_ROUTES=1. */
export function demoRoutesAllowed(c: Config, env: NodeJS.ProcessEnv = process.env) {
  const kind = linkEnv(env);
  if (kind === 'production') return false;
  return c.APP_ENV === 'local' || (kind === 'staging' && env.DEMO_ROUTES === '1');
}

const LOCAL_URL =
  /^https?:\/\/(localhost|127\.0\.0\.1|host\.docker\.internal|aws-local|sms-sink|fake-pay|whatsapp-fake)([:/]|$)/i;

/** What is wrong for LINK_ENV=production, one line per setting (empty = fine). */
export function productionProblems(c: Config, env: NodeJS.ProcessEnv = process.env): string[] {
  if (linkEnv(env) !== 'production') return [];
  const p: string[] = [];
  if (c.APP_ENV !== 'prod') p.push(`APP_ENV=${c.APP_ENV}: production runs with APP_ENV=prod.`);
  if (c.PAYMENT_PROVIDER === 'fake' || env.FAKE_PAY_URL)
    p.push('PAYMENT_PROVIDER=fake / FAKE_PAY_URL: fake-pay is not allowed in production.');
  if (c.SMS_PROVIDER === 'fake' || env.SMS_SINK_URL)
    p.push('SMS_PROVIDER=fake / SMS_SINK_URL: sms-sink is not allowed in production.');
  if (c.WHATSAPP_PROVIDER === 'fake' || env.WHATSAPP_FAKE_URL)
    p.push(
      'WHATSAPP_PROVIDER=fake / WHATSAPP_FAKE_URL: whatsapp-fake is not allowed in production (use manual until a provider is set).',
    );
  if (
    env.WHATSAPP_WEBHOOK_SECRET === undefined ||
    c.WHATSAPP_WEBHOOK_SECRET === 'local-whatsapp-fake-secret'
  )
    p.push('WHATSAPP_WEBHOOK_SECRET: the local default secret is not allowed in production.');
  if (env.DEMO_ROUTES === '1')
    p.push('DEMO_ROUTES=1: demo routes (/__demo) are not allowed in production.');
  if (env.FIELD_KEY_LOCAL)
    p.push(
      'FIELD_KEY_LOCAL: the developer phone key from .env.local is not allowed; set FIELD_KEY.',
    );
  for (const name of ['AWS_ENDPOINT_URL', 'S3_ENDPOINT', 'AI_SERVICE_URL'] as const) {
    const v = env[name];
    if (
      v &&
      LOCAL_URL.test(v) &&
      !(name === 'AI_SERVICE_URL' && /^http:\/\/ai(-service)?:/.test(v))
    )
      p.push(`${name}=${v}: points at a local fake (aws-local or this machine).`);
  }
  if (c.QUEUE_PROVIDER === 'sqs' && c.AWS_ENDPOINT_URL && LOCAL_URL.test(c.AWS_ENDPOINT_URL))
    p.push(
      'QUEUE_PROVIDER=sqs with aws-local: use QUEUE_PROVIDER=postgres on one server, or real SQS.',
    );
  // OD-60: no real data until the lawyer-reviewed consent pack is approved and its labels set.
  const drafts = draftConsentTexts(env);
  if (drafts.length)
    p.push(
      `CONSENT_VERSIONS: ${drafts.join(', ')} still use a draft text (OD-60); set the approved labels.`,
    );
  if (/localhost|127\.0\.0\.1/.test(c.CORS_ALLOWED_ORIGINS))
    p.push(`CORS_ALLOWED_ORIGINS includes localhost: list only the real web origins.`);
  if (/localhost|127\.0\.0\.1/.test(c.NEXT_PUBLIC_SITE_URL))
    p.push(`NEXT_PUBLIC_SITE_URL=${c.NEXT_PUBLIC_SITE_URL}: set the public https address.`);
  if (/^local|^dev/i.test(c.JWT_SIGNING_KEY_ID) || /localhost/.test(c.JWT_ISSUER))
    p.push(
      'JWT_SIGNING_KEY_ID / JWT_ISSUER: the local values are not allowed; use the production ones.',
    );
  return p;
}

/**
 * The check that needs the database: the sample demo world (`pnpm seed:demo`) must never be in a
 * production database. Its users have fixed IDs (seeds/demo-id.ts), so one lookup finds them.
 */
export async function sampleWorldProblems(db: Database): Promise<string[]> {
  const ids = ['usr-salma', 'usr-owner', 'usr-owner-b'].map(demoId);
  const { rows } = await db.asSystem((tx) =>
    sql<{
      n: number;
    }>`SELECT count(*)::int AS n FROM identity.users WHERE id = ANY (${ids}::uuid[])`.execute(tx),
  );
  return rows[0]!.n > 0
    ? [
        'The database holds the sample demo world (pnpm seed:demo): production needs a clean database.',
      ]
    : [];
}

export function formatProblems(kind: LinkEnv, problems: string[]) {
  return [
    `Refusing to start with LINK_ENV=${kind}: ${problems.length} setting(s) are wrong.`,
    ...problems.map((x) => `  ✗ ${x}`),
    '  (docs/go-live-switches.md lists every setting and its real value.)',
  ].join('\n');
}
