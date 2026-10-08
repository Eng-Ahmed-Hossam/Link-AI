'use client';

import type { Facility, Money, RentRule } from '@link/api-client';
import { formatClock, formatMoney, formatWeekday, formatWeekdays, type Locale } from '@link/i18n';
import type { useI18n } from '../../i18n-client';

type T = ReturnType<typeof useI18n>['t'];

/** Money from piasters ("EGP 550" / "٥٥٠ ج.م"). */
export const egp = (m: Money | number, locale: Locale) =>
  formatMoney(typeof m === 'number' ? m : m.amountPt, locale);

/** A hall's rent rule in words: "EGP 250 / session", "EGP 15 / student / session", "20% of fees". */
export function ruleText(rule: RentRule, t: T, locale: Locale): string {
  if (rule.basis === 'percent_of_fees')
    return t('centre.rule.percentShort', { percent: rule.percent ?? 0 });
  const amount = egp(rule.amount ?? 0, locale);
  return rule.basis === 'fixed_per_session'
    ? t('centre.rule.fixedShort', { amount })
    : t('centre.rule.perStudentShort', { amount });
}

export const FACILITIES: Facility[] = [
  'ac',
  'smart_board',
  'whiteboard',
  'projector',
  'sound',
  'fan',
  'wheelchair',
];
export const facilityLabel = (f: Facility, t: T) => t(`centre.facility.${f}`);

/** "Sat 5:00 PM" / "Sun & Tue • 5:00–7:00 PM". */
export const slotText = (weekday: number, start: string, locale: Locale) =>
  `${formatWeekday(weekday, locale)} ${formatClock(start, locale)}`;
export const daysTimes = (weekdays: number[], start: string, end: string, locale: Locale) =>
  `${formatWeekdays(weekdays, locale)} • ${formatClock(start, locale)}–${formatClock(end, locale)}`;

/** Initials for an avatar from a display name without a title ("أ. سلمى فتحي" → "سف"). */
export const initials = (name: string) =>
  name
    .replace(/^(Mr|Ms|Mrs|Dr|أ\.|د\.)\s+/u, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('');
