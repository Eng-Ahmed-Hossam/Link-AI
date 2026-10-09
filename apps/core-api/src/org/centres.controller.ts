import { CONFIG } from '../platform/di';
import type { Config } from '../config';
import { Controller, Inject, Req } from '@nestjs/common';
import type { Request } from 'express';
import { createTranslator } from '@link/i18n';
import { routes } from '../contract/routes';
import { Accounts, lastActive } from '../identity/accounts';
import { maskedPhone, Phones, toE164 } from '../identity/phone';
import { writeAudit } from '../platform/audit';
import { Database, isOwnerOf, isStaffOf, type Tx } from '../platform/db';
import { FLAG, centreFlag, flagsFor } from '../platform/flags';
import {
  Caller,
  Endpoint,
  type In,
  Input,
  langOf,
  MaybeCaller,
  type Principal,
} from '../platform/http';
import { uuidv7 } from '../platform/ids';
import { enqueue } from '../platform/outbox';
import { Problem, forbidden, notFound } from '../platform/problem';
import { requestIdOf } from '../platform/request-context';
import { hit, Redises } from '../platform/redis';

const STAFF_PERMISSIONS = ['bookings.manage', 'reviews.reply'] as const;
type StaffPermission = (typeof STAFF_PERMISSIONS)[number];
/** C01 join requests: starting values (07 §1 rate limits), like the other public endpoints. */
export const C01_LIMITS = { perIpHour: 10, perPhoneDay: 3 };
/** Version label of the C01 "Link may contact me" text (stored on the lead). */
const C01_CONSENT_VERSION = 'c01-draft-2026-10';

/**
 * Centres: the C01 join request, staff (A16, MKT-ACC-06) and paid-extra flags (OD-58).
 * `/v1/centres/{id}/*` answers 404 to anyone who is not staff of that centre (07 §2c, 10 §2).
 */
