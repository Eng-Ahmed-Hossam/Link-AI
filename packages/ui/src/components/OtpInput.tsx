import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { normalizeDigits } from '@link/i18n';
import { cn } from '../cn';

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  /** Group label, e.g. "Verification code". */
  label: string;
  /** Per-box accessible name, e.g. (i, n) => `Digit ${i} of ${n}`. */
  digitLabel: (index: number, total: number) => string;
  error?: string;
  disabled?: boolean;
  onComplete?: (value: string) => void;
}

/**
 * Six-digit code. Always an LTR isolate (codes read left to right in both languages, RTL-04).
 * Accepts Arabic-Indic digits and normalises them to Western digits.
 */
export function OtpInput({ value, onChange, length = 6, label, digitLabel, error, disabled, onComplete }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const commit = (next: string) => {
    const clean = normalizeDigits(next).replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    return clean;
  };

  const setDigit = (i: number, raw: string) => {
    const d = normalizeDigits(raw).replace(/\D/g, '');
    if (!d) return;
    // A full code pasted or auto-filled into one box.
    if (d.length > 1) {
      const clean = commit(d);
      refs.current[Math.min(clean.length, length - 1)]?.focus();
      return;
    }
    const chars = value.padEnd(length, ' ').split('');
    chars[i] = d;
    commit(chars.join('').replace(/ /g, ''));
    refs.current[Math.min(i + 1, length - 1)]?.focus();
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const target = value[i] ? i : Math.max(0, i - 1);
      commit(value.slice(0, target));
      refs.current[target]?.focus();
    } else if (e.key === 'ArrowLeft') {
      // The boxes are physically LTR, so the arrows follow the physical direction.
      e.preventDefault();
      refs.current[Math.max(0, i - 1)]?.focus();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      refs.current[Math.min(length - 1, i + 1)]?.focus();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const clean = commit(e.clipboardData.getData('text'));
    refs.current[Math.min(clean.length, length - 1)]?.focus();
  };

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      <span aria-hidden className="text-label text-navy">
        {label}
      </span>
      <div dir="ltr" className="flex gap-2">
        {Array.from({ length }, (_, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={value[i] ?? ''}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            disabled={disabled}
            aria-label={digitLabel(i + 1, length)}
            aria-invalid={error ? true : undefined}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
            onFocus={(e) => e.currentTarget.select()}
            className={cn(
              'h-12 min-w-0 flex-1 rounded-12 border bg-white text-center text-heading text-navy outline-none focus:border-blueText focus:ring-2 focus:ring-blueText/30 disabled:bg-soft',
              error ? 'border-red' : 'border-border',
            )}
          />
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-caption text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
