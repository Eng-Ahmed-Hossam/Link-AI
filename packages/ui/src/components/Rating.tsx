'use client';

import * as RadioGroup from '@radix-ui/react-radio-group';
import { cn } from '../cn';

/**
 * Average rating: "★ 4.7 (126)". The star uses amber; the number is navy text.
 * `label` is the full accessible sentence ("Rated 4.7 out of 5 from 126 verified reviews").
 */
export function Rating({
  value,
  count,
  label,
  size = 'md',
  className,
}: {
  value: string;
  count?: string;
  label: string;
  size?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('inline-flex items-center gap-1 whitespace-nowrap', className)}
    >
      <span aria-hidden className={cn('text-amber', size === 'lg' ? 'text-heading' : 'text-label')}>
        ★
      </span>
      <span aria-hidden className={cn('text-navy', size === 'lg' ? 'text-heading' : 'text-label')}>
        {value}
      </span>
      {count ? (
        <span aria-hidden className="text-caption text-muted">
          {count}
        </span>
      ) : null}
    </span>
  );
}

/** Static star row for a single review (★★★★☆). */
export function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="text-label tracking-wider">
      <span aria-hidden className="text-amber">
        {'★'.repeat(value)}
      </span>
      <span aria-hidden className="text-border">
        {'★'.repeat(5 - value)}
      </span>
    </span>
  );
}

/**
 * 1–5 star input as a radio group (keyboard: arrows). Each star is a 44 px target.
 * Stars fill from the start edge, so in RTL they fill right-to-left, matching reading order.
 */
export function StarInput({
  label,
  value,
  onValueChange,
  starLabel,
}: {
  label: string;
  value: number;
  onValueChange: (v: number) => void;
  /** e.g. (n) => `${n} out of 5 stars` */
  starLabel: (n: number) => string;
}) {
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value ? String(value) : undefined}
      onValueChange={(v) => onValueChange(Number(v))}
      className="flex gap-1"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <RadioGroup.Item
          key={n}
          value={String(n)}
          aria-label={starLabel(n)}
          className={cn(
            'flex size-11 cursor-pointer items-center justify-center rounded-8 text-metric leading-none outline-none focus-visible:ring-2 focus-visible:ring-blueText',
            n <= value ? 'text-amber' : 'text-border',
          )}
        >
          <span aria-hidden>★</span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
