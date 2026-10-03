'use client';

import { useEffect, useState } from 'react';

/** Seconds left until `until` (ISO), ticking every second. Never negative. */
export function useSecondsLeft(until: string | null | undefined): number | null {
  const calc = () =>
    until ? Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 1000)) : null;
  const [left, setLeft] = useState<number | null>(calc);
  useEffect(() => {
    setLeft(calc());
    if (!until) return;
    const t = setInterval(() => setLeft(calc()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return left;
}

/**
 * Visible timer. `role="timer"` is not announced on every tick; the label is read on focus.
 * `format` gets the seconds left (use the locale's digits).
 */
export function Countdown({
  seconds,
  format,
  label,
}: {
  seconds: number;
  format: (s: number) => string;
  label: string;
}) {
  return (
    <span role="timer" aria-label={label} className="tabular-nums">
      <bdi dir="ltr">{format(seconds)}</bdi>
    </span>
  );
}
