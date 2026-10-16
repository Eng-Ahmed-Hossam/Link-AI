// OD-46 / Part B: the Geocoder adapter contract. Every implementation answers the same shape, in
// the caller's language, for Egypt only. Nominatim is tested against recorded-style responses
// (no network): its usage policy (identifying User-Agent, 1 request a second, caching) included.
import { describe, expect, it } from 'vitest';
import {
  DevGeocoder,
  type Geocoder,
  NominatimGeocoder,
  inEgypt,
} from '../../src/adapters/geocoder';

const MAADI = {
  lat: '29.9602',
  lon: '31.2569',
  display_name: 'Road 9, Maadi, Cairo, Egypt',
  address: { road: 'Road 9', suburb: 'Maadi', state: 'Cairo Governorate' },
};
const PARIS = {
  lat: '48.85',
  lon: '2.35',
  display_name: 'Paris',
  address: { state: 'Île-de-France' },
};

function fakeNominatim() {
  const calls: { url: URL; ua: string | null; at: number }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, ua: new Headers(init?.headers).get('user-agent'), at: Date.now() });
    const body = url.pathname.endsWith('/search')
      ? [MAADI, PARIS]
      : url.searchParams.get('lat') === '24.1'
        ? { error: 'Unable to geocode' }
        : MAADI;
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return {
    calls,
    geocoder: new NominatimGeocoder('https://nominatim.test/', 'Link-test (sample)', fetchFn, 50),
  };
}

const contract: [string, () => Geocoder][] = [
  ['dev', () => new DevGeocoder()],
  ['nominatim', () => fakeNominatim().geocoder],
];

describe.each(contract)('Geocoder contract: %s', (_, make) => {
  it('search: places in Egypt with the structured fields', async () => {
    const items = await make().search('road 9 maadi', 'en');
    expect(items.length).toBeGreaterThan(0);
    for (const p of items) {
      expect(p).toEqual({
        label: expect.any(String),
        lat: expect.any(Number),
        lng: expect.any(Number),
        governorate: expect.any(String),
        area: expect.any(String),
        street: expect.any(String),
      });
      expect(inEgypt(p.lat, p.lng)).toBe(true);
    }
    expect(items[0]!.area).toBe('Maadi');
  });

  it('reverse: the address at a pin keeps the pin; nothing found is null', async () => {
    const g = make();
    const p = await g.reverse(29.9605, 31.257, 'en');
    expect(p).toMatchObject({ lat: 29.9605, lng: 31.257, area: 'Maadi' });
    expect(await g.reverse(24.1, 32.9, 'en')).toBeNull();
  });
});

describe('Nominatim usage policy', () => {
  it('identifies Link, asks in the page language, Egypt only, and drops results outside it', async () => {
    const { calls, geocoder } = fakeNominatim();
    const items = await geocoder.search('maadi', 'ar');
    expect(items.map((p) => p.label)).toEqual(['Road 9, Maadi, Cairo, Egypt']);
    expect(calls[0]!.ua).toBe('Link-test (sample)');
    expect(calls[0]!.url.searchParams.get('accept-language')).toBe('ar');
    expect(calls[0]!.url.searchParams.get('countrycodes')).toBe('eg');
  });

  it('one request at a time, spaced out, and cached', async () => {
    const { calls, geocoder } = fakeNominatim();
    await Promise.all([
      geocoder.search('a1', 'en'),
      geocoder.search('a2', 'en'),
      geocoder.search('a3', 'en'),
    ]);
    expect(calls).toHaveLength(3);
    for (let i = 1; i < calls.length; i++)
      expect(calls[i]!.at - calls[i - 1]!.at).toBeGreaterThanOrEqual(45);
    await geocoder.search('a1', 'en');
    expect(calls).toHaveLength(3);
  });
});
