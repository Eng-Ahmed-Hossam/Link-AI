import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '../cn';

export interface AppBarProps {
  title: string;
  /** Pass to show a back button. `backLabel` names the icon-only button (11 §6). */
  onBack?: () => void;
  backLabel?: string;
  trailing?: ReactNode;
  className?: string;
}

export function AppBar({ title, onBack, backLabel, trailing, className }: AppBarProps) {
  return (
    <header
      className={cn('sticky top-0 z-10 flex min-h-14 items-center gap-2 border-b border-border bg-white px-2', className)}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className="inline-flex size-11 items-center justify-center rounded-12 text-navy hover:bg-soft"
        >
          {/* RTL-03: directional icons mirror. */}
          <ChevronLeft aria-hidden className="size-6 rtl:-scale-x-100" />
        </button>
      ) : (
        <span className="w-2" />
      )}
      <h1 className="min-w-0 flex-1 text-heading text-navy">{title}</h1>
      {trailing}
    </header>
  );
}
