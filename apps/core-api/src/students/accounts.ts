import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { sql } from 'kysely';
import { consentVersion } from '../identity/consent-pack';
import type { Client, Tokens } from '../identity/tokens';
import { writeAudit } from '../platform/audit';
import { lookupHmac, randomToken, sha256 } from '../platform/crypto';
import type { Database, Tx } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import { Problem, notFound, unauthenticated } from '../platform/problem';
import { hit, type Redises } from '../platform/redis';
import type { Reference } from '../ref/reference';

/**
 * Student accounts (database v2 group A, migration 0023; decisions of 2026-10-16). Only a parent
 * of the child creates one. The parent's app makes a one-time code (10 minutes, one device); on
 * that device the student sets a 4-digit PIN, which works only there (up to 2 devices; a 3rd is
 * refused). 5 wrong PINs lock the account until the parent makes a new code. The parent pauses
 * it, removes a device or signs it out everywhere; each takes effect on the next request (the
 * RLS context and the AuthGuard's device check are read per request, never cached). A student
 * has no phone, email or Google sign-in.
 */
export const STUDENT = {
  codeTtlSeconds: 600,
  pinSetupSeconds: 600,
  maxDevices: 2,
  maxPinTries: 5,
  /** Code redeems and PIN sign-ins from one address (on top of 5 tries per account). */
  perIpHour: 30,
} as const;

