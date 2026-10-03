import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { searchTeachers, setApiBaseUrl } from '@link/api-client';
import { handlers } from './handlers';

const server = setupServer(...handlers);
beforeAll(() => {
  setApiBaseUrl('http://localhost');
  server.listen();
});
afterAll(() => server.close());

describe('MKT-DSC-01 GET /v1/search/teachers (mock)', () => {
  it('defaults to a 5 km radius and returns money as piasters', async () => {
    const page = await searchTeachers();
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((t) => (t.distanceKm ?? 0) <= 5)).toBe(true);
    expect(Number.isInteger(page.items[0]!.fromSessionFee!.amountPt)).toBe(true);
  });
  it('narrows with radiusKm', async () => {
    const page = await searchTeachers({ radiusKm: 2 });
    expect(page.items.map((t) => t.id)).toEqual(['t_1']);
  });
});
