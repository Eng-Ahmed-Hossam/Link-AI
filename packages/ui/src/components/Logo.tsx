import markUrl from '../brand/logo-mark.svg';
import haloUrl from '../brand/logo-mark-halo.svg';
import { cn } from '../cn';

// Next.js static imports give `{ src }`; Vite (Storybook) gives a string.
const src = (m: string | { src: string }) => (typeof m === 'string' ? m : m.src);

export type LogoVariant = 'lockup-light' | 'lockup-dark' | 'mark' | 'mark-halo';

export interface LogoProps {
  variant?: LogoVariant;
  /** Orb size in px. Mark: 24–96 (Figma 65:373). Lockup uses 32. Halo is hero-only (96). */
  size?: number;
  /** Accessible name; the logo is one image to assistive tech. */
  label?: string;
  className?: string;
}

/**
 * Link / Logo (Figma 65:385). Never mirrored in RTL (RTL-03), so it renders inside an LTR isolate.
 * The orb is the face of the Link Assistant; the halo version is for hero sizes only.
 */
export function Logo({ variant = 'lockup-light', size, label = 'Link', className }: LogoProps) {
  if (variant === 'mark' || variant === 'mark-halo') {
    const s = size ?? (variant === 'mark-halo' ? 96 : 48);
    return (
      <img
        src={src(variant === 'mark-halo' ? haloUrl : markUrl)}
        width={s}
        height={s}
        alt={label}
        className={cn('shrink-0 rounded-full', className)}
      />
    );
  }
  const orb = size ?? 32;
  return (
    <span
      role="img"
      aria-label={label}
      dir="ltr"
      className={cn('inline-flex items-center gap-2', className)}
    >
      <img src={src(markUrl)} width={orb} height={orb} alt="" className="shrink-0 rounded-full" />
      {/* Wordmark: Plus Jakarta Sans Bold 24, −2% tracking. A logotype, so the blue fill is allowed. */}
      <span
        aria-hidden
        lang="en"
        className={cn(
          // Title size (24). The −2% tracking is part of the logotype spec, not a text style.
          '[font-family:var(--font-en)] text-title leading-none tracking-[-0.02em]',
          variant === 'lockup-dark' ? 'text-white' : 'text-blue',
        )}
      >
        link.
      </span>
    </span>
  );
}
