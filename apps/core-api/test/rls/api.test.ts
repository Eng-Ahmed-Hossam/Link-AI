// pnpm test:rls (API level) — generated from the OpenAPI document, so every new endpoint with an
// ID in its path is covered by default: the owner of centre A asks for centre B's resource and
// must get 404, never 403 or data (07 §1, 10 §2).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoId } from '../../seeds/demo';
import { type Api, Client, PHONES, startApi } from '../helpers';

type Spec = {
  paths: Record<string, Record<string, { operationId: string; security?: unknown[] }>>;
};
const spec = JSON.parse(readFileSync(join(__dirname, '..', '..', 'openapi.json'), 'utf8')) as Spec;

/**
 * For each path template: the IDs of a resource that belongs to centre B. A new path with an ID
 * that is not listed here fails the suite until someone adds it (R2 adds rooms, requests, groups…).
 */
const B_IDS: Record<string, Record<string, string>> = {
  '/v1/centres/{id}': { id: demoId('cen-nile') },
};
const templateOf = (path: string) =>
  Object.keys(B_IDS)
    .filter((t) => path.startsWith(t))
    .sort((a, b) => b.length - a.length)[0];

const withIds = Object.entries(spec.paths).flatMap(([path, ops]) =>
  Object.entries(ops)
    .filter(() => path.includes('{'))
    .map(([method, op]) => ({ path, method: method.toUpperCase(), op: op.operationId })),
);

let api: Api;
let ownerA: Client;
beforeAll(async () => {
  api = await startApi();
  ownerA = new Client(api);
  await ownerA.signIn(PHONES.owner);
});
afterAll(() => api.close());

describe('10 §2 cross-tenant API sweep (generated from openapi.json)', () => {
  it('covers every operation with an ID in its path', () => {
    const uncovered = withIds
      .filter((x) => !templateOf(x.path))
      .map((x) => `${x.method} ${x.path}`);
    expect(uncovered).toEqual([]);
    expect(withIds.length).toBeGreaterThan(0);
  });

  for (const x of withIds)
    it(`${x.method} ${x.path} (${x.op}): centre A gets 404 for centre B`, async () => {
      const ids = B_IDS[templateOf(x.path)!]!;
      const url = x.path.replace(/\{(\w+)\}/g, (_, k: string) => ids[k] ?? 'missing');
      // A body that would be valid must not matter: the tenancy check comes first.
      const r = await ownerA.call(x.method, url, x.method === 'GET' ? undefined : {});
      expect({ status: r.status, code: (r.body as { code?: string })?.code }).toEqual({
        status: 404,
        code: 'not_found',
      });
    });

  it('and centre A still reaches its own centre (the sweep is not refusing everything)', async () => {
    const r = await ownerA.call('GET', `/v1/centres/${demoId('cen-nour')}/staff`);
    expect(r.status).toBe(200);
  });
});
