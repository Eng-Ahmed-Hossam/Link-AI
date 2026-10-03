import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  label: string;
  help?: string;
  /** Error text, announced to screen readers. Never colour alone. */
  error?: string;
  /** Force an LTR isolate for phone numbers, codes and IDs (RTL-04). The text stays start-aligned. */
  ltr?: boolean;
  /** Fixed adornment at the start, e.g. the "+20" prefix. Always LTR. */
  prefix?: ReactNode;
}

export function Input({ label, help, error, ltr, prefix, id, className, ...rest }: InputProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const describedBy =
    [help && !error ? `${inputId}-help` : null, error ? `${inputId}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={inputId} className="text-label text-navy">
        {label}
      </label>
      <div
        className={cn(
          'flex min-h-12 items-center gap-2 rounded-12 border bg-white px-4 focus-within:border-blueText focus-within:ring-2 focus-within:ring-blueText/30',
          error ? 'border-red' : 'border-border',
        )}
      >
        {prefix ? (
          <bdi dir="ltr" className="text-body text-muted">
            {prefix}
          </bdi>
        ) : null}
        <input
          id={inputId}
          dir={ltr ? 'ltr' : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'min-w-0 flex-1 bg-transparent py-3 text-body text-navy outline-none placeholder:text-muted',
            ltr && 'text-start',
          )}
          {...rest}
        />
      </div>
      {help && !error ? (
        <p id={`${inputId}-help`} className="text-caption text-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-caption text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
