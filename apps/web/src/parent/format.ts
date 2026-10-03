import type {
  EnrolmentStatus,
  GroupSummary,
  Money,
  RefundStatus,
  SeatState,
  SessionSeats,
} from '@link/api-client';
import {
  formatClock,
  formatDate,
  formatMoney,
  formatWeekdays,
  type Locale,
  type Translate,
} from '@link/i18n';
import type { StatusTone } from '@link/ui';

export const money = (m: Money | null | undefined, locale: Locale) =>
  m ? formatMoney(m.amountPt, locale) : '';

/** "Wed & Sat • 5:00–6:30 PM" */
export const scheduleLabel = (
  g: Pick<GroupSummary, 'weekdays' | 'startTime' | 'endTime'>,
  locale: Locale,
) =>
  `${formatWeekdays(g.weekdays, locale)} • ${formatClock(g.startTime, locale)}–${formatClock(g.endTime, locale)}`;

/** "Sat 3 Oct" */
export const shortDate = (iso: string, locale: Locale) =>
  formatDate(iso, locale, { weekday: 'short', day: 'numeric', month: 'short' });
/** "Saturday 3 October at 5:00 PM" pieces */
export const longDate = (iso: string, locale: Locale) =>
  formatDate(iso, locale, { weekday: 'long', day: 'numeric', month: 'long' });
export const time = (iso: string, locale: Locale) =>
  formatDate(iso, locale, { hour: 'numeric', minute: '2-digit' });

/**
 * Seats are counted per session (BR-ENR-02, MKT-GRP-03 AC4): the label names the tightest
 * upcoming session, e.g. "2 seats left on Sat 3 Oct".
 */
export function seatsInfo(
  g: GroupSummary,
  t: Translate,
  locale: Locale,
): { tone: StatusTone; label: string; state: SeatState } {
  const next = g.upcomingSessions.slice(0, 4);
  const first = next[0];
  if (!first || first.seatsLeft <= 0)
    return { tone: 'neutral', label: t('parent.seats.fullWaitlist'), state: 'waitlist' };
  const tight = next
    .filter((s) => s.seatsLeft > 0)
    .reduce<SessionSeats>((a, b) => (b.seatsLeft < a.seatsLeft ? b : a), first);
  if (tight.seatsLeft <= 3)
    return {
      tone: 'warning',
      label: t('parent.seats.leftOn', {
        count: tight.seatsLeft,
        date: shortDate(tight.startsAt, locale),
      }),
      state: 'open',
    };
  return { tone: 'success', label: t('parent.seats.open'), state: 'open' };
}

export const seatStateTone: Record<SeatState, StatusTone> = {
  open: 'success',
  waitlist: 'warning',
};

/** The 8 enrolment states (08 §4) — each with its own label; refund status is separate. */
export const enrolmentTone: Record<EnrolmentStatus, StatusTone> = {
  pending_payment: 'warning',
  awaiting_teacher: 'info',
  confirmed: 'success',
  past_due: 'error',
  cancelled: 'neutral',
  expired: 'neutral',
  declined: 'neutral',
  ended: 'neutral',
};

export const refundTone: Record<RefundStatus, StatusTone> = {
  requested: 'info',
  approved: 'info',
  processing: 'info',
  succeeded: 'success',
  failed: 'error',
  rejected: 'neutral',
};

/** Builds an .ics file for "Add to calendar" (no provider needed). */
export function icsFor(event: {
  uid: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
}) {
  const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/[,;\\]/g, (c) => `\\${c}`);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Link//Parent PWA//EN',
    'BEGIN:VEVENT',
    `UID:${event.uid}@link.local`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(event.startsAt)}`,
    `DTEND:${stamp(event.endsAt)}`,
    `SUMMARY:${esc(event.title)}`,
    `LOCATION:${esc(event.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
