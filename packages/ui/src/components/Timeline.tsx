import type { ReactNode } from 'react';
import { cn } from '../cn';

export type TimelineState = 'done' | 'current' | 'upcoming';

export interface TimelineStep {
  id: string;
  title: ReactNode;
  detail?: ReactNode;
  state: TimelineState;
  /** Spoken state, e.g. "Done", "In progress", "Next" — the marker alone is not enough. */
  stateLabel: string;
}

/** "What happens next" list (P08). Markers differ by shape and fill, and each has a spoken state. */
export function Timeline({ steps, className }: { steps: TimelineStep[]; className?: string }) {
  return (
    <ol className={cn('flex flex-col gap-3', className)}>
      {steps.map((s) => (
        <li key={s.id} className="flex items-start gap-3">
          <span
            aria-hidden
            className={cn(
              'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-caption',
              s.state === 'done' && 'bg-green text-white',
              s.state === 'current' && 'bg-blue',
              s.state === 'upcoming' && 'border-2 border-border bg-white',
            )}
          >
            {s.state === 'done' ? (
              '✓'
            ) : s.state === 'current' ? (
              <span className="size-2 rounded-full bg-white" />
            ) : null}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className={cn('text-label', s.state === 'upcoming' ? 'text-muted' : 'text-navy')}>
              <span className="sr-only">{s.stateLabel}: </span>
              {s.title}
            </p>
            {s.detail ? <p className="text-caption text-muted">{s.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
