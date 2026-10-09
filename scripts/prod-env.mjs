// pnpm prod:env [--domain link.example.com] — write deploy/.env.production for one server: every
// setting from deploy/.env.production.example, fresh random secrets for the passwords and keys,
// LINK_ENV=production, APP_ENV=prod, PAYMENT_PROVIDER=none, WHATSAPP_PROVIDER=manual. You then fill
// in the domain (if not given), the contact email and the provider accounts
// (docs/go-live-switches.md). It never overwrites an existing file. Values are never printed.
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail } from './lib/env.mjs';
import { renderEnv } from './lib/prod-env.mjs';

const file = join(ROOT, 'deploy', '.env.production');
if (existsSync(file))
  fail('deploy/.env.production exists; it holds the keys your data depends on. Edit it by hand.');
const i = process.argv.indexOf('--domain');
const domain = i > 0 ? process.argv[i + 1] : '';
writeFileSync(
  file,
  renderEnv({
    LINK_ENV: 'production',
    APP_ENV: 'prod',
    LOG_LEVEL: 'info',
    LINK_DOMAIN: domain,
    JWT_ISSUER: domain ? `https://${domain}` : '',
    JWT_AUDIENCE: 'link',
    JWT_SIGNING_KEY_ID: `prod-${new Date().toISOString().slice(0, 7)}`,
    NEXT_PUBLIC_SITE_URL: domain ? `https://${domain}` : '',
    PAYMENT_PROVIDER: 'none',
    WHATSAPP_PROVIDER: 'manual',
    STORAGE_PROVIDER: 'file',
    BACKUP_DIR: '/var/backups/link',
    BACKUP_KEEP: '14',
  }),
  { mode: 0o600 },
);
console.log(`✓ Wrote deploy/.env.production (fresh secrets; readable by you only).
  Keep a copy of FIELD_KEY, HMAC_KEY_LOOKUP, STORAGE_KEY and BACKUP_PASSPHRASE apart from the
  server: without them the data and the backups cannot be read.
  Still to fill in: ${domain ? '' : 'LINK_DOMAIN, JWT_ISSUER, NEXT_PUBLIC_SITE_URL, '}ACME_EMAIL, NEXT_PUBLIC_CONTACT_EMAIL, and the provider
  settings (SMS_PROVIDER and keys are required for sign-in) — docs/go-live-switches.md.`);
