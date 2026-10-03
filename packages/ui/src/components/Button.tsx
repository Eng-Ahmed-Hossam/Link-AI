import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Destructive actions: Secondary with red text plus a confirmation (11 §3). */
  danger?: boolean;
  block?: boolean;
  children: ReactNode;
}

const base =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-12 px-5 text-label transition-colors cursor-pointer disabled:cursor-not-allowed';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-blue text-navy shadow-glow hover:brightness-95 disabled:bg-soft disabled:text-muted disabled:shadow-none disabled:brightness-100',
  secondary: 'bg-white text-navy border border-border hover:bg-soft disabled:bg-soft disabled:text-muted',
  quiet: 'bg-transparent text-blueText hover:bg-blueSoft disabled:text-muted disabled:hover:bg-transparent',
};

export function Button({ variant = 'primary', danger, block, className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], danger && 'text-red', block && 'w-full', className)}
      {...rest}
    />
  );
}