/** No 0/O, 1/I/L: read aloud from a parent's phone without mistakes. 31^8 ≈ 2^40. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const normaliseCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
const normalisePin = (pin: string) =>
  pin.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
const SCRYPT = { N: 16384, r: 8, p: 1 };

export type AccountStatus = 'awaiting_device' | 'active' | 'paused' | 'locked' | 'closed';

export class StudentAccounts {
  private readonly pepper: Buffer;

  constructor(
    private readonly db: Database,
    private readonly redis: Redises,
    private readonly tokens: Tokens,
    private readonly ref: Reference,
    private readonly hmacKey: string,
  ) {
    // The PIN pepper is a server secret derived from HMAC_KEY_LOOKUP, never stored in the
    // database: a stolen database alone can't try the 10,000 PINs.
    this.pepper = createHmac('sha256', hmacKey).update('link:student-pin:v1').digest();
  }

  // ── PIN and code hashing ─────────────────────────────────────────────────────
  pinHash(deviceId: string, pin: string) {
    const salt = randomBytes(16);
    const key = createHmac('sha256', this.pepper).update(`${deviceId}:${pin}`).digest();
    const h = scryptSync(key, salt, 32, SCRYPT);
    return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${h.toString('base64')}`;
  }
  private pinMatches(stored: string, deviceId: string, pin: string) {
    const [, n, r, p, salt, hash] = stored.split('$');
    const key = createHmac('sha256', this.pepper).update(`${deviceId}:${pin}`).digest();
    const h = scryptSync(key, Buffer.from(salt!, 'base64'), 32, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return timingSafeEqual(h, Buffer.from(hash!, 'base64'));
  }
  private codeHmac(code: string) {
    return lookupHmac(this.hmacKey, `student-code:${normaliseCode(code)}`);
  }

  // ── The parent's side ────────────────────────────────────────────────────────
  /** The child, if the caller is a parent of it (GUARDIAN RLS). 404 for anyone else's child. */
  async childOf(userId: string, studentId: string) {
    return this.db.asUser(userId, async (tx, ctx) => {
      if (!ctx.guardianId || ctx.studentId) throw notFound('child');
      const s = await tx
        .selectFrom('org.students')
        .select(['id', 'display_name'])
        .where('id', '=', studentId)
        .where('archived_at', 'is', null)
        .executeTakeFirst();
      if (!s) throw notFound('child');
      const linked = await tx
        .selectFrom('org.student_guardians')
        .select('guardian_id')
        .where('student_id', '=', studentId)
        .where('guardian_id', '=', ctx.guardianId)
        .executeTakeFirst();
      if (!linked) throw notFound('child');
      return { guardianId: ctx.guardianId, displayName: s.display_name };
    });
  }

  async view(tx: Tx, studentId: string) {
    const a = await tx
      .selectFrom('identity.student_accounts')
      .selectAll()
      .where('student_id', '=', studentId)
      .executeTakeFirst();
    if (!a) return { account: null };
    const devices = await tx
      .selectFrom('identity.student_devices')
      .select(['id', 'platform', 'label', 'pin_set_at', 'last_used_at', 'created_at'])
      .where('student_id', '=', studentId)
      .where('revoked_at', 'is', null)
      .orderBy('created_at')
      .execute();
    return {
      account: {
        studentId,
        status: a.status as AccountStatus,
        failedPinCount: a.failed_pin_count,
        lockedAt: a.locked_at?.toISOString() ?? null,
        pausedAt: a.paused_at?.toISOString() ?? null,
        devices: devices.map((d) => ({
          id: d.id,
          platform: d.platform as 'web' | 'ios' | 'android',
          label: d.label,
          pinSet: d.pin_set_at !== null,
          lastUsedAt: d.last_used_at?.toISOString() ?? null,
          addedAt: d.created_at.toISOString(),
        })),
        maxDevices: STUDENT.maxDevices,
        createdAt: a.created_at.toISOString(),
      },
    };
  }

  async get(userId: string, studentId: string) {
    await this.childOf(userId, studentId);
    return this.db.asSystem((sys) => this.view(sys, studentId));
  }

  /** Only a parent creates one; the student user has no phone, email or name of its own. */
  async create(userId: string, studentId: string, requestId?: string) {
    const { guardianId } = await this.childOf(userId, studentId);
    return this.db.asSystem(async (sys) => {
      const has = await sys
        .selectFrom('identity.student_accounts')
        .select('status')
        .where('student_id', '=', studentId)
        .forUpdate()
        .executeTakeFirst();
      if (has)
        throw new Problem(
          409,
          'student_account_exists',
          'This child already has a student account.',
        );
      const parent = await sys
        .selectFrom('identity.users')
        .select('language')
        .where('id', '=', userId)
        .executeTakeFirstOrThrow();
      const studentUser = uuidv7();
      await sys
        .insertInto('identity.users')
        .values({ id: studentUser, account_type: 'student', language: parent.language })
        .execute();
      const consentId = uuidv7();
      await sys
        .insertInto('org.consent_events')
        .values({
          id: consentId,
          user_id: userId,
          guardian_id: guardianId,
          student_id: studentId,
          kind: 'student_account',
          granted: true,
          version: consentVersion('student_account'),
          source: 'student_account',
        })
        .execute();
      await sys
        .insertInto('identity.student_accounts')
        .values({
          student_id: studentId,
          user_id: studentUser,
          guardian_id: guardianId,
          created_by_user_id: userId,
          consent_event_id: consentId,
        })
        .execute();
      await this.audit(sys, userId, 'student_account.created', studentId, requestId, {
        status: 'awaiting_device',
      });
      return this.view(sys, studentId);
    });
  }

  /** A one-time code for one device (10 minutes); the previous live code is cancelled. */
  async newCode(userId: string, studentId: string, requestId?: string) {
    await this.childOf(userId, studentId);
    return this.db.asSystem(async (sys) => {
      const a = await this.lockAccount(sys, studentId);
      if (a.status === 'closed')
        throw new Problem(409, 'student_account_closed', 'This student account is closed.');
      const now = new Date();
      await sys
        .updateTable('identity.student_access_codes')
        .set({ revoked_at: now })
        .where('student_id', '=', studentId)
        .where('used_at', 'is', null)
        .where('revoked_at', 'is', null)
        .execute();
      const raw = Array.from(
        { length: 8 },
        () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
      ).join('');
      const expiresAt = new Date(now.getTime() + STUDENT.codeTtlSeconds * 1000);
      await sys
        .insertInto('identity.student_access_codes')
        .values({
          id: uuidv7(),
          student_id: studentId,
          created_by_user_id: userId,
          code_hmac: this.codeHmac(raw),
          created_at: now,
          expires_at: expiresAt,
        })
        .execute();
      // The code itself is never stored or audited.
      await this.audit(sys, userId, 'student_account.code_made', studentId, requestId);
      return { code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expiresAt: expiresAt.toISOString() };
    });
  }

  async pause(userId: string, studentId: string, requestId?: string) {
    await this.childOf(userId, studentId);
    return this.db.asSystem(async (sys) => {
      const a = await this.lockAccount(sys, studentId);
      if (a.status === 'locked')
        throw new Problem(
          409,
          'student_locked',
          'The account is locked: make a new code to unlock it.',
        );
      if (a.status === 'closed')
        throw new Problem(409, 'student_account_closed', 'This student account is closed.');
      if (a.status !== 'paused') {
        await sys
          .updateTable('identity.student_accounts')
          .set({ status: 'paused', paused_at: new Date(), paused_by: userId })
          .where('student_id', '=', studentId)
          .execute();
        await this.revokeSessions(sys, a.user_id);
        await this.audit(sys, userId, 'student_account.paused', studentId, requestId, {
          from: a.status,
        });
      }
      return this.view(sys, studentId);
    });
  }

  async resume(userId: string, studentId: string, requestId?: string) {
    await this.childOf(userId, studentId);
    return this.db.asSystem(async (sys) => {
      const a = await this.lockAccount(sys, studentId);
      if (a.status === 'paused') {
        const next = (await this.hasReadyDevice(sys, studentId)) ? 'active' : 'awaiting_device';
        await sys
          .updateTable('identity.student_accounts')
          .set({ status: next, paused_at: null, paused_by: null })
          .where('student_id', '=', studentId)
          .execute();
        await this.audit(sys, userId, 'student_account.resumed', studentId, requestId, {
          to: next,
        });
      }
      return this.view(sys, studentId);
    });
  }

  /** Every session ends and every device is unbound: the student needs a new code. */
  async signOutEverywhere(userId: string, studentId: string, requestId?: string) {
    await this.childOf(userId, studentId);
    return this.db.asSystem(async (sys) => {
      const a = await this.lockAccount(sys, studentId);
      await sys
        .updateTable('identity.student_devices')
        .set({ revoked_at: new Date(), revoked_reason: 'signed_out_everywhere' })
        .where('student_id', '=', studentId)
        .where('revoked_at', 'is', null)
        .execute();
      await this.revokeSessions(sys, a.user_id);
      if (a.status === 'active')
        await sys
          .updateTable('identity.student_accounts')
          .set({ status: 'awaiting_device' })
          .where('student_id', '=', studentId)
          .execute();
      await this.audit(sys, userId, 'student_account.signed_out_everywhere', studentId, requestId);
      return this.view(sys, studentId);
    });
  }

  /** One device goes; it stops working on its next request (the AuthGuard checks it). */
  async removeDevice(userId: string, studentId: string, deviceId: string, requestId?: string) {
    await this.childOf(userId, studentId);
    return this.db.asSystem(async (sys) => {
      const a = await this.lockAccount(sys, studentId);
      const d = await sys
        .updateTable('identity.student_devices')
        .set({ revoked_at: new Date(), revoked_reason: 'removed_by_parent' })
        .where('id', '=', deviceId)
        .where('student_id', '=', studentId)
        .where('revoked_at', 'is', null)
        .returning('id')
        .executeTakeFirst();
      if (!d) throw notFound('device');
      await sys
        .updateTable('identity.auth_sessions')
        .set({ revoked_at: new Date() })
        .where('student_device_id', '=', deviceId)
        .where('revoked_at', 'is', null)
        .execute();
      if (a.status === 'active' && !(await this.hasReadyDevice(sys, studentId)))
        await sys
          .updateTable('identity.student_accounts')
          .set({ status: 'awaiting_device' })
          .where('student_id', '=', studentId)
          .execute();
      await this.audit(sys, userId, 'student_account.device_removed', studentId, requestId, {
        deviceId,
      });
      return this.view(sys, studentId);
    });
  }

  // ── The student's device ─────────────────────────────────────────────────────
  /**
   * The parent's code on this device. A device already bound to this account (its ID and
   * secret) gets a new PIN setup; any other device is bound as a new one (at most 2).
   */
  async redeem(
    body: {
      code: string;
      platform: 'web' | 'ios' | 'android';
      label?: string;
      deviceId?: string;
      deviceSecret?: string;
    },
    ip: string,
    requestId?: string,
  ) {
    await this.limitIp(ip);
    const invalid = () =>
      new Problem(
        422,
        'code_invalid',
        'This code is not valid any more. Ask your parent for a new one.',
      );
    return this.db.asSystem(async (sys) => {
      const code = await sys
        .selectFrom('identity.student_access_codes')
        .selectAll()
        .where('code_hmac', '=', this.codeHmac(body.code))
        .forUpdate()
        .executeTakeFirst();
      if (!code || code.used_at || code.revoked_at || code.expires_at.getTime() <= Date.now())
        throw invalid();
      const a = await this.lockAccount(sys, code.student_id);
      if (a.status === 'closed') throw invalid();
      if (a.status === 'paused')
        throw new Problem(403, 'student_paused', 'Your parent paused this account.');
      let deviceId: string;
      let secret: string | undefined;
      const known =
        body.deviceId && body.deviceSecret
          ? await sys
              .selectFrom('identity.student_devices')
              .select('id')
              .where('id', '=', body.deviceId)
              .where('student_id', '=', code.student_id)
              .where('secret_hash', '=', sha256(body.deviceSecret))
              .where('revoked_at', 'is', null)
              .executeTakeFirst()
          : undefined;
      if (known) {
        deviceId = known.id;
        await sys
          .updateTable('identity.student_devices')
          .set({ pin_hash: null, pin_set_at: null, access_code_id: code.id })
          .where('id', '=', deviceId)
          .execute();
      } else {
        const live = await sys
          .selectFrom('identity.student_devices')
          .select(sql<number>`count(*)::int`.as('n'))
          .where('student_id', '=', code.student_id)
          .where('revoked_at', 'is', null)
          .executeTakeFirstOrThrow();
        if (live.n >= STUDENT.maxDevices)
          throw new Problem(
            409,
            'student_device_limit',
            'This account already has 2 devices. Ask your parent to remove a device.',
          );
        deviceId = uuidv7();
        secret = randomToken(32);
        await sys
          .insertInto('identity.student_devices')
          .values({
            id: deviceId,
            student_id: code.student_id,
            user_id: a.user_id,
            secret_hash: sha256(secret),
            platform: body.platform,
            label: (body.label ?? defaultLabel(body.platform)).slice(0, 60),
            access_code_id: code.id,
          })
          .execute();
      }
      await sys
        .updateTable('identity.student_access_codes')
        .set({ used_at: new Date(), used_by_device_id: deviceId })
        .where('id', '=', code.id)
        .execute();
      const setup = randomToken(32);
      await this.redis.state.set(
        this.redis.key('spin', sha256(setup).toString('hex')),
        deviceId,
        'EX',
        STUDENT.pinSetupSeconds,
      );
      await this.audit(sys, null, 'student_account.device_bound', code.student_id, requestId, {
        deviceId,
        known: !!known,
      });
      return {
        deviceId,
        ...(secret ? { deviceSecret: secret } : {}),
        pinSetupToken: setup,
        expiresInSeconds: STUDENT.pinSetupSeconds,
      };
    });
  }

  /** The PIN for this device; a locked account unlocks here (the parent made a new code). */
  async setPin(token: string, pin: string, client: Client, requestId?: string) {
    const key = this.redis.key('spin', sha256(token).toString('hex'));
    const deviceId = await this.redis.state.getdel(key);
    if (!deviceId)
      throw new Problem(422, 'pin_setup_expired', 'Use your parent’s code again to set the PIN.');
    const p = normalisePin(pin);
    const userId = await this.db.asSystem(async (sys) => {
      const d = await sys
        .selectFrom('identity.student_devices')
        .select(['student_id', 'user_id', 'revoked_at'])
        .where('id', '=', deviceId)
        .executeTakeFirstOrThrow();
      if (d.revoked_at) throw unauthenticated('student_device_unknown', 'This device was removed.');
      const a = await this.lockAccount(sys, d.student_id);
      if (a.status === 'paused')
        throw new Problem(403, 'student_paused', 'Your parent paused this account.');
      await sys
        .updateTable('identity.student_devices')
        .set({
          pin_hash: this.pinHash(deviceId, p),
          pin_set_at: new Date(),
          last_used_at: new Date(),
        })
        .where('id', '=', deviceId)
        .execute();
      await sys
        .updateTable('identity.student_accounts')
        .set({ status: 'active', failed_pin_count: 0, locked_at: null })
        .where('student_id', '=', d.student_id)
        .execute();
      await this.audit(sys, null, 'student_account.pin_set', d.student_id, requestId, {
        deviceId,
        unlocked: a.status === 'locked',
      });
      return d.user_id;
    });
    return this.session(userId, deviceId, client);
  }

  /**
   * Device + PIN. The device secret is checked first, so a stranger can't even try a PIN (and a
   * wrong secret never counts toward the lock). The 5th wrong PIN locks the account and ends its
   * sessions; the outcome is decided in the transaction and thrown after it commits, so the
   * counter is kept.
   */
  async signIn(
    body: { deviceId: string; deviceSecret: string; pin: string },
    ip: string,
    client: Client,
    requestId?: string,
  ) {
    await this.limitIp(ip);
    const out = await this.db.asSystem(async (sys) => {
      const d = await sys
        .selectFrom('identity.student_devices')
        .selectAll()
        .where('id', '=', body.deviceId)
        .executeTakeFirst();
      if (
        !d ||
        d.revoked_at ||
        !timingSafeEqual(d.secret_hash, sha256(body.deviceSecret)) ||
        !d.pin_hash
      )
        return { kind: 'unknown' as const };
      const a = await this.lockAccount(sys, d.student_id);
      if (a.status === 'paused') return { kind: 'paused' as const };
      if (a.status === 'locked') return { kind: 'locked' as const };
      if (a.status === 'closed') return { kind: 'unknown' as const };
      if (!this.pinMatches(d.pin_hash, d.id, normalisePin(body.pin))) {
        const tries = a.failed_pin_count + 1;
        const after = await sys
          .updateTable('identity.student_accounts')
          .set({ failed_pin_count: tries })
          .where('student_id', '=', d.student_id)
          .returning('status')
          .executeTakeFirstOrThrow();
        if (after.status === 'locked') {
          await this.revokeSessions(sys, a.user_id);
          await this.audit(sys, null, 'student_account.locked', d.student_id, requestId, {
            deviceId: d.id,
          });
          return { kind: 'locked' as const };
        }
        await this.audit(sys, null, 'student_account.pin_failed', d.student_id, requestId, {
          deviceId: d.id,
          tries,
        });
        return { kind: 'wrong' as const, triesLeft: STUDENT.maxPinTries - tries };
      }
      await sys
        .updateTable('identity.student_accounts')
        .set({ failed_pin_count: 0 })
        .where('student_id', '=', d.student_id)
        .execute();
      await sys
        .updateTable('identity.student_devices')
        .set({ last_used_at: new Date() })
        .where('id', '=', d.id)
        .execute();
      return { kind: 'ok' as const, userId: d.user_id, deviceId: d.id };
    });
    if (out.kind === 'unknown')
      throw unauthenticated(
        'student_device_unknown',
        'This device is not set up. Ask your parent for a code.',
      );
    if (out.kind === 'paused')
      throw new Problem(403, 'student_paused', 'Your parent paused this account.');
    if (out.kind === 'locked')
      throw new Problem(
        423,
        'student_locked',
        'Too many wrong PINs. Ask your parent for a new code.',
      );
    if (out.kind === 'wrong')
      throw new Problem(401, 'wrong_pin', 'That PIN is not right.', { triesLeft: out.triesLeft });
    return this.session(out.userId, out.deviceId, client);
  }

  /** A student session on this device: refresh token, access token (with the device), profile. */
  private async session(userId: string, deviceId: string, client: Client) {
    const refreshToken = await this.tokens.startSession(userId, client, {
      amr: 'student_pin',
      studentDeviceId: deviceId,
    });
    return this.db.asUser(userId, async (tx, ctx) => {
      if (!ctx.studentId) throw unauthenticated();
      return {
        refreshToken,
        accessToken: await this.tokens.access(userId, ctx, 'ar', deviceId),
        student: await this.studentMe(tx, ctx.studentId, 'ar'),
      };
    });
  }

  /** The signed-in student's profile and groups (students only). */
  async me(userId: string, lang: 'ar' | 'en') {
    return this.db.asUser(userId, async (tx, ctx) => {
      if (!ctx.studentId) throw studentsOnly();
      return this.studentMe(tx, ctx.studentId, lang);
    });
  }

  async studentMe(tx: Tx, studentId: string, lang: 'ar' | 'en') {
    const s = await tx
      .selectFrom('org.students')
      .select(['display_name', 'curriculum_id', 'school_year_id'])
      .where('id', '=', studentId)
      .executeTakeFirstOrThrow();
    const name = lang === 'en' ? 'name_en' : 'name_ar';
    const groups = await sql<{
      group_id: string;
      subject_id: string;
      code: string;
      subject: string;
      teacher: string;
      centre: string;
    }>`SELECT DISTINCT g.id AS group_id, sub.id AS subject_id, sub.code, sub.${sql.ref(name)} AS subject,
              t.display_name AS teacher, c.name AS centre
       FROM market.my_student_sessions() ms
       JOIN market.groups g ON g.id = ms.group_id
       JOIN ref.subjects sub ON sub.id = g.subject_id
       JOIN market.public_teachers t ON t.id = g.teacher_id
       JOIN market.public_centres c ON c.id = g.centre_id`.execute(tx);
    return {
      studentId,
      displayName: s.display_name,
      curriculum: await this.ref.curriculumRef(tx, s.curriculum_id, lang),
      schoolYear: await this.ref.schoolYearRef(tx, s.school_year_id, lang),
      groups: groups.rows.map((g) => ({
        groupId: g.group_id,
        subject: { id: g.subject_id, code: g.code, name: g.subject },
        teacherName: g.teacher,
        centreName: g.centre,
      })),
    };
  }

  // ── helpers ──────────────────────────────────────────────────────────────────
  private async lockAccount(sys: Tx, studentId: string) {
    const a = await sys
      .selectFrom('identity.student_accounts')
      .selectAll()
      .where('student_id', '=', studentId)
      .forUpdate()
      .executeTakeFirst();
    if (!a) throw notFound('student account');
    return a;
  }

  private async hasReadyDevice(sys: Tx, studentId: string) {
    return !!(await sys
      .selectFrom('identity.student_devices')
      .select('id')
      .where('student_id', '=', studentId)
      .where('revoked_at', 'is', null)
      .where('pin_hash', 'is not', null)
      .executeTakeFirst());
  }

  private async revokeSessions(sys: Tx, userId: string) {
    await sys
      .updateTable('identity.auth_sessions')
      .set({ revoked_at: new Date() })
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .execute();
  }

  private async limitIp(ip: string) {
    const { count, retryAfter } = await hit(
      this.redis.state,
      this.redis.key('rl', 'student', 'ip', ip),
      3600,
    );
    if (count > STUDENT.perIpHour)
      throw new Problem(429, 'rate_limited', 'Too many tries from here. Try again later.', {
        retryAfterSeconds: retryAfter,
      });
  }

  private audit(
    sys: Tx,
    actorId: string | null,
    action: string,
    studentId: string,
    requestId?: string,
    after?: Record<string, unknown>,
  ) {
    return writeAudit(sys, {
      actorId,
      actorType: actorId ? 'user' : 'system',
      action,
      objectType: 'student_account',
      objectRef: studentId,
      after: after ?? null,
      requestId,
    });
  }
}

export const studentsOnly = () =>
  new Problem(403, 'students_only', 'This is for a student account.');

const defaultLabel = (p: 'web' | 'ios' | 'android') =>
  p === 'web' ? 'Web browser' : p === 'ios' ? 'iPhone or iPad' : 'Android phone';
