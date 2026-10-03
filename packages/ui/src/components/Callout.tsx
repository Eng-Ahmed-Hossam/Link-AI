import type { ReactNode } from 'react';
import { cn } from '../cn';

export type CalloutTone = 'info' | 'success' | 'warning' | 'error' | 'neutral';

const tones: Record<CalloutTone, { box: string; dot: string }> = {
  info: { box: 'bg-blueSoft text-blueText', dot: 'bg-blueText' },
  success: { box: 'bg-greenSoft text-green', dot: 'bg-green' },
  warning: { box: 'bg-amberSoft text-amber', dot: 'bg-amber' },
  error: { box: 'bg-redSoft text-red', dot: 'bg-red' },
  neutral: { box: 'bg-soft text-muted', dot: 'bg-muted' },
};

/** A tinted note with a dot (Figma: "Ratings come only from…", refund rule, warnings). */
export function Callout({
  tone = 'info',
  title,
  children,
  action,
  role,
  className,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  role?: 'status' | 'alert' | 'note';
  className?: string;
}) {
  const t = tones[tone];
  return (
    <div
      role={role}
      className={cn('flex items-start gap-3 rounded-12 px-4 py-3', t.box, className)}
    >
      <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-full', t.dot)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="text-label">{title}</p> : null}
        {children ? <div className="text-caption">{children}</div> : null}
        {action}
      </div>
    </div>
  );
}
