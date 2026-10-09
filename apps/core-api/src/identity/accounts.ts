import { sql } from 'kysely';
import { writeAudit } from '../platform/audit';
import type { Database, RlsContext, Tx } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import { enqueue } from '../platform/outbox';
import { Problem } from '../platform/problem';
import type { Phones } from './phone';

/** The roles an app sees in `Me` (link_ops never signs in by phone, MKT-OPS-08). */
const APP_ROLES = ['parent', 'teacher', 'centre_owner', 'centre_staff'] as const;
type AppRole = (typeof APP_ROLES)[number];

export interface MeView {
  id: string;
  name: string | null;
  language: 'ar' | 'en';
  roles: AppRole[];
  centreIds: string[];
  teacherId: string | null;
}

const slugify = (name: string) => {
  const latin = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${latin || 'centre'}-${uuidv7().slice(-6)}`;
};

/**
 * Accounts (MKT-ACC-01..03, MKT-ACC-06, MKT-CEN-01). Sign-in and sign-up run as the SYSTEM role
 * (a new phone needs a user row, which app_user may not insert); every change is audited in the
 * same transaction, and events go through the outbox.
 */
export class Accounts {
  constructor(
    private readonly db: Database,
    private readonly phones: Phones,
  ) {}

  /**
   * After a verified code: find or create the account, then turn pending invites and C01 join
   * requests for this (now verified) number into live roles.
   */
  async signIn(e164: string, lang: 'ar' | 'en', requestId?: string) {
    return this.db.asSystem(async (tx) => {
      const hmac = this.phones.hmac(e164);
      let user = await tx
        .selectFrom('identity.users')
        .select(['id', 'status', 'name'])
        .where('phone_hmac', '=', hmac)
        .executeTakeFirst();
      // Invited staff have a row but never signed in; they are not "new" to the app's role chooser.
      const isNewUser = !user;
      if (user && user.status !== 'active')
        throw new Problem(403, 'account_disabled', 'This account is not active. Contact Link.');
      if (!user) {
        const id = uuidv7();
        await tx
          .insertInto('identity.users')
          .values({ id, ...this.phones.columns(e164), language: lang })
          .execute();
        user = { id, status: 'active', name: null };
        await enqueue(tx, {
          type: 'user.registered',
          aggregateType: 'user',
          aggregateId: id,
          data: { userId: id },
          requestId,
        });
      }
      // Staff invites start at the first sign-in; a teacher invite waits for the teacher's own
      // accept (decided 2026-10-09: GET /v1/me/invites, POST …/accept).
      const invites = await tx
        .updateTable('identity.role_assignments')
        .set({ status: 'active' })
        .where('user_id', '=', user.id)
        .where('status', '=', 'invited')
        .where('role', '<>', 'teacher')
        .returning(['id', 'centre_id', 'role'])
        .execute();
      for (const i of invites)
        await writeAudit(tx, {
          actorId: user.id,
          actorType: 'user',
          centreId: i.centre_id,
          action: 'access.invite_accepted',
          objectType: 'role_assignment',
          objectRef: i.id,
          after: { role: i.role, status: 'active' },
          requestId,
        });
      await this.convertCentreApplications(tx, user.id, user.name, hmac, requestId);
      await writeAudit(tx, {
        actorId: user.id,
        actorType: 'user',
        action: 'access.signed_in',
        objectType: 'user',
        objectRef: user.id,
        requestId,
      });
      return { userId: user.id, isNewUser };
    });
  }

  /** C01: a join request becomes a centre (verification pending) owned by the verified number. */
  private async convertCentreApplications(
    tx: Tx,
    userId: string,
    name: string | null,
    hmac: Buffer,
    requestId?: string,
  ) {
    const leads = await tx
      .selectFrom('org.leads')
      .selectAll()
      .where('kind', '=', 'centre')
      .where('status', '=', 'new')
      .where('whatsapp_hmac', '=', hmac)
      .forUpdate()
      .execute();
    for (const lead of leads) {
      const d = lead.details as { governorate?: string; address?: string };
      const centreId = uuidv7();
      await tx
        .insertInto('org.centres')
        .values({
          id: centreId,
          owner_id: userId,
          name: lead.centre_name ?? '',
          slug: slugify(lead.centre_name ?? ''),
          governorate: d.governorate ?? null,
          area: lead.area,
          address: d.address ?? null,
          verification: 'pending',
        })
        .execute();
      await tx
        .insertInto('identity.role_assignments')
        .values({ id: uuidv7(), user_id: userId, role: 'centre_owner', centre_id: centreId })
        .execute();
      if (!name && lead.name)
        await tx
          .updateTable('identity.users')
          .set({ name: lead.name })
          .where('id', '=', userId)
          .execute();
      // Retention (06 §3 leads): once converted, the lead keeps no name or number.
      await tx
        .updateTable('org.leads')
        .set({
          status: 'converted',
          converted_centre_id: centreId,
          name: null,
          whatsapp_encrypted: null,
          whatsapp_hmac: null,
        })
        .where('id', '=', lead.id)
        .execute();
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId,
        action: 'centre.created',
        objectType: 'centre',
        objectRef: centreId,
        after: { verification: 'pending', fromLead: lead.id },
        requestId,
      });
      await enqueue(tx, {
        type: 'centre.created',
        aggregateType: 'centre',
        aggregateId: centreId,
        centreId,
        data: { centreId, ownerId: userId, verification: 'pending' },
        requestId,
      });
    }
  }

  me(userId: string): Promise<MeView> {
    return this.db.asUser(userId, (tx, ctx) => this.meIn(tx, ctx));
  }

  async meIn(tx: Tx, ctx: RlsContext): Promise<MeView> {
    const u = await tx
      .selectFrom('identity.users')
      .select(['id', 'name', 'language'])
      .where('id', '=', ctx.userId)
      .executeTakeFirstOrThrow();
    return {
      id: u.id,
      name: u.name,
      language: u.language === 'en' ? 'en' : 'ar',
      roles: APP_ROLES.filter((r) => ctx.roles.includes(r)),
      centreIds: ctx.centreIds,
      teacherId: ctx.teacherId,
    };
  }

  async updateMe(
    userId: string,
    body: { name?: string; language?: 'ar' | 'en' },
    requestId?: string,
  ) {
    return this.db.asUser(userId, async (tx, ctx) => {
      await tx
        .updateTable('identity.users')
        .set({
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.language ? { language: body.language } : {}),
        })
        .where('id', '=', userId)
        .execute();
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        action: 'account.updated',
        objectType: 'user',
        objectRef: userId,
        after: { fields: Object.keys(body) },
        requestId,
      });
      return this.meIn(tx, ctx);
    });
  }

  /** MKT-ACC-02: one account, several roles. `centre_owner` comes only from a join request (C01). */
  async addRole(userId: string, role: 'parent' | 'teacher' | 'centre_owner', requestId?: string) {
    if (role === 'centre_owner')
      throw new Problem(
        409,
        'centre_application_required',
        'Owners join through "Add my centre"; the centre is created from that request.',
      );
    await this.db.asSystem(async (tx) => {
      const has = await tx
        .selectFrom('identity.role_assignments')
        .select('id')
        .where('user_id', '=', userId)
        .where('role', '=', role)
        .where('centre_id', 'is', null)
        .where('status', '<>', 'revoked')
        .executeTakeFirst();
      if (has) return;
      let teacherId: string | null = null;
      if (role === 'parent') {
        await tx
          .insertInto('org.guardians')
          .values({ id: uuidv7(), user_id: userId })
          .onConflict((oc) => oc.column('user_id').doNothing())
          .execute();
      } else {
        teacherId = await this.ensureTeacher(tx, userId);
      }
      const id = uuidv7();
      await tx
        .insertInto('identity.role_assignments')
        .values({ id, user_id: userId, role, teacher_id: teacherId })
        .execute();
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        action: 'account.role_added',
        objectType: 'role_assignment',
        objectRef: id,
        after: { role },
        requestId,
      });
    });
    return this.me(userId);
  }

  /** The teacher profile behind a teacher role (verification not started; MKT-TCH-02 later). */
  /**
   * The teacher profile behind a teacher role. A profile created by a centre's invite starts
   * `invited` (hidden from parents until the teacher accepts and completes it); one created by the
   * teacher's own sign-up starts `incomplete` (until a name and a subject are set).
   */
  async ensureTeacher(tx: Tx, userId: string, via: 'signup' | 'invite' = 'signup') {
    const existing = await tx
      .selectFrom('org.teachers')
      .select('id')
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (existing) return existing.id;
    const u = await tx
      .selectFrom('identity.users')
      .select('name')
      .where('id', '=', userId)
      .executeTakeFirst();
    const id = uuidv7();
    await tx
      .insertInto('org.teachers')
      .values({
        id,
        user_id: userId,
        display_name: u?.name ?? '',
        slug: `teacher-${id.slice(-12)}`,
        profile_status: via === 'invite' ? 'invited' : 'incomplete',
      })
      .execute();
    return id;
  }

  /** The user row for a phone, created (unverified, no session) when an owner invites it. */
  async userForPhone(tx: Tx, e164: string, lang: 'ar' | 'en') {
    const found = await tx
      .selectFrom('identity.users')
      .select('id')
      .where('phone_hmac', '=', this.phones.hmac(e164))
      .executeTakeFirst();
    if (found) return { id: found.id, created: false };
    const id = uuidv7();
    await tx
      .insertInto('identity.users')
      .values({ id, ...this.phones.columns(e164), language: lang })
      .execute();
    return { id, created: true };
  }
}

/** Latest sign-in or refresh per user, for "last active" (A16). */
export async function lastActive(tx: Tx, userIds: string[]) {
  if (!userIds.length) return new Map<string, Date>();
  const rows = await tx
    .selectFrom('identity.auth_sessions')
    .select(['user_id', sql<Date>`max(coalesce(last_used_at, created_at))`.as('at')])
    .where('user_id', 'in', userIds)
    .groupBy('user_id')
    .execute();
  return new Map(rows.map((r) => [r.user_id, new Date(r.at)]));
}
