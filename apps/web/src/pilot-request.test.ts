import { describe, expect, it } from 'vitest';
import {
  HONEYPOT,
  RateLimiter,
  isSpam,
  normalisePhone,
  pilotEmail,
  redact,
  validatePilotRequest,
} from './pilot-request';

const good = {
  centreName: 'مركز الأمل',
  contactName: 'هبة مصطفى',
  phone: '٠١٠ ١٢٣٤ ٥٦٧٨',
  area: 'مدينة نصر',
  teachers: '٨',
  consent: true,
  lang: 'ar',
};

describe('validatePilotRequest', () => {
  it('accepts a complete request, with Arabic-Indic digits', () => {
    expect(validatePilotRequest(good)).toEqual({
      ok: true,
      value: {
        centreName: 'مركز الأمل',
        contactName: 'هبة مصطفى',
        phone: '01012345678',
        area: 'مدينة نصر',
        teachers: 8,
        lang: 'ar',
      },
    });
  });
  it('names every bad field', () => {
    expect(
      validatePilotRequest({ centreName: 'x', phone: '123', teachers: 0, consent: 'yes' }),
    ).toEqual({ ok: false, errors: ['centre', 'contact', 'phone', 'area', 'teachers', 'consent'] });
  });
  it('needs the consent tick to be exactly true', () => {
    expect(validatePilotRequest({ ...good, consent: undefined })).toMatchObject({
      ok: false,
      errors: ['consent'],
    });
  });
  it('limits lengths and the number of teachers', () => {
    expect(validatePilotRequest({ ...good, centreName: 'م'.repeat(81) })).toMatchObject({
      errors: ['centre'],
    });
    expect(validatePilotRequest({ ...good, teachers: 501 })).toMatchObject({
      errors: ['teachers'],
    });
    expect(validatePilotRequest({ ...good, teachers: 2.5 })).toMatchObject({
      errors: ['teachers'],
    });
  });
  it('rejects a non-object body', () => {
    expect(validatePilotRequest(null)).toMatchObject({ ok: false });
  });
});

describe('normalisePhone', () => {
  it.each([
    ['01012345678', '01012345678'],
    ['+20 112 345 6789', '01123456789'],
    ['0020-1512345678', '01512345678'],
    ['1212345678', '01212345678'],
    ['٠١٥ ١٢٣٤ ٥٦٧٨', '01512345678'],
  ])('%s becomes %s', (raw, want) => expect(normalisePhone(raw)).toBe(want));
  it.each(['0221234567', '01312345678', '0101234567', 'abc'])('rejects %s', (raw) =>
    expect(normalisePhone(raw)).toBeNull(),
  );
});

describe('honeypot', () => {
  it('is spam only when the hidden field has text', () => {
    expect(isSpam({ ...good, [HONEYPOT]: 'http://x' })).toBe(true);
    expect(isSpam({ ...good, [HONEYPOT]: '  ' })).toBe(false);
    expect(isSpam(good)).toBe(false);
  });
});

describe('RateLimiter', () => {
  it('allows the limit per window, per key, then resets', () => {
    const r = new RateLimiter(2, 1000);
    expect(r.hit('a', 0)).toBe(true);
    expect(r.hit('a', 10)).toBe(true);
    expect(r.hit('a', 20)).toBe(false);
    expect(r.hit('b', 20)).toBe(true);
    expect(r.hit('a', 1011)).toBe(true);
  });
});

describe('redact and the email', () => {
  const v = validatePilotRequest(good);
  if (!v.ok) throw new Error('fixture');
  it('keeps no name or whole phone number', () => {
    const s = JSON.stringify(redact(v.value));
    for (const secret of ['الأمل', 'هبة', 'مصطفى', 'نصر', '01012345678', '2345'])
      expect(s).not.toContain(secret);
    expect(redact(v.value).teachers).toBe(8);
  });
  it('the email carries every field', () => {
    const m = pilotEmail(v.value, new Date('2026-10-07T09:00:00Z'));
    expect(m.subject).toBe('Pilot request: مركز الأمل (مدينة نصر)');
    for (const part of ['هبة مصطفى', '01012345678', 'Teachers / عدد المعلّمين: 8', '12:00:00'])
      expect(m.text).toContain(part);
  });
});
