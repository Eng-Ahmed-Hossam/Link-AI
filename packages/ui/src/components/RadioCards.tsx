'use client';

import type { ReactNode } from 'react';
import * as RadioGroup from '@radix-ui/react-radio-group';
import { cn } from '../cn';

export interface RadioCardOption {
  value: string;
  title: ReactNode;
  description?: ReactNode;
  /** Extra content under the title row (e.g. group details). */
  children?: ReactNode;
  /** Leading visual after the radio (e.g. a method badge). */
  leading?: ReactNode;
  disabled?: boolean;
}

export interface RadioCardsProps {
  /** Accessible name of the group. */
  label: string;
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: RadioCardOption[];
  /** `cards` = separate cards (P01, P07 plans); `list` = rows inside one card (P07 methods). */
  layout?: 'cards' | 'list';
  className?: string;
}

/** The radio dot from Figma: ring + blue inner dot when checked. A shape change, not colour alone. */
function Dot() {
  return (
    <span
      aria-hidden
      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-border bg-white group-data-[state=checked]:border-blue"
    >
      <span className="size-2.5 rounded-full bg-blue opacity-0 group-data-[state=checked]:opacity-100" />
    </span>
  );
}

export function RadioCards({
  label,
  value,
  onValueChange,
  options,
  layout = 'cards',
  className,
}: RadioCardsProps) {
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value}
      onValueChange={onValueChange}
      className={cn('flex flex-col', layout === 'cards' ? 'gap-3' : 'gap-0', className)}
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          className={cn(
            'group flex w-full cursor-pointer items-start gap-3 text-start outline-none disabled:cursor-not-allowed disabled:opacity-50',
            'focus-visible:ring-2 focus-visible:ring-blueText',
            layout === 'cards'
              ? 'rounded-12 border border-border bg-white p-4 data-[state=checked]:border-blue data-[state=checked]:bg-blueSoft data-[state=checked]:ring-1 data-[state=checked]:ring-blue'
              : 'min-h-11 px-4 py-3 data-[state=checked]:bg-blueSoft',
          )}
        >
          <Dot />
          {o.leading}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-label text-navy">{o.title}</span>
            {o.description ? (
              <span className="text-caption text-muted">{o.description}</span>
            ) : null}
            {o.children}
          </span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
