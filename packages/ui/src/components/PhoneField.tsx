import { useId } from 'react';
import { normalizeDigits } from '@link/i18n';
import { cn } from '../cn';

/**
 * Egyptian mobile number in a card (Figma P01): "+20" chip and a large LTR number field.
 * Accepts Arabic-Indic digits and stores Western digits (RTL-04). Always an LTR isolate.
 */
export function PhoneField({
  label,
  value,
  onChange,
  placeholder,
  help,
  error,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  help?: string;
  error?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2 rounded-16 border border-border bg-white p-4 shadow-card">
      <label htmlFor={id} className="text-caption text-muted">
        {label}
      </label>
      <div dir="ltr" className="flex items-center gap-3">
        <span className="rounded-8 bg-soft px-3 py-2 text-label text-navy">+20</span>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-e` : help ? `${id}-h` : undefined}
          onChange={(e) => onChange(normalizeDigits(e.target.value).replace(/[^\d\s]/g, ''))}
          className={cn(
            'min-h-11 min-w-0 flex-1 bg-transparent text-start text-heading text-navy outline-none placeholder:font-normal placeholder:text-muted',
          )}
        />
      </div>
      {error ? (
        <p id={`${id}-e`} role="alert" className="text-caption text-red">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-h`} className="text-caption text-muted">
          {help}
        </p>
      ) : null}
    </div>
  );
}
