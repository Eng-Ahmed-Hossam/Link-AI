import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

export type ChipTone = 'neutral' | 'selected' | 'info' | 'success' | 'warning' | 'dark';

const tones: Record<ChipTone, string> = {
  neutral: 'bg-white border border-border text-navy',
  selected: 'bg-blueSoft border border-blue text-blueText',
  info: 'bg-blueSoft text-blueText',
  success: 'bg-greenSoft text-green',
  warning: 'bg-amberSoft text-amber',
  dark: 'bg-navy text-white',
};

const base =
  'inline-flex min-h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-caption';

/** Static pill (tags, counts, context like "Mariam • National • Secondary 2"). */
export function Chip({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn(base, tones[tone], className)}>{children}</span>;
}

export interface FilterChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  pressed: boolean;
  onPressedChange?: (pressed: boolean) => void;
  /** `solid` = navy when on (subject chips, Figma P02); `soft` = blueSoft (filters, tags). */
  variant?: 'solid' | 'soft';
  children: ReactNode;
}

/**
 * A toggle chip. Announced as a toggle button (aria-pressed). The pressed state also shows a
 * check mark for `soft` chips, so state is never colour alone.
 */
export function FilterChip({
  pressed,
  onPressedChange,
  variant = 'soft',
  className,
  children,
  ...rest
}: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange?.(!pressed)}
      className={cn(
        base,
        // 44 px tap target without changing the 32 px pill (Figma chip height).
        "relative cursor-pointer after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
        pressed ? (variant === 'solid' ? tones.dark : tones.selected) : tones.neutral,
        className,
      )}
      {...rest}
    >
      {pressed && variant === 'soft' ? <span aria-hidden>✓</span> : null}
      {children}
    </button>
  );
}
