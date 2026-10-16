import { Controller, Inject } from '@nestjs/common';
import type { Geocoder } from '../adapters/geocoder';
import { routes } from '../contract/routes';
import { Caller, CallerLang, Endpoint, type In, Input, type Principal } from '../platform/http';
import { Problem } from '../platform/problem';
import { hit, Redises } from '../platform/redis';

/**
 * Address search and reverse lookup for the C02 location picker (docs/plan/map-provider.md).
 * Signed-in users only, rate-limited per user, so the provider's quota (Nominatim: 1 a second)
 * can't be spent by strangers. Nothing is stored: the centre's point is the owner's own pin.
 */
export const GEO_LIMITS = { perUserHour: 60 };

export class Geo {
  constructor(
    private readonly geocoder: Geocoder,
    private readonly redis: Redises,
  ) {}

  private async limit(userId: string) {
    const { count, retryAfter } = await hit(
      this.redis.state,
      this.redis.key('rl', 'geo', 'u', userId),
      3600,
    );
    if (count > GEO_LIMITS.perUserHour)
      throw new Problem(429, 'rate_limited', 'Too many address searches. Try again later.', {
        retryAfterSeconds: retryAfter,
      });
  }

  private async call<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch {
      throw new Problem(503, 'geocoder_unavailable', 'Address search is not responding.');
    }
  }

  async search(userId: string, q: string, lang: 'ar' | 'en') {
    await this.limit(userId);
    return { items: await this.call(() => this.geocoder.search(q, lang)) };
  }

  async reverse(userId: string, lat: number, lng: number, lang: 'ar' | 'en') {
    await this.limit(userId);
    return { place: await this.call(() => this.geocoder.reverse(lat, lng, lang)) };
  }
}

@Controller()
export class GeoController {
  constructor(@Inject(Geo) private readonly geo: Geo) {}

  @Endpoint(routes.geoSearch)
  search(
    @Caller() p: Principal,
    @CallerLang() lang: 'ar' | 'en',
    @Input() i: In<typeof routes.geoSearch>,
  ) {
    return this.geo.search(p.userId, i.query.q, lang);
  }

  @Endpoint(routes.geoReverse)
  reverse(
    @Caller() p: Principal,
    @CallerLang() lang: 'ar' | 'en',
    @Input() i: In<typeof routes.geoReverse>,
  ) {
    return this.geo.reverse(p.userId, i.query.lat, i.query.lng, lang);
  }
}