@Controller()
export class CentresController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Phones) private readonly phones: Phones,
    @Inject(Accounts) private readonly accounts: Accounts,
    @Inject(Redises) private readonly redis: Redises,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** C01 (MKT-CEN-01): stored as a lead; it becomes a centre when the number signs in. */
  @Endpoint(routes.centreApplication)
  async apply(@Input() i: In<typeof routes.centreApplication>, @Req() req: Request) {
    const b = i.body;
    if (!b.consent)
      throw new Problem(422, 'consent_required', 'Tick the box so Link can contact you.');
    const e164 = toE164(b.phone);
    // 07 §1 rate limits (starting values): a public form, so per address and per phone.
    for (const [key, limit, window] of [
      [this.redis.key('rl', 'c01', 'ip', req.ip ?? 'unknown'), C01_LIMITS.perIpHour, 3600],
      [
        this.redis.key('rl', 'c01', 'p', this.phones.redisKey(e164)),
        C01_LIMITS.perPhoneDay,
        86_400,
      ],
    ] as const) {
      const { count, retryAfter } = await hit(this.redis.state, key, window);
      if (count > limit)
        throw new Problem(429, 'rate_limited', 'Too many requests. Try again later.', {
          retryAfterSeconds: retryAfter,
        });
    }
    return this.db.asSystem(async (tx) => {
      const id = uuidv7();
      await tx
        .insertInto('org.leads')
        .values({
          id,
          kind: 'centre',
          name: b.ownerName,
          centre_name: b.centreName,
          area: b.area,
          whatsapp_encrypted: this.phones.columns(e164).phone_enc,
          whatsapp_hmac: this.phones.hmac(e164),
          contact_consent_version: C01_CONSENT_VERSION,
          details: JSON.stringify({
            governorate: b.governorate,
            address: b.address,
            subjects: b.subjects,
            hallRange: b.hallRange,
            phoneLast4: e164.slice(-4),
          }),
        })
        .execute();
      await writeAudit(tx, {
        actorId: null,
        actorType: 'system',
        action: 'centre_application.received',
        objectType: 'lead',
        objectRef: id,
        requestId: requestIdOf(req),
      });
      await enqueue(tx, {
        type: 'centre_application.received',
        aggregateType: 'lead',
        aggregateId: id,
        data: { leadId: id },
        requestId: requestIdOf(req),
      });
      return { id };
    });
  }

  @Endpoint(routes.staff)
  staff(@Caller() p: Principal, @Input() i: In<typeof routes.staff>) {
    return this.db.asUser(p.userId, async (tx, ctx) => {
      if (!isStaffOf(ctx, i.params.id)) throw notFound('centre');
      return this.staffList(i.params.id, p.lang);
    });
  }

  /** MKT-ACC-06: owner only. The invite SMS goes out through the outbox (worker → SmsSender). */
  @Endpoint(routes.inviteStaff)
  async invite(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.inviteStaff>,
    @Req() req: Request,
  ) {
    const centreId = i.params.id;
    const b = i.body;
    // The caller's own context decides; the write itself runs as the system (a new number needs
    // a user row), in one transaction with its audit row and outbox event.
    const ctx = await this.db.asUser(p.userId, async (_tx, c) => c);
    if (!isStaffOf(ctx, centreId)) throw notFound('centre');
    if (!isOwnerOf(ctx, centreId)) throw forbidden('Only the owner manages staff.');
    const e164 = toE164(b.phone);
    const permissions = (b.permissions ?? []).filter((x): x is StaffPermission =>
      STAFF_PERMISSIONS.includes(x),
    );
    await this.db.asSystem(async (sys) => {
      const { id: userId } = await this.accounts.userForPhone(sys, e164, langOf(req));
      const role = b.role === 'reception' ? 'centre_staff' : 'teacher';
      const existing = await sys
        .selectFrom('identity.role_assignments')
        .select('id')
        .where('user_id', '=', userId)
        .where('role', '=', role)
        .where('centre_id', '=', centreId)
        .where('status', '<>', 'revoked')
        .executeTakeFirst();
      if (existing) return;
      const teacherId =
        role === 'teacher' ? await this.accounts.ensureTeacher(sys, userId, 'invite') : null;
      const signedInBefore = await sys
        .selectFrom('identity.auth_sessions')
        .select('id')
        .where('user_id', '=', userId)
        .executeTakeFirst();
      const id = uuidv7();
      await sys
        .insertInto('identity.role_assignments')
        .values({
          id,
          user_id: userId,
          role,
          centre_id: centreId,
          teacher_id: teacherId,
          permissions: role === 'centre_staff' ? permissions : [],
          // Someone who already uses Link gets the role at once; a new number on first sign-in.
          status: signedInBefore ? 'active' : 'invited',
          invited_by: p.userId,
        })
        .execute();
      await writeAudit(sys, {
        actorId: p.userId,
        actorType: 'user',
        centreId,
        action: 'access.invited',
        objectType: 'role_assignment',
        objectRef: id,
        after: { role: b.role, permissions },
        requestId: requestIdOf(req),
      });
      await enqueue(sys, {
        type: 'staff.invited',
        aggregateType: 'role_assignment',
        aggregateId: id,
        centreId,
        data: { roleAssignmentId: id, centreId, userId },
        requestId: requestIdOf(req),
      });
    });
    return this.staffList(centreId, p.lang);
  }

  /**
   * Owner and staff rows of the centre, with names and "last active". Read as the system after the
   * caller was checked to be staff here: app_user may only read its own user row.
   */
  private async staffList(centreId: string, lang: 'ar' | 'en') {
    const t = createTranslator(lang);
    return this.db.asSystem(async (tx: Tx) => {
      const rows = await tx
        .selectFrom('identity.role_assignments as ra')
        .innerJoin('identity.users as u', 'u.id', 'ra.user_id')
        .select(['ra.user_id', 'ra.role', 'ra.status', 'ra.permissions', 'u.name', 'u.phone_last4'])
        .where('ra.centre_id', '=', centreId)
        .where('ra.status', '<>', 'revoked')
        .orderBy('ra.created_at')
        .execute();
      const seen = await lastActive(
        tx,
        rows.map((r) => r.user_id),
      );
      return rows.map((r) => {
        const role =
          r.role === 'centre_owner' ? 'owner' : r.role === 'centre_staff' ? 'reception' : 'teacher';
        return {
          user: { id: r.user_id, displayName: r.name ?? maskedPhone(r.phone_last4) },
          role: role as 'owner' | 'reception' | 'teacher',
          scope: t(`server.staff.scope.${role}`),
          permissions:
            role === 'owner'
              ? [...STAFF_PERMISSIONS]
              : (r.permissions.filter((x) =>
                  (STAFF_PERMISSIONS as readonly string[]).includes(x),
                ) as StaffPermission[]),
          lastActiveAt: seen.get(r.user_id)?.toISOString() ?? null,
          status: r.status === 'invited' ? ('invite_pending' as const) : ('active' as const),
        };
      });
    });
  }

  @Endpoint(routes.centreFeatures)
  centreFeatures(@Caller() p: Principal, @Input() i: In<typeof routes.centreFeatures>) {
    return this.db.asUser(p.userId, async (tx, ctx) => {
      if (!isStaffOf(ctx, i.params.id)) throw notFound('centre');
      return { followupExtra: await centreFlag(tx, FLAG.followupExtra, i.params.id) };
    });
  }

  /** A teacher sees Follow-up when any centre they work in (staff row or a group there) has the extra. */
  @Endpoint(routes.teacherFeatures)
  teacherFeatures(@Caller() p: Principal) {
    return this.db.asUser(p.userId, async (tx, ctx) => {
      if (!ctx.teacherId) throw forbidden('Teachers only.');
      const roles = await tx
        .selectFrom('identity.role_assignments')
        .select('centre_id')
        .where('user_id', '=', p.userId)
        .where('role', '=', 'teacher')
        .where('status', '=', 'active')
        .where('centre_id', 'is not', null)
        .execute();
      const groups = await tx
        .selectFrom('market.groups')
        .select('centre_id')
        .where('teacher_id', '=', ctx.teacherId)
        .execute();
      const ids = new Set([...roles.map((c) => c.centre_id!), ...groups.map((g) => g.centre_id)]);
      return { followupExtra: await this.anyExtra([...ids]) };
    });
  }

  /**
   * Whether any of these centres has the Follow-up extra. The caller's centres are found under RLS
   * first; the centre-scoped flag rows are visible to centre staff only, so a teacher or a parent
   * reads them through the system role, for exactly those centres.
   */
  private anyExtra(centreIds: string[]) {
    return this.db.asSystem(async (sys) => {
      for (const id of centreIds) if (await centreFlag(sys, FLAG.followupExtra, id)) return true;
      return false;
    });
  }

  /** A parent sees the updates feed when a centre where a child holds a paid seat has the extra. */
  @Endpoint(routes.myFeatures)
  myFeatures(@Caller() p: Principal) {
    return this.db.asUser(p.userId, async (tx, ctx) => {
      if (!ctx.guardianId) return { followupExtra: false };
      const rows = await tx
        .selectFrom('market.enrolments')
        .select('centre_id')
        .distinct()
        .where('guardian_id', '=', ctx.guardianId)
        .where('status', 'in', ['awaiting_teacher', 'confirmed', 'past_due', 'ended'])
        .execute();
      return { followupExtra: await this.anyExtra(rows.map((r) => r.centre_id)) };
    });
  }

  @Endpoint(routes.featureFlags)
  featureFlags(@MaybeCaller() p: Principal | null) {
    // R3.4: Ask Link is off in live mode unless a local LLM is configured; the scripted demo
    // assistant only ever runs in mock mode.
    const assistant = { 'followup.assistant': !!this.config.OLLAMA_URL };
    if (!p)
      return this.db.asAnonymous(async (tx) => ({
        flags: { ...(await flagsFor(tx, {})), ...assistant },
      }));
    return this.db.asUser(p.userId, async (tx, ctx) => ({
      flags: {
        ...(await flagsFor(tx, { centreIds: ctx.centreIds, teacherId: ctx.teacherId })),
        ...assistant,
      },
    }));
  }
}
