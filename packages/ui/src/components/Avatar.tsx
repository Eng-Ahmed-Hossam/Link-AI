import { initialsOf } from '@link/i18n/names';
import { cn } from '../cn';

export type AvatarTone = 'blue' | 'green' | 'amber' | 'navy';

const tones: Record<AvatarTone, string> = {
  blue: 'bg-blueSoft text-blueText',
  green: 'bg-greenSoft text-green',
  amber: 'bg-amberSoft text-amber',
  // Centres: navy tile with white initials (Figma uses blue text here; blue is never text, 11 §1).
  navy: 'bg-navy text-white',
};

const sizes = {
  xs: 'size-6 text-caption',
  sm: 'size-8 text-caption font-bold',
  md: 'size-10 text-label font-bold',
  lg: 'size-14 text-heading',
  xl: 'size-20 text-metric',
} as const;

export { initialsOf };

export interface AvatarProps {
  name: string;
  tone?: AvatarTone;
  size?: keyof typeof sizes;
  /** Rounded square (centres) instead of a circle (people). */
  square?: boolean;
  className?: string;
}

/** Decorative: the name is always shown next to it, so assistive tech skips the initials. */
export function Avatar({ name, tone = 'blue', size = 'md', square, className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-bold leading-none',
        square ? 'rounded-12' : 'rounded-full',
        tones[tone],
        sizes[size],
        className,
      )}
    >
      <bdi>{initialsOf(name, square ? 'place' : 'person')}</bdi>
    </span>
  );
}
