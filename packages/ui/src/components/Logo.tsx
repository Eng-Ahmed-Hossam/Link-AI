import mark1 from '../brand/logo-mark@1x.png';
import mark2 from '../brand/logo-mark@2x.png';
import mark3 from '../brand/logo-mark@3x.png';
import mark1w from '../brand/logo-mark@1x.webp';
import mark2w from '../brand/logo-mark@2x.webp';
import mark3w from '../brand/logo-mark@3x.webp';
import halo1 from '../brand/logo-mark-halo@1x.png';
import halo2 from '../brand/logo-mark-halo@2x.png';
import halo3 from '../brand/logo-mark-halo@3x.png';
import halo1w from '../brand/logo-mark-halo@1x.webp';
import halo2w from '../brand/logo-mark-halo@2x.webp';
import halo3w from '../brand/logo-mark-halo@3x.webp';
import { WORDMARK } from '../brand/wordmark';
import { cn } from '../cn';

// Next.js static imports give `{ src }`; Vite (Storybook) gives a string.
type Asset = string | { src: string };
const src = (m: Asset) => (typeof m === 'string' ? m : m.src);
const srcSet = (a: Asset, b: Asset, c: Asset) => `${src(a)} 1x, ${src(b)} 2x, ${src(c)} 3x`;

const ORB = {
  mark: { png: [mark1, mark2, mark3], webp: [mark1w, mark2w, mark3w] },
  halo: { png: [halo1, halo2, halo3], webp: [halo1w, halo2w, halo3w] },
} as const;

export type LogoVariant = 'lockup-light' | 'lockup-dark' | 'mark' | 'mark-halo';

/** The halo version is for hero sizes only (11 §3: sign-in, voice capture). */
export const HALO_MIN_SIZE = 56;

export interface LogoProps {
  variant?: LogoVariant;
  /** Orb size in px. Mark: 24–96 (Figma 65:373). Lockup default 32. Halo: hero sizes only. */
  size?: number;
  /** Accessible name; the logo is one image to assistive tech. Pass "" when decorative. */
  label?: string;
  className?: string;
}

function Orb({
  kind,
  size,
  alt,
  className,
}: {
  kind: 'mark' | 'halo';
  size: number;
  alt: string;
  className?: string;
}) {
  const o = ORB[kind];
  return (
    <picture className="contents">
      <source type="image/webp" srcSet={srcSet(o.webp[0], o.webp[1], o.webp[2])} />
      <img
        src={src(o.png[0])}
        srcSet={srcSet(o.png[0], o.png[1], o.png[2])}
        width={size}
        height={size}
        alt={alt}
        className={cn('shrink-0 rounded-full', className)}
      />
    </picture>
  );
}

/**
 * Link / Logo (Figma 65:385). The orb is a raster (1x/2x/3x, WebP with PNG fallback) until design
 * supplies a vector; the wordmark is real SVG outlines (Plus Jakarta Sans Bold, SIL OFL 1.1).
 * Never mirrored in RTL (RTL-03), so the lockup renders inside an LTR isolate.
 */
export function Logo({ variant = 'lockup-light', size, label = 'Link', className }: LogoProps) {
  if (variant === 'mark' || variant === 'mark-halo') {
    const s = size ?? (variant === 'mark-halo' ? 96 : 48);
    // Below hero size the halo is not used (11 §3); fall back to the plain mark.
    const kind = variant === 'mark-halo' && s >= HALO_MIN_SIZE ? 'halo' : 'mark';
    return <Orb kind={kind} size={s} alt={label} className={className} />;
  }
  const orb = size ?? 32;
  // Figma lockup: 32 px orb, 24 px wordmark, 8 px gap — all scale together.
  const k = orb / 32;
  return (
    <span
      role="img"
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      dir="ltr"
      className={cn('inline-flex items-center', className)}
      style={{ gap: 8 * k }}
    >
      <Orb kind="mark" size={orb} alt="" />
      <svg
        aria-hidden
        width={WORDMARK.width * k}
        height={WORDMARK.height * k}
        viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`}
        className={variant === 'lockup-dark' ? 'text-white' : 'text-blue'}
      >
        {/* A logotype, so the brand blue fill is allowed (it is not body text). */}
        <path d={WORDMARK.d} fill="currentColor" />
      </svg>
    </span>
  );
}
