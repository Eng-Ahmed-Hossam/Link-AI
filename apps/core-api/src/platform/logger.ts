import pino from 'pino';
import { errorReporter } from './errors';

/**
 * JSON logs (docs/10 §7: no personal data in logs). Redaction happens here, at the source: tokens,
 * cookies, phones, codes and names never reach the output, whatever a caller passes in.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.phone',
  '*.phoneE164',
  '*.code',
  '*.otp',
  '*.name',
  '*.displayName',
  '*.ownerName',
  '*.accessToken',
  '*.refreshToken',
  '*.token',
  '*.password',
];

export function createLogger(level: string, service: string) {
  // Error-level lines also go to error tracking when SENTRY_DSN is set (no-op otherwise).
  const report = errorReporter(service);
  return pino({
    level,
    base: { service },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    ...(report
      ? {
          hooks: {
            logMethod(args: unknown[], method: (...a: unknown[]) => void, lvl: number) {
              if (lvl >= 50) {
                const [a, b] = args;
                if (typeof a === 'string') report({}, a);
                else report((a ?? {}) as Record<string, unknown>, typeof b === 'string' ? b : '');
              }
              method.apply(this, args);
            },
          },
        }
      : {}),
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
  });
}

export type Logger = pino.Logger;
/** Injection token: pino's logger is a plain object, not a class. */
export const LOGGER = Symbol('LOGGER');
