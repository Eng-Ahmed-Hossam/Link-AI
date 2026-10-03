import { describe, expect, it } from 'vitest';
import {
  createTranslator,
  formatMoney,
  normalizeDigits,
  normalizeEgyptPhone,
  formatCountdown,
} from './index';

describe('RTL-06 money (BR-MNY piasters)', () => {
  it('formats whole amounts without .00', () => {
    expect(formatMoney(55000, 'en')).toBe('EGP 550');
    expect(formatMoney(55000, 'ar')).toBe('٥٥٠ ج.م');
  });
  it('keeps piasters when not whole', () => {
    expect(formatMoney(55050, 'en')).toBe('EGP 550.50');
  });
});

describe('RTL-08 plurals', () => {
  const ar = createTranslator('ar');
  const en = createTranslator('en');
  it('uses all six Arabic forms', () => {
    // CF-28: zero seats means "Waitlist only", never "No seats".
    expect(ar('common.seatsLeft', { count: 0 })).toBe('قائمة انتظار فقط');
    expect(ar('common.seatsLeft', { count: 1 })).toContain('مكان واحد');
    expect(ar('common.seatsLeft', { count: 2 })).toContain('مكانان');
    expect(ar('common.seatsLeft', { count: 3 })).toContain('أماكن');
    expect(ar('common.seatsLeft', { count: 11 })).toContain('مكانًا');
    expect(ar('common.seatsLeft', { count: 100 })).toContain('مكان');
  });
  it('English one/other', () => {
    expect(en('common.seatsLeft', { count: 1 })).toBe('1 seat left');
    expect(en('common.seatsLeft', { count: 2 })).toBe('2 seats left');
  });
});

describe('RTL-04 digits', () => {
  it('normalises Arabic-Indic input', () => {
    expect(normalizeDigits('٠١٠١٢٣٤٥٦٧٨')).toBe('01012345678');
    expect(normalizeEgyptPhone('+20 101 234 5678')).toBe('1012345678');
    expect(normalizeEgyptPhone('٠١٠١٢٣٤٥٦٧٨')).toBe('1012345678');
    expect(normalizeEgyptPhone('12345')).toBeNull();
  });
  it('shows the OTP resend timer in locale digits', () => {
    expect(formatCountdown(60, 'en')).toBe('1:00');
    expect(formatCountdown(60, 'ar')).toBe('١:٠٠');
  });
});
