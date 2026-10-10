import { BlockList, isIP } from 'node:net';
import type { LinkEnv } from '../platform/guard';
import type { Database } from '../platform/db';
import { Problem } from '../platform/problem';

/**
 * Ops access (MKT-OPS-08, OD-37). Ops staff sign in with a phone code like everyone (S2 brief;
 * CF-60 records the change from SSO), then every `/v1/ops/*` call must come from an allowed
 * address and the caller must hold an active `link_ops` role with the route's permission.
 */
export type OpsPermission = 'ops.verify' | 'ops.moderate' | 'ops.finance';

/** OD-37 bundles: names only, granted as their permissions (never role names). */
export const OPS_BUNDLES: Record<'ops_agent' | 'ops_finance', OpsPermission[]> = {
  ops_agent: ['ops.verify', 'ops.moderate'],
  ops_finance: ['ops.finance'],
};

const normalise = (ip: string) => ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');

/**
 * Is this address allowed to reach the ops API? `list` is OPS_IP_ALLOWLIST: comma-separated
 * addresses or CIDR ranges, or `any`. Empty: open on a developer machine and staging, closed in
 * production (so a forgotten setting fails safe).
 */
export function opsIpAllowed(ip: string | undefined, list: string, env: LinkEnv): boolean {
  const entries = list
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!entries.length) return env !== 'production';
  if (entries.includes('any')) return true;
  if (!ip) return false;
  const addr = normalise(ip);
  const family = isIP(addr);
  if (!family) return false;
  const allowed = new BlockList();
  for (const e of entries) {
    const [base = '', bits] = e.split('/');
    const f = isIP(base);
    if (!f) continue;
    const type = f === 6 ? 'ipv6' : 'ipv4';
    if (bits === undefined) allowed.addAddress(base, type);
    else allowed.addSubnet(base, Number(bits), type);
  }
  return allowed.check(addr, family === 6 ? 'ipv6' : 'ipv4');
}

/** The caller's ops permissions (null: not an ops user). Read as the system, before any work. */
export async function opsPermissionsOf(
  db: Database,
  userId: string,
): Promise<OpsPermission[] | null> {
  const rows = await db.asSystem((tx) =>
    tx
      .selectFrom('identity.role_assignments as ra')
      .innerJoin('identity.users as u', 'u.id', 'ra.user_id')
      .select('ra.permissions')
      .where('ra.user_id', '=', userId)
      .where('ra.role', '=', 'link_ops')
      .where('ra.status', '=', 'active')
      .where('u.status', '=', 'active')
      .execute(),
  );
  if (!rows.length) return null;
  const all = new Set(rows.flatMap((r) => r.permissions));
  return (['ops.verify', 'ops.moderate', 'ops.finance'] as const).filter((p) => all.has(p));
}

export function requireOpsPermission(
  have: OpsPermission[] | null,
  need: OpsPermission | 'any',
): asserts have is OpsPermission[] {
  if (!have) throw new Problem(403, 'ops_permission_required', 'This needs a Link ops account.');
  if (need !== 'any' && !have.includes(need))
    throw new Problem(
      403,
      'ops_permission_required',
      `This needs the ${need} permission (ask a Link admin for the right bundle).`,
      { permission: need },
    );
}
