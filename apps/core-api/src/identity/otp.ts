import { randomInt, timingSafeEqual } from 'node:crypto';
import type { Translate } from '@link/i18n';
import type { SmsSender } from '../adapters/sms';
import { lookupHmac } from '../platform/crypto';
import { Problem } from '../platform/problem';
import { hit, type Redises } from '../platform/redis';
import type { Phones } from './phone';

/**
 * Phone codes (MKT-ACC-01; 07 §1 rate limits; 10 §7: stored as hashes, at most 5 tries).
 * Redis (state) only: `otp:{p}` = {hash, tries} for 5 minutes, `otp:cool:{p}` for the 60-second
 * resend wait, plus rate-limit counters. `{p}` is a short HMAC of the phone, never the phone.
 */
export const OTP = {
  digits: 6,
  ttlSeconds: 300,
  resendSeconds: 60,
  maxTries: 5,
  perPhone10Min: 3,
  perPhoneDay: 10,
  perIpHour: 20,
  /** Code checks from one address (on top of 5 tries per code). */
  verifyPerIpHour: 60,
} as const;

/** Codes typed with Arabic-Indic digits or spaces still match. */
const normaliseCode = (code: string) =>
  code.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\s/g, '');

export class OtpService {
  constructor(
    private readonly redis: Redises,
    private readonly phones: Phones,
    private readonly sms: SmsSender,
    private readonly hmacKey: string,
  ) {}

  private hash(e164: string, code: string) {
    return lookupHmac(this.hmacKey, `otp:${e164}:${code}`);
  }

  async request(e164: string, ip: string, t: Translate) {
    const p = this.phones.redisKey(e164);
    const r = this.redis.state;
    const cool = await r.ttl(this.redis.key('otp', 'cool', p));
    if (cool > 0)
      throw new Problem(429, 'resend_too_soon', 'Wait a moment before asking for a new code.', {
        retryAfterSeconds: cool,
      });
    for (const [key, limit, window] of [
      [this.redis.key('rl', 'otp', 'ip', ip), OTP.perIpHour, 3600],
      [this.redis.key('rl', 'otp', 'p10', p), OTP.perPhone10Min, 600],
      [this.redis.key('rl', 'otp', 'pday', p), OTP.perPhoneDay, 86_400],
    ] as const) {
      const { count, retryAfter } = await hit(r, key, window);
      if (count > limit)
        throw new Problem(429, 'rate_limited', 'Too many codes asked for. Try again later.', {
          retryAfterSeconds: retryAfter,
        });
    }
    const code = String(randomInt(0, 10 ** OTP.digits)).padStart(OTP.digits, '0');
    const key = this.redis.key('otp', p);
    await r
      .multi()
      .hset(key, { h: this.hash(e164, code).toString('hex'), tries: 0 })
      .expire(key, OTP.ttlSeconds)
      .set(this.redis.key('otp', 'cool', p), '1', 'EX', OTP.resendSeconds)
      .exec();
    try {
      await this.sms.send({ to: e164, body: t('sms.otp.body', { code }), templateCode: 'otp' });
    } catch {
      await r.del(key, this.redis.key('otp', 'cool', p));
      throw new Problem(503, 'sms_unavailable', 'We could not send the code. Try again.');
    }
    return { resendAfterSeconds: OTP.resendSeconds, expiresInSeconds: OTP.ttlSeconds };
  }

  /** Throws a problem unless the code is right; a right code is used up (one sign-in per code). */
  async verify(e164: string, rawCode: string, ip = 'unknown') {
    const p = this.phones.redisKey(e164);
    const key = this.redis.key('otp', p);
    const r = this.redis.state;
    const limit = await hit(r, this.redis.key('rl', 'otpv', 'ip', ip), 3600);
    if (limit.count > OTP.verifyPerIpHour)
      throw new Problem(429, 'rate_limited', 'Too many tries. Try again later.', {
        retryAfterSeconds: limit.retryAfter,
      });
    const stored = await r.hgetall(key);
    if (!stored.h)
      throw new Problem(422, 'otp_expired', 'This code has expired. Ask for a new one.');
    if (Number(stored.tries) >= OTP.maxTries)
      throw new Problem(429, 'otp_locked', 'Too many tries. Ask for a new code.', {
        remainingAttempts: 0,
      });
    const code = normaliseCode(rawCode);
    const ok =
      /^\d{6}$/.test(code) && timingSafeEqual(this.hash(e164, code), Buffer.from(stored.h, 'hex'));
    if (!ok) {
      const tries = await r.hincrby(key, 'tries', 1);
      throw new Problem(422, 'otp_invalid', 'That code is not right.', {
        remainingAttempts: Math.max(0, OTP.maxTries - tries),
      });
    }
    // DEL returns 1 for exactly one caller, so two parallel verifies cannot both sign in.
    if ((await r.del(key)) !== 1)
      throw new Problem(422, 'otp_expired', 'This code has expired. Ask for a new one.');
  }
}
