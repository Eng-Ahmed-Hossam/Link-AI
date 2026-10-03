import type { ReactNode } from 'react';
import { cn } from '../cn';

/** Horizontal bar (rating distribution). Fills from the start edge. */
export function ProgressBar({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  label: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('h-1.5 flex-1 overflow-hidden rounded-full bg-soft', className)}
    >
      <div className="h-full rounded-full bg-amber" style={{ inlineSize: `${pct}%` }} />
    </div>
  );
}

/** Small figure tile: "★ 4.8 / 64 reviews", "2 / centres". */
export function StatTile({
  value,
  label,
  tone = 'navy',
}: {
  value: ReactNode;
  label: ReactNode;
  tone?: 'navy' | 'amber';
}) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-12 bg-soft p-3">
      <span className={cn('text-heading', tone === 'amber' ? 'text-amber' : 'text-navy')}>
        {value}
      </span>
      <span className="text-caption text-muted">{label}</span>
    </div>
  );
}

/** "Label …… value" row for summaries (P07 totals, P08 receipt). */
export function SummaryRow({
  label,
  value,
  strong,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-[auto_1fr] items-baseline gap-x-3', className)}>
      <dt className={cn(strong ? 'text-label text-navy' : 'text-body text-muted')}>{label}</dt>
      <dd
        className={cn(
          'min-w-0 text-end',
          strong ? 'text-heading text-navy' : 'text-body text-navy',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Section title with an optional trailing link ("Top-rated Maths teachers · See all"). */
export function SectionHeader({
  title,
  action,
  level = 2,
}: {
  title: ReactNode;
  action?: ReactNode;
  level?: 2 | 3;
}) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <div className="flex items-center gap-2">
      <H className={cn('min-w-0 flex-1 text-navy', level === 2 ? 'text-heading' : 'text-label')}>
        {title}
      </H>
      {action}
    </div>
  );
}
