import { formatDate, formatNumber, formatTime, type Locale } from '@link/i18n';

/** A Cairo calendar date (YYYY-MM-DD) as noon UTC, so formatting in Africa/Cairo keeps the day. */
const asDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`);

/** "Wednesday, 30 September" / "الأربعاء، ٣٠ سبتمبر". */
export const longDay = (ymd: string, locale: Locale) =>
  formatDate(asDate(ymd), locale, { weekday: 'long', day: 'numeric', month: 'long' });

/** "30 September" / "٣٠ سبتمبر". */
export const dayMonth = (ymd: string, locale: Locale) =>
  formatDate(asDate(ymd), locale, { day: 'numeric', month: 'long' });

/** "5:00–6:30 PM". */
export const timeRange = (startsAt: string, endsAt: string, locale: Locale) =>
  `${formatTime(startsAt, locale)}–${formatTime(endsAt, locale)}`;

export const num = (n: number, locale: Locale) => formatNumber(n, locale);

export const todayYmd = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

/** RTL-05: wrap text of the other direction (an Arabic name in English copy) in a Unicode isolate. */
const FSI = String.fromCodePoint(0x2068); // first strong isolate
const PDI = String.fromCodePoint(0x2069); // pop directional isolate
export const isolate = (text: string) => `${FSI}${text}${PDI}`;
