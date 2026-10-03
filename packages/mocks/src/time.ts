/** Cairo-time helpers for fixtures (schedules are stored in UTC and shown in Africa/Cairo, 06 §0). */
const TZ = 'Africa/Cairo';

/** Today's date in Cairo as YYYY-MM-DD. */
export function cairoToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function offsetMinutes(at: Date): number {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+02:00';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 120;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** A Cairo wall-clock date + time → UTC ISO string (handles Egypt's summer time). */
export function cairoToUtc(date: string, time: string): string {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off = offsetMinutes(new Date(guess));
  return new Date(guess - off * 60_000).toISOString();
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a YYYY-MM-DD date. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Same day next month (BR-PMT-04), clamped to the month's last day. */
export function addMonth(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10);
}
