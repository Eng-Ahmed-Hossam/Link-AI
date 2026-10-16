import { type PlaceResult, reverseSamplePlace, searchSamplePlaces } from '@link/mocks/places';

/**
 * `Geocoder` — the search half of the `MapProvider` adapter (docs/plan/map-provider.md): address →
 * points and point → address, for Egypt, in the caller's language. The map tiles are the web's
 * half (`NEXT_PUBLIC_MAP_PROVIDER`). Results only move the map: the stored centre point is always
 * the owner's own pin.
 *   dev       — the sample places (`@link/mocks/places`), no network: the local fake.
 *   nominatim — OpenStreetMap's Nominatim: at most 1 request a second, an identifying User-Agent,
 *               no autocomplete (search on submit only), results cached (its usage policy).
 */
export type Place = PlaceResult;

export interface Geocoder {
  readonly name: 'dev' | 'nominatim';
  search(q: string, lang: 'ar' | 'en'): Promise<Place[]>;
  reverse(lat: number, lng: number, lang: 'ar' | 'en'): Promise<Place | null>;
}

export class DevGeocoder implements Geocoder {
  readonly name = 'dev' as const;
  async search(q: string, lang: 'ar' | 'en') {
    return searchSamplePlaces(q, lang);
  }
  async reverse(lat: number, lng: number, lang: 'ar' | 'en') {
    return reverseSamplePlace(lat, lng, lang);
  }
}

interface NominatimAddress {
  road?: string;
  pedestrian?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  governorate?: string;
}
interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
}

/** Egypt, roughly (the same box as the pin check in Halls.patchCentre). */
export const inEgypt = (lat: number, lng: number) =>
  lat >= 22 && lat <= 32 && lng >= 24.5 && lng <= 37;

export class NominatimGeocoder implements Geocoder {
  readonly name = 'nominatim' as const;
  private queue: Promise<unknown> = Promise.resolve();
  private last = 0;
  private readonly cache = new Map<string, { at: number; value: unknown }>();

  constructor(
    private readonly baseUrl: string,
    private readonly userAgent: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly minIntervalMs = 1100,
    private readonly cacheMs = 7 * 24 * 3600 * 1000,
  ) {}

  /** One request at a time, at least `minIntervalMs` apart (Nominatim: max 1 per second). */
  private throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.last + this.minIntervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      return fn();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl.replace(/\/?$/, '/'));
    for (const [k, v] of Object.entries({ format: 'jsonv2', addressdetails: '1', ...params }))
      url.searchParams.set(k, v);
    const key = url.toString();
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.cacheMs) return hit.value as T;
    const value = await this.throttled(async () => {
      const r = await this.fetchFn(key, {
        headers: { 'user-agent': this.userAgent, accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`nominatim answered ${r.status}`);
      return (await r.json()) as T;
    });
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  private view(h: NominatimHit): Place {
    const a = h.address ?? {};
    return {
      label: h.display_name,
      lat: Number(h.lat),
      lng: Number(h.lon),
      governorate: a.state ?? a.governorate ?? '',
      area:
        a.suburb ??
        a.neighbourhood ??
        a.quarter ??
        a.city_district ??
        a.city ??
        a.town ??
        a.village ??
        '',
      street: a.road ?? a.pedestrian ?? '',
    };
  }

  async search(q: string, lang: 'ar' | 'en') {
    const hits = await this.get<NominatimHit[]>('search', {
      q,
      countrycodes: 'eg',
      limit: '5',
      'accept-language': lang,
    });
    return hits.map((h) => this.view(h)).filter((p) => inEgypt(p.lat, p.lng));
  }

  async reverse(lat: number, lng: number, lang: 'ar' | 'en') {
    const h = await this.get<NominatimHit & { error?: string }>('reverse', {
      lat: String(lat),
      lon: String(lng),
      zoom: '18',
      'accept-language': lang,
    });
    return h.error || !h.lat ? null : { ...this.view(h), lat, lng };
  }
}

export const GEOCODER = Symbol('GEOCODER');
