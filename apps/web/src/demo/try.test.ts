// Part C P0: on the real backend (the hosted staging) "Try Link" opens each role's sign-in page;
// the sample sign-in (mock sessions) exists only in the mock modes.
import { describe, expect, it, vi } from 'vitest';

describe('Try Link on the real backend', () => {
  it('sends each role to its sign-in page', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'live');
    vi.stubEnv('NEXT_PUBLIC_TEACHER_APP_URL', 'https://teacher.example');
    vi.resetModules();
    const { startTry, liveSignIn } = await import('./try');
    expect(await startTry({ role: 'owner', lang: 'ar' })).toBe('/ar/centre');
    expect(await startTry({ role: 'parent', lang: 'en' })).toBe('/en/welcome');
    expect(await startTry({ role: 'teacher', lang: 'ar' })).toBe('https://teacher.example/sign-in');
    expect(liveSignIn({ role: 'owner', lang: 'en' })).toBe('/en/centre');
    vi.unstubAllEnvs();
  });
});
