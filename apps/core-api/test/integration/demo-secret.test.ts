// Demo routes on a hosted server (Railway staging): an anonymous reset is refused and changes nothing.
import { afterAll, beforeAll, expect, it } from 'vitest';
import { startApi } from '../helpers';

let api: Awaited<ReturnType<typeof startApi>>;
beforeAll(async () => {
  process.env.DEMO_ROUTES_SECRET = 'sample-demo-secret';
  api = await startApi();
});
afterAll(async () => {
  delete process.env.DEMO_ROUTES_SECRET;
  await api.close();
});

const post = (path: string, headers: Record<string, string> = {}) =>
  fetch(`${api.base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: '{}',
  });

it('anonymous /__demo calls get 401 demo_secret_required', async () => {
  for (const r of [await post('/__demo/story/reset'), await fetch(`${api.base}/__demo/story`)]) {
    expect(r.status).toBe(401);
    expect(((await r.json()) as { code: string }).code).toBe('demo_secret_required');
  }
  expect((await post('/__demo/story/reset', { 'x-link-demo-secret': 'wrong' })).status).toBe(401);
});

it('the right secret header works', async () => {
  const r = await fetch(`${api.base}/__demo/story`, {
    headers: { 'x-link-demo-secret': 'sample-demo-secret' },
  });
  expect(r.status).toBe(200);
});
