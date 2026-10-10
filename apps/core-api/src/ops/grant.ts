import { sql } from 'kysely';
import { type Phones, toE164 } from '../identity/phone';
import { writeAudit } from '../platform/audit';
import type { Database } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import { enqueue } from '../platform/outbox';
import { OPS_BUNDLES, type OpsPermission } from './access';

/**
 * Who may use the ops console (MKT-OPS-08, OD-37): a server command, not an API, so the first ops
 * user can be created on a fresh server and nobody can grant ops access from the web.
 *   node dist/main.mjs ops-access list
 *   node dist/main.mjs ops-access grant <phone> agent|finance|agent+finance ["Name"]
 *   node dist/main.mjs ops-access revoke <phone>
 * The person then signs in at ops.<domain> with a phone code (CF-56). Every change is audited.
 */
const HOW = 'Server command: ops-access';

export function bundlePermissions(bundle: string): OpsPermission[] {
  const parts = bundle.split('+').map((b) => b.trim());
  const perms = new Set<OpsPermission>();
  for (const p of parts) {
    const key = p === 'agent' ? 'ops_agent' : p === 'finance' ? 'ops_finance' : null;
    if (!key) throw new Error(`Unknown bundle "${p}": use agent, finance or agent+finance.`);
    for (const x of OPS_BUNDLES[key]) perms.add(x);
  }
  return [...perms];
}

export async function listOpsAccess(db: Database) {
  return db.asSystem(
    async (tx) =>
      (
        await sql<{ name: string | null; phone_last4: string; permissions: string[] }>`
        SELECT u.name, u.phone_last4, ra.permissions FROM identity.role_assignments ra
        JOIN identity.users u ON u.id = ra.user_id
        WHERE ra.role = 'link_ops' AND ra.status = 'active' ORDER BY ra.created_at`.execute(tx)
      ).rows,
  );
}

export async function grantOpsAccess(
  db: Database,
  phones: Phones,
  phone: string,
  bundle: string,
  name?: string,
) {
  const permissions = bundlePermissions(bundle);
  const e164 = toE164(phone);
  return db.asSystem(async (tx) => {
    let user = await tx
      .selectFrom('identity.users')
      .select(['id', 'name'])
      .where('phone_hmac', '=', phones.hmac(e164))
      .executeTakeFirst();
    if (!user) {
      const id = uuidv7();
      await tx
        .insertInto('identity.users')
        .values({ id, ...phones.columns(e164), name: name ?? null, language: 'ar' })
        .execute();
      await enqueue(tx, {
        type: 'user.registered',
        aggregateType: 'user',
        aggregateId: id,
        data: { userId: id },
      });
      user = { id, name: name ?? null };
    } else if (name && !user.name)
      await tx.updateTable('identity.users').set({ name }).where('id', '=', user.id).execute();
    const live = await tx
      .selectFrom('identity.role_assignments')
      .select(['id', 'permissions'])
      .where('user_id', '=', user.id)
      .where('role', '=', 'link_ops')
      .where('status', '<>', 'revoked')
      .executeTakeFirst();
    const id = live?.id ?? uuidv7();
    if (live)
      await tx
        .updateTable('identity.role_assignments')
        .set({ permissions, status: 'active' })
        .where('id', '=', id)
        .execute();
    else
      await tx
        .insertInto('identity.role_assignments')
        .values({ id, user_id: user.id, role: 'link_ops', permissions, status: 'active' })
        .execute();
    await writeAudit(tx, {
      actorId: null,
      actorType: 'system',
      action: 'access.ops_granted',
      objectType: 'role_assignment',
      objectRef: id,
      before: live ? { permissions: live.permissions } : null,
      after: { role: 'link_ops', permissions },
      reason: HOW,
    });
    return { userId: user.id, permissions, last4: e164.slice(-4) };
  });
}

export async function revokeOpsAccess(db: Database, phones: Phones, phone: string) {
  const e164 = toE164(phone);
  return db.asSystem(async (tx) => {
    const rows = await tx
      .updateTable('identity.role_assignments as ra')
      .set({ status: 'revoked', revoked_at: new Date() })
      .from('identity.users as u')
      .whereRef('u.id', '=', 'ra.user_id')
      .where('u.phone_hmac', '=', phones.hmac(e164))
      .where('ra.role', '=', 'link_ops')
      .where('ra.status', '<>', 'revoked')
      .returning(['ra.id'])
      .execute();
    for (const r of rows)
      await writeAudit(tx, {
        actorId: null,
        actorType: 'system',
        action: 'access.ops_revoked',
        objectType: 'role_assignment',
        objectRef: r.id,
        after: { status: 'revoked' },
        reason: HOW,
      });
    // Their sessions end now, not when the access token expires.
    await tx
      .updateTable('identity.auth_sessions as s')
      .set({ revoked_at: new Date() })
      .from('identity.users as u')
      .whereRef('u.id', '=', 's.user_id')
      .where('u.phone_hmac', '=', phones.hmac(e164))
      .where('s.revoked_at', 'is', null)
      .execute();
    return { revoked: rows.length };
  });
}
