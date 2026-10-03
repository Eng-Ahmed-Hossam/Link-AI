import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, WifiOff } from 'lucide-react';
import { cn } from '../cn';

export interface StateProps {
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}

function StateBase({
  icon,
  tone,
  title,
  body,
  action,
  className,
  role,
}: StateProps & { icon: ReactNode; tone: string; role?: 'alert' | 'status' }) {
  return (
    <div
      role={role}
      className={cn('flex flex-col items-center gap-3 px-6 py-10 text-center', className)}
    >
      <span
        aria-hidden
        className={cn('flex size-12 items-center justify-center rounded-full [&>svg]:size-6', tone)}
      >
        {icon}
      </span>
      <h2 className="text-heading text-navy">{title}</h2>
      {body ? <p className="max-w-sm text-body text-muted">{body}</p> : null}
      {action}
    </div>
  );
}

export const EmptyState = (p: StateProps) => (
  <StateBase {...p} icon={<Inbox />} tone="bg-soft text-muted" />
);
export const ErrorState = (p: StateProps) => (
  <StateBase {...p} icon={<AlertTriangle />} tone="bg-redSoft text-red" role="alert" />
);
export const OfflineState = (p: StateProps) => (
  <StateBase {...p} icon={<WifiOff />} tone="bg-amberSoft text-amber" role="status" />
);

/** Skeleton rows. `label` is announced to screen readers. */
export function LoadingState({
  label,
  rows = 3,
  className,
}: {
  label: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn('flex flex-col gap-3 p-4', className)}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-16 bg-soft" />
      ))}
    </div>
  );
}
