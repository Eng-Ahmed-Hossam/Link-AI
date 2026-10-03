import { useId, type TextareaHTMLAttributes } from 'react';
import { cn } from '../cn';

export interface TextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'maxLength'
> {
  label: string;
  /** Hard limit; typing beyond it is blocked, and the counter shows it (P10: 600). */
  maxLength: number;
  value: string;
  /** e.g. (n, max) => `${n} / ${max}` formatted in the locale's digits. */
  counter: (n: number, max: number) => string;
  hideLabel?: boolean;
  error?: string;
}

export function Textarea({
  label,
  maxLength,
  value,
  counter,
  hideLabel,
  error,
  className,
  id,
  ...rest
}: TextareaProps) {
  const auto = useId();
  const tid = id ?? auto;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={tid} className={cn('text-label text-navy', hideLabel && 'sr-only')}>
        {label}
      </label>
      <div
        className={cn(
          'flex flex-col gap-1 rounded-12 border bg-white p-3 focus-within:border-blue focus-within:ring-1 focus-within:ring-blue',
          error ? 'border-red' : 'border-border',
        )}
      >
        <textarea
          id={tid}
          value={value}
          maxLength={maxLength}
          aria-describedby={`${tid}-count`}
          aria-invalid={error ? true : undefined}
          rows={4}
          dir="auto"
          className="min-h-24 resize-y bg-transparent text-body text-navy outline-none placeholder:text-muted"
          {...rest}
        />
        <p id={`${tid}-count`} aria-live="polite" className="text-end text-caption text-muted">
          {counter(value.length, maxLength)}
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-caption text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
