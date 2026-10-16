// Part C P1 / brief of 2026-10-16 §5: behind the web's /v1 proxy (Vercel) every tester used to
// share the edge's address and so one OTP limit (20 an hour). The proxy now signs the visitor's
// real address; core-api believes it only with LINK_PROXY_SECRET.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OTP } from '../../src/identity/otp';
import { CLIENT_IP_HEADER, PROXY_SECRET_HEADER, clientIp } from '../../src/platform/client-ip';
import { type Api, startApi } from '../helpers';

const SECRET = 'sample-proxy-secret-0123456789';
let api: Api;
beforeAll(async () => {
  process.env.LINK_PROXY_SECRET = SECRET;
  api = await startApi();
}, 120_000);
afterAll(async () => {
  delete process.env.LINK_PROXY_SECRET;
  await api.close();
});

let n = 0;
const ask = (headers: Record<string, string>) =>
  fetch(`${api.base}/v1/auth/otp/request`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': crypto.randomUUID(),
      ...headers,
    },
    // A different sample number each time: the per-phone limit (3 / 10 min) never interferes.
    body: JSON.stringify({ phone: `0155${String(7000000 + n++).padStart(7, '0')}` }),
  });
const via = (ip: string, secret = SECRET) => ({
  [PROXY_SECRET_HEADER]: secret,
  [CLIENT_IP_HEADER]: ip,
});

describe('the real client address behind the web proxy', () => {
  it('two testers behind one proxy do not share one limit', async () => {
    for (let i = 0; i < OTP.perIpHour; i++)
      expect((await ask(via('198.51.100.10'))).status).toBe(200);
    expect((await ask(via('198.51.100.10'))).status).toBe(429);
    // Tester B, same proxy, own limit.
    expect((await ask(via('198.51.100.20'))).status).toBe(200);
  }, 120_000);

  it('a forged address without the secret is ignored (everyone shares the edge address)', async () => {
    const fake = (ip: string) => ({ unused: 'x', ...via(ip, 'wrong-secret-0123456789012345') });
    const statuses: number[] = [];
    for (let i = 0; i <= OTP.perIpHour; i++)
      statuses.push((await ask(fake(`203.0.113.${i + 1}`))).status);
    expect(statuses.at(-1)).toBe(429);
  }, 120_000);

  it('clientIp: only the right secret, only a real address', () => {
    const req = (h: Record<string, string>) =>
      ({ ip: '10.0.0.1', socket: {}, header: (k: string) => h[k.toLowerCase()] }) as never;
    expect(clientIp(req(via('198.51.100.7')), SECRET)).toBe('198.51.100.7');
    expect(clientIp(req(via('198.51.100.7', 'nope')), SECRET)).toBe('10.0.0.1');
    expect(clientIp(req(via('not-an-ip')), SECRET)).toBe('10.0.0.1');
    expect(clientIp(req(via('198.51.100.7')), undefined)).toBe('10.0.0.1');
  });
});
