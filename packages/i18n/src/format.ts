import type { Locale } from './locale';

const INTL: Record<Locale, string> = { ar: 'ar-EG', en: 'en-EG-u-nu-latn' };
export const TIME_ZONE = 'Africa/Cairo';

/** Money from piasters (BR-MNY): "EGP 550" / "٥٥٠ ج.م". `.00` is hidden for whole amounts. */
export function formatMoney(amountPt: number, locale: Locale): string {
  const whole = amountPt % 100 === 0;
  const n = new Intl.NumberFormat(INTL[locale], {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountPt / 100);
  return locale === 'ar' ? `${n} ج.م` : `EGP ${n}`;
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL[locale]).format(value);
}

export function formatPercent(fraction: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL[locale], { style: 'percent', maximumFractionDigits: 0 }).format(fraction);
}

export function formatDate(
  date: Date | string | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', weekday: 'short' },
): string {
  return new Intl.DateTimeFormat(INTL[locale], { timeZone: TIME_ZONE, ...options }).format(new Date(date));
}

export function formatTime(date: Date | string | number, locale: Locale): string {
  return formatDate(date, locale, { hour: 'numeric', minute: '2-digit' });
}

/** mm:ss countdown / resend timer, in the locale's digits. */
export function formatCountdown(totalSeconds: number, locale: Locale): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const nf = new Intl.NumberFormat(INTL[locale], { minimumIntegerDigits: 2 });
  const m = new Intl.NumberFormat(INTL[locale]).format(Math.floor(s / 60));
  return `${m}:${nf.format(s % 60)}`;
}

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';

/** RTL-04: inputs accept both digit sets; store Western digits. */
export function normalizeDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (c) => {
    const a = ARABIC_INDIC.indexOf(c);
    return String(a >= 0 ? a : PERSIAN.indexOf(c));
  });
}

/** Egyptian mobile number, national format 1XXXXXXXXX (10 digits). Returns null if invalid. */
export function normalizeEgyptPhone(input: string): string | null {
  let d = normalizeDigits(input).replace(/[\s()-]/g, '');
  d = d.replace(/^(\+?20|0020)/, '').replace(/^0/, '');
  return /^1[0125]\d{8}$/.test(d) ? d : null;
}
