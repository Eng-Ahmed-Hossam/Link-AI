import { Redis } from 'ioredis';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { SmsMessage, SmsSender } from '../src/adapters/sms';
import { loadConfig } from '../src/config';
import type { DB } from '../src/db/schema';
import { createLogger } from '../src/platform/logger';
import { createApi } from '../src/server';
import { seedDemo } from '../seeds/demo';

/**
 * Test harness: a fresh demo world in `link_test` (scripts/test-api.mjs points every URL there),
 * the real API on a random port, and an in-memory SmsSender so codes are read without sms-sink.
 */
export class CapturingSms implements SmsSender {
  readonly sent: SmsMessage[] = [];
  async send(m: SmsMessage) {
    this.sent.push(m);
    return { providerMessageId: String(this.sent.length) };
  }
  lastCode(to: string) {
    const m = [...this.sent].reverse().find((x) => x.to === to && x.templateCode === 'otp');
    if (!m) throw new Error(`no code sent to ${to}`);
    return m.body.match(/\d{6}/)![0];
  }
}

export const PHONES = {
  parent: '+201000000001',
  teacher: '+201000000002', // Ms Salma
  owner: '+201000000003', // Al Nour
  reception: '+201000000004',
  ownerB: '+201000000007', // Nile Academy (tenant B)
};

export async function startApi() {
  if (!/link_test/.test(process.env.DATABASE_URL ?? ''))
    throw new Error(
      'Run these suites with pnpm test:api / test:rls (they use the link_test database).',
    );
  await seedDemo(process.env.DATABASE_URL_MIGRATOR!);
  const config = loadConfig();
  const sms = new CapturingSms();
  const { app, close } = await createApi(
    config,
    createLogger(process.env.TEST_LOG ?? 'silent', 'test'),
    { sms },
  );
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as { port: number };
  const redis = new Redis(config.REDIS_STATE_URL);
  const migrator = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString: process.env.DATABASE_URL_MIGRATOR, max: 2 }),
    }),
  });
  return {
    base: `http://127.0.0.1:${port}`,
    sms,
    redis,
    /** Superuser-like access for assertions (the table owner; RLS does not apply). */
    db: migrator,
    /** Clear the resend wait and rate limits so one test can sign in many times. */
    resetOtpLimits: async () => {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(
          cursor,
          'MATCH',
          `${config.APP_ENV}:rl:*`,
          'COUNT',
          500,
        );
        const cool = await redis.keys(`${config.APP_ENV}:otp:cool:*`);
        if (keys.length || cool.length) await redis.del(...keys, ...cool);
        cursor = next;
      } while (cursor !== '0');
    },
    close: async () => {
      redis.disconnect();
      await migrator.destroy();
      await close();
    },
  };
}
export type Api = Awaited<ReturnType<typeof startApi>>;

export interface Res<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

/** A small HTTP client: Bearer (teacher app) or cookie (web) transport. */
export class Client {
  token: string | null = null;
  refresh: string | null = null;
  private jar = new Map<string, string>();

  constructor(
    private readonly api: Api,
    readonly opts: { web?: boolean; lang?: 'ar' | 'en' } = {},
  ) {}

  async call<T = Record<string, unknown>>(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Res<T>> {
    const h: Record<string, string> = { 'accept-language': this.opts.lang ?? 'en', ...headers };
    if (body !== undefined) h['content-type'] = 'application/json';
    if (method !== 'GET' && !('idempotency-key' in h)) h['idempotency-key'] = crypto.randomUUID();
    if (this.opts.web) {
      h['x-link-auth'] = 'cookie';
      if (this.jar.size) h.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    } else if (this.token) h.authorization = `Bearer ${this.token}`;
    const res = await fetch(`${this.api.base}${path}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, v] = pair!.split('=');
      if (/Expires=Thu, 01 Jan 1970/.test(c) || v === '') this.jar.delete(k!);
      else this.jar.set(k!, v!);
    }
    const text = await res.text();
    return {
      status: res.status,
      body: (text ? JSON.parse(text) : null) as T,
      headers: res.headers,
    };
  }

  cookies() {
    return new Map(this.jar);
  }

  /** Request a code, read it from the captured SMS, verify. */
  async signIn(phone: string) {
    await this.api.resetOtpLimits();
    const r1 = await this.call('POST', '/v1/auth/otp/request', { phone });
    if (r1.status !== 200) throw new Error(`otp/request ${r1.status} ${JSON.stringify(r1.body)}`);
    const r = await this.call<{
      accessToken?: string;
      refreshToken?: string;
      user: { id: string; roles: string[]; centreIds: string[]; teacherId: string | null };
      isNewUser: boolean;
    }>('POST', '/v1/auth/otp/verify', { phone, code: this.api.sms.lastCode(phone) });
    if (r.status !== 200) throw new Error(`otp/verify ${r.status} ${JSON.stringify(r.body)}`);
    this.token = r.body.accessToken ?? null;
    this.refresh = r.body.refreshToken ?? null;
    return r.body;
  }
}
