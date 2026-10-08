import { normalizeEgyptPhone } from '@link/i18n';
import { FieldCipher, lookupHmac } from '../platform/crypto';
import { Problem } from '../platform/problem';

/**
 * Phones (docs/06 §1, docs/10 §5): normalised to E.164, then stored as an HMAC (lookup), an
 * envelope-encrypted copy (to send an SMS) and the last 4 digits (masked display). The same
 * normaliser as the apps, so "010…", "+20 10…" and Arabic-Indic digits all match one account.
 */
export function toE164(input: string): string {
  const national = normalizeEgyptPhone(input ?? '');
  if (!national) throw new Problem(422, 'invalid_phone', 'Enter an Egyptian mobile number.');
  return `+20${national}`;
}

export class Phones {
  constructor(
    private readonly hmacKey: string,
    private readonly cipher: FieldCipher,
  ) {}

  hmac(e164: string) {
    return lookupHmac(this.hmacKey, e164);
  }

  /** Columns for a new row: `{ phone_hmac, phone_enc, phone_last4 }`. */
  columns(e164: string) {
    return {
      phone_hmac: this.hmac(e164),
      phone_enc: this.cipher.encrypt(e164),
      phone_last4: e164.slice(-4),
    };
  }

  decrypt(enc: Buffer) {
    return this.cipher.decrypt(enc);
  }

  /** A short opaque key for Redis (never the phone itself). */
  redisKey(e164: string) {
    return this.hmac(e164).subarray(0, 16).toString('hex');
  }
}

/** "•••• 0003" — the only form a phone is shown in outside its owner's own screens. */
export const maskedPhone = (last4: string) => `•••• ${last4}`;
