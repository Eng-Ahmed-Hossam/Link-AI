import { describe, expect, it } from 'vitest';
import { uuidv7, isUuid } from '../../src/platform/ids';
import { FieldCipher, LocalKeyWrapper } from '../../src/platform/crypto';

describe('platform basics', () => {
  it('uuidv7 is a version-7 UUID, ordered by time', () => {
    const a = uuidv7(1_000);
    const b = uuidv7(2_000);
    expect(isUuid(a)).toBe(true);
    expect(a[14]).toBe('7');
    expect(a < b).toBe(true);
  });
  it('docs/10 §5: envelope encryption round-trips and never repeats a ciphertext', () => {
    const c = new FieldCipher(new LocalKeyWrapper(Buffer.alloc(32, 7).toString('base64')));
    const x = c.encrypt('+201000000003');
    expect(c.decrypt(x)).toBe('+201000000003');
    expect(c.encrypt('+201000000003').equals(x)).toBe(false);
    expect(x.toString('utf8')).not.toContain('1000000003');
  });
});
