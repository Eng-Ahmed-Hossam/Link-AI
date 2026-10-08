'use client';

import { cn } from '../cn';

/**
 * On/off switch (Figma: "Listed", "Open to new teaching slots", "Monthly subscription"). A
 * `role="switch"` button; the knob moves to the end when on (RTL-aware), so the state is a shape
 * change, not colour alone. 44 px tap target.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
  testId,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Accessible name (visible text elsewhere can label it with aria-labelledby instead). */
  label: string;
  disabled?: boolean;
  testId?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'relative flex h-6 w-11 items-center rounded-full p-0.5 transition-colors',
          checked ? 'bg-blue' : 'bg-border',
        )}
      >
        <span
          className={cn(
            'size-5 rounded-full bg-white shadow-card transition-transform',
            checked ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0',
          )}
        />
      </span>
    </button>
  );
}
