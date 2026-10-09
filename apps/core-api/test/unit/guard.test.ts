// The production guard (ship job S1, docs/security-checklist.md): LINK_ENV=production refuses to
// start on any fake, demo route or local key, and names each wrong setting (never its value).
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import {
  demoRoutesAllowed,
  formatProblems,
  linkEnv,
  productionProblems,
} from '../../src/platform/guard';

const key = () => randomBytes(32).toString('base64');
/** A correct production environment (sample values; nothing real). */
function prodEnv(over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {
    LINK_ENV: 'production',
    APP_ENV: 'prod',
    DATABASE_URL: 'postgres://app_user:x@postgres:5432/link',
    DATABASE_URL_WORKER: 'postgres://app_worker:x@postgres:5432/link',
    REDIS_CACHE_URL: 'redis://redis-cache:6379/0',
    REDIS_STATE_URL: 'redis://redis-state:6379/0',
    HMAC_KEY_LOOKUP: randomBytes(32).toString('base64url'),
    FIELD_KEY: key(),
    JWT_ISSUER: 'https://api.link.example',
    JWT_AUDIENCE: 'link',
    JWT_SIGNING_KEY_ID: 'prod-2026-10',
    JWT_SIGNING_KEY: key(),
    CORS_ALLOWED_ORIGINS: 'https://link.example',
    NEXT_PUBLIC_SITE_URL: 'https://link.example',
    QUEUE_PROVIDER: 'postgres',
    STORAGE_PROVIDER: 'file',
    STORAGE_KEY: key(),
    PAYMENT_PROVIDER: 'none',
    PAYMENT_WEBHOOK_SECRET: randomBytes(24).toString('base64url'),
    WHATSAPP_PROVIDER: 'manual',
    WHATSAPP_WEBHOOK_SECRET: randomBytes(24).toString('base64url'),
    AI_SERVICE_URL: 'http://ai:8090',
    ...over,
  };
  return Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined),
  ) as NodeJS.ProcessEnv;
}
/**
 * The guard runs on a config core-api already accepted. No real SMS adapter exists yet (S4 picks
 * the provider), so the test parses with the local fakes' URLs and then sets the providers the
 * environment names — `real-sms` stands for the adapter to come.
 */
type Cfg = ReturnType<typeof loadConfig>;
const problems = (env: NodeJS.ProcessEnv) => {
  // config.ts itself refuses FIELD_KEY_LOCAL off a developer machine; the guard says it again.
  const rest = { ...env };
  delete rest.FIELD_KEY_LOCAL;
  const parsed = loadConfig({
    ...rest,
    APP_ENV: 'staging',
    SMS_PROVIDER: 'fake',
    SMS_SINK_URL: 'http://parse-only',
    PAYMENT_PROVIDER: env.PAYMENT_PROVIDER ?? 'none',
    FAKE_PAY_URL: 'http://parse-only',
  });
  return productionProblems(
    {
      ...parsed,
      APP_ENV: env.APP_ENV as Cfg['APP_ENV'],
      SMS_PROVIDER: (env.SMS_PROVIDER ?? 'real-sms') as Cfg['SMS_PROVIDER'],
    },
    env,
  );
};

describe('LINK_ENV', () => {
  it('defaults to development; rejects anything else', () => {
    expect(linkEnv({})).toBe('development');
    expect(linkEnv({ LINK_ENV: 'staging' })).toBe('staging');
    expect(() => linkEnv({ LINK_ENV: 'prod' })).toThrow(/development, staging or production/);
  });
});

describe('Production guard', () => {
  it('a correct production environment passes', () => {
    expect(problems(prodEnv())).toEqual([]);
  });

  it.each([
    ['fake-pay', { PAYMENT_PROVIDER: 'fake', FAKE_PAY_URL: 'http://fake-pay:8091' }, /fake-pay/],
    ['sms-sink', { SMS_PROVIDER: 'fake', SMS_SINK_URL: 'http://sms-sink:8093' }, /sms-sink/],
    ['whatsapp-fake', { WHATSAPP_PROVIDER: 'fake' }, /whatsapp-fake/],
    ['demo routes', { DEMO_ROUTES: '1' }, /DEMO_ROUTES=1/],
    ['the dev phone key', { FIELD_KEY_LOCAL: key() }, /FIELD_KEY_LOCAL/],
    ['aws-local', { AWS_ENDPOINT_URL: 'http://aws-local:4566' }, /AWS_ENDPOINT_URL/],
    [
      'a fake ai-service on this machine',
      { AI_SERVICE_URL: 'http://127.0.0.1:8090' },
      /AI_SERVICE_URL/,
    ],
    ['localhost CORS', { CORS_ALLOWED_ORIGINS: 'http://localhost:3000' }, /CORS_ALLOWED_ORIGINS/],
    ['local JWT values', { JWT_SIGNING_KEY_ID: 'local-dev' }, /JWT_SIGNING_KEY_ID/],
    [
      'the default WhatsApp secret',
      { WHATSAPP_WEBHOOK_SECRET: undefined },
      /WHATSAPP_WEBHOOK_SECRET/,
    ],
  ])('refuses %s, naming the setting', (_name, over, msg) => {
    const p = problems(prodEnv(over as Record<string, string | undefined>));
    expect(p.join('\n')).toMatch(msg);
  });

  it('lists every wrong setting at once, and never prints a secret value', () => {
    const secret = key();
    const env = prodEnv({
      PAYMENT_PROVIDER: 'fake',
      FAKE_PAY_URL: 'http://fake-pay:8091',
      SMS_PROVIDER: 'fake',
      SMS_SINK_URL: 'http://sms-sink:8093',
      FIELD_KEY_LOCAL: secret,
    });
    const p = problems(env);
    expect(p.length).toBeGreaterThanOrEqual(3);
    const text = formatProblems('production', p);
    expect(text).toMatch(/Refusing to start with LINK_ENV=production/);
    expect(text).not.toContain(secret);
  });

  it('staging and development allow the fakes (pnpm prod:local)', () => {
    const fakes = { PAYMENT_PROVIDER: 'fake', SMS_PROVIDER: 'fake', DEMO_ROUTES: '1' };
    expect(problems(prodEnv({ ...fakes, LINK_ENV: 'staging' }))).toEqual([]);
    expect(problems(prodEnv({ ...fakes, LINK_ENV: undefined }))).toEqual([]);
  });

  it('demo routes: local, or staging with DEMO_ROUTES=1 — never production', () => {
    const local = loadConfig({ ...process.env, APP_ENV: 'local' });
    const staging = loadConfig({
      ...prodEnv(),
      APP_ENV: 'staging',
      SMS_PROVIDER: 'fake',
      SMS_SINK_URL: 'http://sms-sink:8093',
    });
    expect(demoRoutesAllowed(local, { LINK_ENV: 'development' })).toBe(true);
    expect(demoRoutesAllowed(staging, { LINK_ENV: 'staging' })).toBe(false);
    expect(demoRoutesAllowed(staging, { LINK_ENV: 'staging', DEMO_ROUTES: '1' })).toBe(true);
    expect(demoRoutesAllowed(local, { LINK_ENV: 'production', DEMO_ROUTES: '1' })).toBe(false);
  });
});
