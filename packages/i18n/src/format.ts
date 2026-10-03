import type { Locale } from './locale';

// English uses British day-month order ("Sat 3 Oct", as in the designs) and 12-hour times.
const INTL: Record<Locale, string> = { ar: 'ar-EG', en: 'en-GB-u-nu-latn' };
/** Times of day: "5:00 PM" (upper-case AM/PM as in the designs) / "٥:٠٠ م". */
const TIME_INTL: Record<Locale, string> = { ar: 'ar-EG', en: 'en-US-u-nu-latn' };
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
  return new Intl.NumberFormat(INTL[locale], { style: 'percent', maximumFractionDigits: 0 }).format(
    fraction,
  );
}

export function formatDate(
  date: Date | string | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', weekday: 'short' },
): string {
  const timeOnly =
    options.hour !== undefined && options.day === undefined && options.weekday === undefined;
  return new Intl.DateTimeFormat((timeOnly ? TIME_INTL : INTL)[locale], {
    timeZone: TIME_ZONE,
    ...options,
  }).format(new Date(date));
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

/** Short weekday name for an ISO weekday (1 = Monday … 7 = Sunday). */
export function formatWeekday(
  isoWeekday: number,
  locale: Locale,
  width: 'short' | 'long' = 'short',
): string {
  // 2026-10-05 is a Monday (UTC); add the offset.
  const d = new Date(Date.UTC(2026, 9, 4 + isoWeekday));
  return new Intl.DateTimeFormat(INTL[locale], { weekday: width, timeZone: 'UTC' }).format(d);
}

/** A Cairo wall-clock "17:00" → "5:00 PM" / "٥:٠٠ م". */
export function formatClock(hhmm: string, locale: Locale): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return new Intl.DateTimeFormat(TIME_INTL[locale], {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2026, 0, 1, h, m)));
}

/** Distance in km with one decimal, in the locale's digits ("1.2" / "١٫٢"). */
export function formatKm(km: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL[locale], { maximumFractionDigits: 1 }).format(km);
}

/** "Wed & Sat" / "الأربعاء والسبت" style list of weekdays. */
export function formatWeekdays(isoWeekdays: number[], locale: Locale): string {
  const names = [...isoWeekdays]
    .sort((a, b) => ((a + 1) % 7) - ((b + 1) % 7)) // the week starts on Saturday in Egypt: Sat, Sun, Mon…
    .map((d) => formatWeekday(d, locale));
  // Compact schedule style from the designs: "Wed & Sat" / "الأربعاء والسبت".
  return locale === 'ar' ? names.join(' و') : names.join(' & ');
}
