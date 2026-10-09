// Optional error tracking (ship job S1): off without SENTRY_DSN; with it, an error log becomes one
// envelope with the message and stack and a few safe fields — never personal data or tokens.
import { describe, expect, it } from 'vitest';
import { errorReporter, parseDsn } from '../../src/platform/errors';

describe('error tracking', () => {
  it('is off without a DSN, or with a malformed one', () => {
    expect(errorReporter('api', {})).toBeNull();
    expect(errorReporter('api', { SENTRY_DSN: 'not a url' })).toBeNull();
    expect(parseDsn('https://abc123@o1.ingest.example.io/42')).toEqual({
      url: 'https://o1.ingest.example.io/api/42/envelope/',
      key: 'abc123',
    });
  });

  it('sends one envelope with the message, the error and safe fields only', async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    const report = errorReporter(
      'core-api:worker',
      { SENTRY_DSN: 'https://abc123@o1.ingest.example.io/42', LINK_ENV: 'production' },
      async (url, init) => void sent.push({ url, init }),
    )!;
    report(
      {
        err: new Error('boom (sample)'),
        job: 'funds-release',
        phone: '+201000000001',
        body: { name: 'Mariam' },
        token: 'secret-token',
      },
      'job failed',
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe('https://o1.ingest.example.io/api/42/envelope/');
    const text = String(sent[0]!.init.body);
    const event = JSON.parse(text.split('\n')[2]!);
    expect(event).toMatchObject({ message: 'job failed', environment: 'production' });
    expect(event.exception.values[0].value).toBe('boom (sample)');
    expect(event.extra.job).toBe('funds-release');
    for (const leak of ['+201000000001', 'Mariam', 'secret-token'])
      expect(text).not.toContain(leak);
  });
});
