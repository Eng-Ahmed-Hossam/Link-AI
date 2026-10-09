// The env file for one server (deploy/.env.production, or deploy/.env.staging for pnpm prod:local),
// from deploy/.env.production.example: every name in order, fresh random secrets for the
// passwords, keys and secrets, and the given values for the rest. Values are never printed.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.mjs';

const b64 = (n) => randomBytes(n).toString('base64');
const word = (n) => randomBytes(n).toString('base64url');

/** A fresh secret for a name, or undefined when the name is not a secret. */
export function secretFor(name) {
  if (/^(FIELD_KEY|STORAGE_KEY|JWT_SIGNING_KEY)$/.test(name)) return b64(32);
  if (name === 'HMAC_KEY_LOOKUP') return word(32);
  if (/(_PASSWORD|_SECRET|PASSPHRASE)$/.test(name)) return word(24);
  if (name === 'AI_SERVICE_TOKEN') return word(32);
  return undefined;
}

/** Secret names that come from a provider account, not from us (left blank). */
const PROVIDER_KEYS = new Set([
  'PAYMENT_API_KEY',
  'SMS_API_KEY',
  'WHATSAPP_TOKEN',
  'EMAIL_API_KEY',
  'AWS_SECRET_ACCESS_KEY',
]);

/** The file text: `values` win; then a fresh secret; else blank (with the example's comment). */
export function renderEnv(values = {}) {
  const example = readFileSync(join(ROOT, 'deploy', '.env.production.example'), 'utf8');
  return example
    .split(/\r?\n/)
    .map((line) => {
      const m = /^([A-Z][A-Z0-9_]*)=\s*(#.*)?$/.exec(line);
      if (!m) return line;
      const name = m[1];
      const v = values[name] ?? (PROVIDER_KEYS.has(name) ? undefined : secretFor(name)) ?? '';
      return `${name}=${v}`;
    })
    .join('\n');
}
