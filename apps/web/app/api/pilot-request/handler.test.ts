import { describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '../../../src/pilot-request';
import { handlePilotRequest, recipient } from './handler';

const body = {
  centreName: 'مركز الأمل',
  contactName: 'هبة مصطفى',
  phone: '01012345678',
  area: 'مدينة نصر',
  teachers: 8,
  consent: true,
  lang: 'ar',
};
const post = (b: unknown, ip = '1.2.3.4') =>
  new Request('http://x/api/pilot-request', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    body: typeof b === 'string' ? b : JSON.stringify(b),
  });
const env = { EMAIL_API_KEY: 'k', PILOT_REQUEST_TO: 'me@example.com' };

describe('POST /api/pilot-request', () => {
  it('sends a valid request once and answers ok', async () => {
    const send = vi.fn().mockResolvedValue(true);
    const res = await handlePilotRequest(post(body), env, send, new RateLimiter());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, delivered: true });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0]).toMatchObject({ phone: '01012345678', teachers: 8 });
  });
  it('400 with the bad fields, and sends nothing', async () => {
    const send = vi.fn();
    const res = await handlePilotRequest(
      post({ ...body, phone: '12' }),
      env,
      send,
      new RateLimiter(),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'validation_failed', errors: ['phone'] });
    expect(send).not.toHaveBeenCalled();
  });
  it('a filled honeypot looks like success but sends nothing', async () => {
    const send = vi.fn();
    const res = await handlePilotRequest(
      post({ ...body, website: 'spam.example' }),
      env,
      send,
      new RateLimiter(),
    );
    expect(res.status).toBe(200);
    expect(send).not.toHaveBeenCalled();
  });
  it('429 after 5 requests from one address in 10 minutes; another address still passes', async () => {
    const send = vi.fn().mockResolvedValue(true);
    const rate = new RateLimiter();
    for (let i = 0; i < 5; i++)
      expect((await handlePilotRequest(post(body), env, send, rate)).status).toBe(200);
    const res = await handlePilotRequest(post(body), env, send, rate);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: 'rate_limited' });
    expect((await handlePilotRequest(post(body, '9.9.9.9'), env, send, rate)).status).toBe(200);
  });
  it('no key: prints a redacted line, still answers ok, never the contents', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const res = await handlePilotRequest(post(body), {}, vi.fn(), new RateLimiter());
    expect(await res.json()).toEqual({ ok: true, delivered: false });
    const printed = JSON.stringify(log.mock.calls);
    expect(printed).not.toContain('الأمل');
    expect(printed).not.toContain('01012345678');
    log.mockRestore();
  });
  it('502 when the provider fails; bad JSON and oversized bodies are refused', async () => {
    const failing = vi.fn().mockResolvedValue(false);
    expect((await handlePilotRequest(post(body), env, failing, new RateLimiter())).status).toBe(
      502,
    );
    expect((await handlePilotRequest(post('{'), env, vi.fn(), new RateLimiter())).status).toBe(400);
    expect(
      (await handlePilotRequest(post('x'.repeat(5000)), env, vi.fn(), new RateLimiter())).status,
    ).toBe(413);
  });
});

describe('recipient', () => {
  it('uses PILOT_REQUEST_TO, else the public contact address, else nothing (no send)', () => {
    expect(recipient({ PILOT_REQUEST_TO: 'a@x.com', NEXT_PUBLIC_CONTACT_EMAIL: 'b@x.com' })).toBe(
      'a@x.com',
    );
    expect(recipient({ NEXT_PUBLIC_CONTACT_EMAIL: 'b@x.com' })).toBe('b@x.com');
    expect(recipient({})).toBe('');
  });
});
