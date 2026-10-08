import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * Field-level protection for personal data (docs/10 §5).
 *
 * - `lookupHmac`: HMAC-SHA256 with `HMAC_KEY_LOOKUP`, so a phone can be found without decrypting.
 * - `FieldCipher`: envelope encryption. Every value gets its own AES-256-GCM data key; the data key
 *   is wrapped by the key-encryption key (locally `FIELD_KEY_LOCAL`, elsewhere KMS `KMS_KEY_FIELDS`).
 *
 * Stored layout (v1): 0x01 | wrapped DEK (iv 12 · tag 16 · key 32) | iv 12 | tag 16 | ciphertext.
 */
const VERSION = 0x01;
const IV = 12;
const TAG = 16;
const KEY = 32;
const WRAPPED = IV + TAG + KEY;

function seal(key: Buffer, plain: Buffer) {
  const iv = randomBytes(IV);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

function open(key: Buffer, sealed: Buffer) {
  const d = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, IV));
  d.setAuthTag(sealed.subarray(IV, IV + TAG));
  return Buffer.concat([d.update(sealed.subarray(IV + TAG)), d.final()]);
}

export interface KeyWrapper {
  wrap(dataKey: Buffer): Buffer;
  unwrap(wrapped: Buffer): Buffer;
}

/** Local key-encryption key from `.env.local` (aws-local keeps KMS keys in memory only). */
export class LocalKeyWrapper implements KeyWrapper {
  private readonly kek: Buffer;
  constructor(base64Key: string) {
    this.kek = Buffer.from(base64Key, 'base64').subarray(0, KEY);
    if (this.kek.length !== KEY) throw new Error('FIELD_KEY_LOCAL must be 32 bytes');
  }
  wrap(dataKey: Buffer) {
    return seal(this.kek, dataKey);
  }
  unwrap(wrapped: Buffer) {
    return open(this.kek, wrapped);
  }
}

export class FieldCipher {
  constructor(private readonly keys: KeyWrapper) {}

  encrypt(plain: string): Buffer {
    const dek = randomBytes(KEY);
    try {
      return Buffer.concat([
        Buffer.from([VERSION]),
        this.keys.wrap(dek),
        seal(dek, Buffer.from(plain, 'utf8')),
      ]);
    } finally {
      dek.fill(0);
    }
  }

  decrypt(stored: Buffer): string {
    if (stored[0] !== VERSION) throw new Error('unknown field-encryption version');
    const dek = this.keys.unwrap(stored.subarray(1, 1 + WRAPPED));
    try {
      return open(dek, stored.subarray(1 + WRAPPED)).toString('utf8');
    } finally {
      dek.fill(0);
    }
  }
}

export const lookupHmac = (key: string, value: string) =>
  createHmac('sha256', key).update(value, 'utf8').digest();

export const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest();

/** URL-safe random token (refresh tokens, opaque IDs). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
