import type { Facility, Money, RentRule, WeeklySlot } from '@link/api-client';
import { formatClock, formatMoney, formatWeekdays, type Locale } from '@link/i18n';
import type { useLocale } from '../locale';

type T = ReturnType<typeof useLocale>['t'];

/** Money from piasters ("EGP 550" / "٥٥٠ ج.م"). */
export const egp = (m: Money | number, locale: Locale) =>
  formatMoney(typeof m === 'number' ? m : m.amountPt, locale);

/** A hall's rent rule in words (same wording as the centre's C05). */
export function ruleText(rule: RentRule, t: T, locale: Locale): string {
  if (rule.basis === 'percent_of_fees')
    return t('centre.rule.percentShort', { percent: rule.percent ?? 0 });
  const amount = egp(rule.amount ?? 0, locale);
  return rule.basis === 'fixed_per_session'
    ? t('centre.rule.fixedShort', { amount })
    : t('centre.rule.perStudentShort', { amount });
}

export const facilities = (fs: Facility[], t: T) =>
  fs.map((f) => t(`centre.facility.${f}`)).join(' • ');

/** "Sun & Tue • 5:00 PM–7:00 PM". */
export const slotsText = (
  slots: Pick<WeeklySlot, 'weekday' | 'start' | 'end'>[],
  locale: Locale,
) =>
  slots.length
    ? `${formatWeekdays(
        slots.map((s) => s.weekday),
        locale,
      )} • ${formatClock(slots[0]!.start, locale)}–${formatClock(slots[0]!.end, locale)}`
    : '';
