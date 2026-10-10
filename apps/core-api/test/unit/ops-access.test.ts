// MKT-OPS-08 ops access: the IP allow-list (OPS_IP_ALLOWLIST) and the permission check (OD-37).
import { describe, expect, it } from 'vitest';
import { OPS_BUNDLES, opsIpAllowed, requireOpsPermission } from '../../src/ops/access';

describe('MKT-OPS-08 OPS_IP_ALLOWLIST', () => {
  it('empty: open on a developer machine and staging, closed in production (fails safe)', () => {
    expect(opsIpAllowed('203.0.113.9', '', 'development')).toBe(true);
    expect(opsIpAllowed('203.0.113.9', '', 'staging')).toBe(true);
    expect(opsIpAllowed('203.0.113.9', '', 'production')).toBe(false);
    expect(opsIpAllowed('203.0.113.9', ' , ', 'production')).toBe(false);
  });

  it('`any` opens it on purpose', () => {
    expect(opsIpAllowed('198.51.100.1', 'any', 'production')).toBe(true);
  });

  it('addresses and CIDR ranges, IPv4 (also IPv4-mapped IPv6) and IPv6', () => {
    const list = '203.0.113.9, 10.20.0.0/16, 2001:db8::/32';
    expect(opsIpAllowed('203.0.113.9', list, 'production')).toBe(true);
    expect(opsIpAllowed('::ffff:203.0.113.9', list, 'production')).toBe(true);
    expect(opsIpAllowed('10.20.4.5', list, 'production')).toBe(true);
    expect(opsIpAllowed('10.21.0.1', list, 'production')).toBe(false);
    expect(opsIpAllowed('2001:db8::1', list, 'production')).toBe(true);
    expect(opsIpAllowed('2001:db9::1', list, 'production')).toBe(false);
    expect(opsIpAllowed(undefined, list, 'production')).toBe(false);
    expect(opsIpAllowed('not-an-ip', list, 'production')).toBe(false);
  });
});

describe('OD-37 permissions', () => {
  it('bundles are permission sets, never role names', () => {
    expect(OPS_BUNDLES.ops_agent).toEqual(['ops.verify', 'ops.moderate']);
    expect(OPS_BUNDLES.ops_finance).toEqual(['ops.finance']);
  });

  it('not ops → 403; ops without the permission → 403 naming it; `any` needs only the role', () => {
    expect(() => requireOpsPermission(null, 'any')).toThrow(/Link ops account/);
    expect(() => requireOpsPermission(['ops.verify'], 'ops.finance')).toThrow(/ops\.finance/);
    expect(() => requireOpsPermission([], 'any')).not.toThrow();
    expect(() => requireOpsPermission(['ops.finance'], 'ops.finance')).not.toThrow();
  });
});
