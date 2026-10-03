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

/**
 * Initials from a name: two letters, in the name's own script (Arabic initials for Arabic names,
 * 11 §3 "List row with initials avatar"). Honorifics are skipped.
 */
export function initialsOf(name: string, mode: 'person' | 'place' = 'person'): string {
  const words = name
    .replace(/^(Ms|Mr|Mrs|Dr|أ\.|م\.|د\.)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    // Arabic definite article: "مركز النور" → "من", not "ما".
    .map((w) => (w.length > 2 ? w.replace(/^ال/, '') : w));
  const first = words[0]?.[0] ?? '';
  // People: first + last name ("SF"). Places: the first two words ("Al Nour Centre" → "AN").
  const second =
    mode === 'place'
      ? (words[1]?.[0] ?? '')
      : words.length > 1
        ? (words[words.length - 1]?.[0] ?? '')
        : '';
  return (first + second).toUpperCase();
}

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
