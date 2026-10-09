import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * Field-level protection for personal data (docs/10 §5).
 *
 * - `lookupHmac`: HMAC-SHA256 with `HMAC_KEY_LOOKUP`, so a phone can be found without decrypting.
 * - `FieldCipher`: envelope encryption. Every value gets its own AES-256-GCM data key; the data key
 *   is wrapped by the key-encryption key (locally `FIELD_KEY_LOCAL`, elsewhere KMS `KMS_KEY_FIELDS`).
 *
 * Stored layout (v2): 0x02 | key-ID length (1) | key ID (ASCII) | wrapped DEK (iv 12 · tag 16 ·
 * key 32) | iv 12 | tag 16 | ciphertext. The key ID says which key-encryption key wrapped it, so a
 * changed key is reported as such instead of failing as corrupt data. (v1 had no key ID.)
 */
const VERSION = 0x02;
const V1 = 0x01;
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

/** A short, non-secret fingerprint of a key: the first 12 hex digits of its SHA-256. */
export const keyFingerprint = (key: Buffer | string) =>
  createHash('sha256').update(key).digest('hex').slice(0, 12);

export class KeyMismatchError extends Error {
  constructor(
    readonly storedKeyId: string,
    readonly currentKeyId: string,
  ) {
    super(
      `Data encrypted with key ${storedKeyId}, but the current key is ${currentKeyId}. ` +
        'Locally: the key in .env.local changed — run pnpm seed:demo --reset.',
    );
  }
}

export interface KeyWrapper {
  /** Fingerprint of the key-encryption key. */
  readonly id: string;
  wrap(dataKey: Buffer): Buffer;
  unwrap(wrapped: Buffer): Buffer;
}

/** Local key-encryption key from `.env.local` (aws-local keeps KMS keys in memory only). */
export class LocalKeyWrapper implements KeyWrapper {
  private readonly kek: Buffer;
  readonly id: string;
  constructor(base64Key: string) {
    this.kek = Buffer.from(base64Key, 'base64').subarray(0, KEY);
    if (this.kek.length !== KEY) throw new Error('FIELD_KEY_LOCAL must be 32 bytes');
    this.id = keyFingerprint(this.kek);
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

  /** The fingerprint of the key that encrypts new values. */
  get keyId() {
    return this.keys.id;
  }

  encrypt(plain: string): Buffer {
    const dek = randomBytes(KEY);
    const id = Buffer.from(this.keys.id, 'ascii');
    try {
      return Buffer.concat([
        Buffer.from([VERSION, id.length]),
        id,
        this.keys.wrap(dek),
        seal(dek, Buffer.from(plain, 'utf8')),
      ]);
    } finally {
      dek.fill(0);
    }
  }

  /** The key ID a stored value was written with (null for v1 values, which carry none). */
  static keyIdOf(stored: Buffer): string | null {
    if (stored[0] !== VERSION) return null;
    return stored.subarray(2, 2 + stored[1]!).toString('ascii');
  }

  decrypt(stored: Buffer): string {
    let body: Buffer;
    if (stored[0] === VERSION) {
      const storedId = FieldCipher.keyIdOf(stored)!;
      if (storedId !== this.keys.id) throw new KeyMismatchError(storedId, this.keys.id);
      body = stored.subarray(2 + stored[1]!);
    } else if (stored[0] === V1) body = stored.subarray(1);
    else throw new Error('unknown field-encryption version');
    const dek = this.keys.unwrap(body.subarray(0, WRAPPED));
    try {
      return open(dek, body.subarray(WRAPPED)).toString('utf8');
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
