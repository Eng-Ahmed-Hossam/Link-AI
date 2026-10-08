import pino from 'pino';

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
  return pino({
    level,
    base: { service },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
  });
}

export type Logger = pino.Logger;
/** Injection token: pino's logger is a plain object, not a class. */
export const LOGGER = Symbol('LOGGER');
