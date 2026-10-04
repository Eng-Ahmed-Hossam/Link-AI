/**
 * Pilot sign-in (A3): each person has a 6-digit PIN, set by the owner and shown once.
 * - PINs are stored as scrypt hashes with a per-PIN salt; never in plain text, never in a browser.
 * - 5 wrong PINs in a row lock that person for 15 minutes; each address is also rate-limited.
 * - Sessions live on the server; the browser only holds an opaque token in an httpOnly cookie.
 */
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import type { PilotStore } from './store';

export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;
/** Sign-in attempts allowed per network address per 15 minutes (all users together). */
export const IP_LIMIT = 30;
export const COOKIE = 'link_pilot_session';

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const WEAK = new Set(['000000', '111111', '123456', '654321', '121212', '112233', '999999']);

export const isPinShape = (pin: unknown): pin is string =>
  typeof pin === 'string' && /^\d{6}$/.test(pin);

/** A random 6-digit PIN that is not an obvious one. */
export function newPin(): string {
  for (;;) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (!WEAK.has(pin) && !/^(\d)\1{5}$/.test(pin)) return pin;
  }
}
export function hashPin(pin: string, salt = randomBytes(16).toString('base64')) {
  return { salt, hash: scryptSync(pin, salt, 32, SCRYPT).toString('base64') };
}
export function pinMatches(pin: string, rec: { hash: string; salt: string }) {
  const got = scryptSync(pin, rec.salt, 32, SCRYPT);
  const want = Buffer.from(rec.hash, 'base64');
  return got.length === want.length && timingSafeEqual(got, want);
}
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export type SignInResult =
  | { ok: true; token: string; userId: string; expiresAt: string }
  | { ok: false; code: 'wrong_pin'; attemptsLeft: number }
  | { ok: false; code: 'locked'; lockedUntil: string }
  | { ok: false; code: 'rate_limited' | 'unknown_user' | 'no_pin' };

export class PilotAuth {
  private attemptsByIp = new Map<string, number[]>();

  constructor(
    private store: PilotStore,
    private opts: { sessionHours: number; isActiveUser: (id: string) => boolean },
  ) {}

  private get auth() {
    return this.store.snap!.auth;
  }

  /** Set a new random PIN for a person (owner action or `pilot:init`); returns it once. */
  setPin(userId: string, now = new Date()): string {
    const pin = newPin();
    this.auth.pins[userId] = { ...hashPin(pin), setAt: now.toISOString() };
    delete this.auth.lock[userId];
    this.revokeSessions(userId);
    this.store.write();
    return pin;
  }

  revokeSessions(userId: string) {
    for (const [k, s] of Object.entries(this.auth.sessions))
      if (s.userId === userId) delete this.auth.sessions[k];
  }

  signIn(userId: string, pin: string, ip: string, now = new Date()): SignInResult {
    const t = now.getTime();
    const recent = (this.attemptsByIp.get(ip) ?? []).filter((x) => t - x < LOCK_MINUTES * 60_000);
    if (recent.length >= IP_LIMIT) return { ok: false, code: 'rate_limited' };
    recent.push(t);
    this.attemptsByIp.set(ip, recent);

    if (!this.opts.isActiveUser(userId)) return { ok: false, code: 'unknown_user' };
    const rec = this.auth.pins[userId];
    if (!rec) return { ok: false, code: 'no_pin' };
    const lock = (this.auth.lock[userId] ??= { failures: 0, lockedUntil: null });
    if (lock.lockedUntil && new Date(lock.lockedUntil).getTime() > t)
      return { ok: false, code: 'locked', lockedUntil: lock.lockedUntil };
    if (lock.lockedUntil) {
      lock.lockedUntil = null;
      lock.failures = 0;
    }
    if (!isPinShape(pin) || !pinMatches(pin, rec)) {
      lock.failures += 1;
      if (lock.failures >= MAX_FAILURES) {
        lock.lockedUntil = new Date(t + LOCK_MINUTES * 60_000).toISOString();
        lock.failures = 0;
        this.store.write();
        return { ok: false, code: 'locked', lockedUntil: lock.lockedUntil };
      }
      this.store.write();
      return { ok: false, code: 'wrong_pin', attemptsLeft: MAX_FAILURES - lock.failures };
    }
    lock.failures = 0;
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(t + this.opts.sessionHours * 3_600_000).toISOString();
    this.pruneExpired(now);
    this.auth.sessions[tokenHash(token)] = { userId, createdAt: now.toISOString(), expiresAt };
    this.store.write();
    return { ok: true, token, userId, expiresAt };
  }

  /** The signed-in person for a session token, or null (expired, revoked, or access removed). */
  userFor(token: string | null, now = new Date()): string | null {
    if (!token) return null;
    const s = this.auth.sessions[tokenHash(token)];
    if (!s) return null;
    if (new Date(s.expiresAt).getTime() <= now.getTime() || !this.opts.isActiveUser(s.userId))
      return null;
    return s.userId;
  }

  signOut(token: string | null) {
    if (!token) return;
    delete this.auth.sessions[tokenHash(token)];
    this.store.write();
  }

  private pruneExpired(now: Date) {
    for (const [k, s] of Object.entries(this.auth.sessions))
      if (new Date(s.expiresAt).getTime() <= now.getTime()) delete this.auth.sessions[k];
  }
}

export function cookieValue(header: string | null | undefined, name = COOKIE): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function sessionCookie(token: string, maxAgeS: number, secure: boolean) {
  return [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAgeS))}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}
export const clearCookie = (secure: boolean) => sessionCookie('', 0, secure);
