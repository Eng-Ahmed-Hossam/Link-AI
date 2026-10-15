// The hosted demo API must not let an anonymous visitor reset or flip the sample world.
import { describe, expect, it } from 'vitest';
import { demoGate, demoGateFromEnv, isDemoPath } from './demo-gate';

const hosted = { secret: '', hosted: true };
const locked = { secret: 's3cret-sample', hosted: true };
const dev = { secret: '', hosted: false };

describe('demo gate', () => {
  it('finds demo paths whatever the prefix or escaping', () => {
    for (const p of [
      '/__demo/reset',
      '/__demo',
      '/x/__demo/reset',
      '/%5F%5Fdemo/reset',
      '/__DEMO/settings',
      '//__demo/story/reset',
    ])
      expect(isDemoPath(p), p).toBe(true);
    for (const p of [
      '/v1/me',
      '/v1/groups/__demonstration',
      '/demo',
      '/v1/internal/voice-results/1',
    ])
      expect(isDemoPath(p), p).toBe(false);
  });

  it('hosted without a secret: every demo route is off (404)', () => {
    expect(demoGate('/__demo/reset', null, hosted)).toBe(404);
    expect(demoGate('/__demo/state', 'anything', hosted)).toBe(404);
    expect(demoGate('/v1/me', null, hosted)).toBeNull();
  });

  it('with a secret: anonymous or wrong header gets 401, the right one passes', () => {
    expect(demoGate('/__demo/reset', null, locked)).toBe(401);
    expect(demoGate('/__demo/reset', '', locked)).toBe(401);
    expect(demoGate('/__demo/reset', 's3cret-sampl', locked)).toBe(401);
    expect(demoGate('/x/__demo/reset', null, locked)).toBe(401);
    expect(demoGate('/__demo/reset', 's3cret-sample', locked)).toBeNull();
    expect(demoGate('/v1/groups', null, locked)).toBeNull();
  });

  it('a developer machine without a secret is unchanged', () => {
    expect(demoGate('/__demo/reset', null, dev)).toBeNull();
  });

  it('reads hosting from the environment', () => {
    expect(demoGateFromEnv({}).hosted).toBe(false);
    expect(demoGateFromEnv({ RAILWAY_PROJECT_ID: 'p' }).hosted).toBe(true);
    expect(demoGateFromEnv({ CORS_ALLOWED_ORIGINS: 'https://link.example' }).hosted).toBe(true);
    expect(demoGateFromEnv({ MOCK_SERVER_PUBLIC: '1' }).hosted).toBe(true);
    expect(demoGateFromEnv({ DEMO_ROUTES_SECRET: 'x' }).secret).toBe('x');
  });
});
