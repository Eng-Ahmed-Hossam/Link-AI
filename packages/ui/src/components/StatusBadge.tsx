import type { ReactNode } from 'react';
import { cn } from '../cn';

export type StatusTone = 'info' | 'warning' | 'success' | 'error' | 'neutral';

const tones: Record<StatusTone, { box: string; dot: string }> = {
  info: { box: 'bg-blueSoft text-blueText', dot: 'bg-blueText' },
  warning: { box: 'bg-amberSoft text-amber', dot: 'bg-amber' },
  success: { box: 'bg-greenSoft text-green', dot: 'bg-green' },
  error: { box: 'bg-redSoft text-red', dot: 'bg-red' },
  neutral: { box: 'bg-soft text-muted', dot: 'bg-muted' },
};

/** Status is never colour alone: always a dot AND text (11 §6). */
export function StatusBadge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  const t = tones[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-8 px-3 py-1 text-caption font-semibold',
        t.box,
        className,
      )}
    >
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', t.dot)} />
      <span>{children}</span>
    </span>
  );
}
