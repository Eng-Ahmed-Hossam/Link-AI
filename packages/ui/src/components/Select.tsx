import { useId, type SelectHTMLAttributes } from 'react';
import { cn } from '../cn';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label: string;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
  error?: string;
}

/**
 * Native select (best on low-end Android, NFR-02; the OS picker handles RTL and screen readers).
 * The chevron sits at the end edge.
 */
export function Select({
  label,
  options,
  placeholder,
  error,
  className,
  id,
  ...rest
}: SelectProps) {
  const auto = useId();
  const sid = id ?? auto;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={sid} className="text-label text-navy">
        {label}
      </label>
      <div className="relative">
        <select
          id={sid}
          aria-invalid={error ? true : undefined}
          className={cn(
            'min-h-12 w-full cursor-pointer appearance-none rounded-12 border bg-white pe-10 ps-4 text-body text-navy outline-none focus:border-blue focus:ring-1 focus:ring-blue',
            error ? 'border-red' : 'border-border',
          )}
          {...rest}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 end-4 flex items-center text-muted"
        >
          ▾
        </span>
      </div>
      {error ? (
        <p role="alert" className="text-caption text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
