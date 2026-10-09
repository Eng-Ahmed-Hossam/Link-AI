import { keyFingerprint } from './crypto';
import type { Database } from './db';

/**
 * Which keys protect the stored data (platform.data_keys): `field` encrypts phones, `lookup` makes
 * their HMACs. The seed records both fingerprints; at start-up core-api compares them with the
 * keys it was given. A mismatch means the data was written with other keys: phones cannot be
 * decrypted and sign-ins would not find their accounts. Locally: `pnpm seed:demo --reset`.
 */
export interface KeyIds {
  field: string;
  lookup: string;
}

export const currentKeyIds = (fieldKeyId: string, hmacKey: string): KeyIds => ({
  field: fieldKeyId,
  lookup: keyFingerprint(hmacKey),
});

export async function keyMismatches(db: Database, current: KeyIds) {
  const rows = await db.system.selectFrom('platform.data_keys').selectAll().execute();
  return rows
    .filter((r) => r.key_id !== current[r.purpose as keyof KeyIds])
    .map((r) => ({
      purpose: r.purpose,
      stored: r.key_id,
      current: current[r.purpose as keyof KeyIds],
    }));
}

export const KEY_MISMATCH_HELP =
  'The data in Postgres was written with other keys than the ones in .env.local ' +
  '(FIELD_KEY_LOCAL / HMAC_KEY_LOOKUP). Run `pnpm seed:demo --reset` (sample data) to start again.';
