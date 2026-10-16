// Stage 3: the hosted staging's private code inbox (SMS_PROVIDER=inbox) — codes kept in Redis,
// readable only with Basic auth (SMS_SINK_TOKEN); refused in production.
import { afterAll, describe, expect, it } from 'vitest';
import {
  RedisInboxSender,
  SmsInboxController,
  inboxAuthorised,
  inboxKey,
} from '../../src/adapters/sms-inbox';
import { loadConfig } from '../../src/config';
import { productionProblems } from '../../src/platform/guard';
import { Redises } from '../../src/platform/redis';

const TOKEN = 'sample-inbox-token-0123456789';
const redis = new Redises(process.env.REDIS_STATE_URL!, process.env.REDIS_CACHE_URL!, 'inboxtest');
afterAll(async () => {
  await redis.state.del(inboxKey(redis));
  await redis.close();
});
const basic = (pass: string) => `Basic ${Buffer.from(`x:${pass}`).toString('base64')}`;

function fakeRes() {
  const r = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status(c: number) {
      r.statusCode = c;
      return r;
    },
    setHeader(k: string, v: string) {
      r.headers[k.toLowerCase()] = v;
      return r;
    },
    type() {
      return r;
    },
    end() {
      return r;
    },
    json(b: unknown) {
      r.body = b;
      return r;
    },
    send(b: unknown) {
      r.body = b;
      return r;
    },
  };
  return r;
}

describe('SMS_PROVIDER=inbox', () => {
  it('keeps each SMS, newest first, and serves them only with the token', async () => {
    const sender = new RedisInboxSender(redis);
    await sender.send({ to: '+201000000003', body: 'code 111111', templateCode: 'otp' });
    await sender.send({ to: '+201000000051', body: 'code 222222', templateCode: 'otp' });
    const c = new SmsInboxController(redis, { SMS_SINK_TOKEN: TOKEN } as never);
    const req = (auth?: string) => ({ header: () => auth }) as never;

    const anon = fakeRes();
    await c.json(req(), anon as never);
    expect(anon.statusCode).toBe(401);
    expect(anon.headers['www-authenticate']).toMatch(/Basic/);
    const wrong = fakeRes();
    await c.json(req(basic('nope')), wrong as never);
    expect(wrong.statusCode).toBe(401);

    const ok = fakeRes();
    await c.json(req(basic(TOKEN)), ok as never);
    const items = (ok.body as { items: { to: string; templateCode: string }[] }).items;
    expect(items.map((x) => x.to)).toEqual(['+201000000051', '+201000000003']);
    expect(items[0]!.templateCode).toBe('otp');
    expect(await redis.state.ttl(inboxKey(redis))).toBeGreaterThan(0);
  });

  it('constant-time Basic check; no token = closed', () => {
    expect(inboxAuthorised(basic(TOKEN), TOKEN)).toBe(true);
    expect(inboxAuthorised(basic(TOKEN), '')).toBe(false);
    expect(inboxAuthorised(undefined, TOKEN)).toBe(false);
  });

  it('needs the token to start, and production refuses it', () => {
    expect(() =>
      loadConfig({ ...process.env, SMS_PROVIDER: 'inbox', SMS_SINK_TOKEN: undefined }),
    ).toThrow(/SMS_SINK_TOKEN/);
    const env = {
      ...process.env,
      LINK_ENV: 'production',
      SMS_PROVIDER: 'inbox',
      SMS_SINK_TOKEN: TOKEN,
    };
    expect(productionProblems(loadConfig(env), env).join('\n')).toMatch(/SMS_PROVIDER=inbox/);
  });
});
