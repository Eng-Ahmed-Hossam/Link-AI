import type { HTMLAttributes } from 'react';
import { cn } from '../cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** `flat` = border only; `raised` = Link/Elevation/Card. */
  elevation?: 'flat' | 'raised';
  padding?: 'none' | 'md' | 'lg';
}

export function Card({ elevation = 'raised', padding = 'md', className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-16 border border-border bg-white',
        elevation === 'raised' && 'shadow-card',
        padding === 'md' && 'p-4',
        padding === 'lg' && 'p-6',
        className,
      )}
      {...rest}
    />
  );
}
