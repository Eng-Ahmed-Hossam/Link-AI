'use client';

import type { ReactNode } from 'react';
import * as RTabs from '@radix-ui/react-tabs';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { cn } from '../cn';

export interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
}

/** Segmented tabs (Figma P04: Overview · Teachers · Timetable · Reviews). Radix handles RTL arrows. */
export function Tabs({
  label,
  items,
  value,
  onValueChange,
  defaultValue,
  className,
}: {
  label: string;
  items: TabItem[];
  value?: string;
  onValueChange?: (v: string) => void;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <RTabs.Root
      value={value}
      onValueChange={onValueChange}
      defaultValue={defaultValue ?? items[0]?.value}
      className={cn('flex flex-col gap-4', className)}
    >
      <RTabs.List aria-label={label} className="flex gap-1 rounded-12 bg-soft p-1">
        {items.map((t) => (
          <RTabs.Trigger
            key={t.value}
            value={t.value}
            className="min-h-11 flex-1 cursor-pointer rounded-8 px-2 text-caption text-muted outline-none focus-visible:ring-2 focus-visible:ring-blueText data-[state=active]:bg-white data-[state=active]:font-semibold data-[state=active]:text-navy data-[state=active]:shadow-subtle"
          >
            {t.label}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {items.map((t) => (
        <RTabs.Content key={t.value} value={t.value} className="outline-none">
          {t.content}
        </RTabs.Content>
      ))}
    </RTabs.Root>
  );
}

/** Two-to-four option switch without panels (P03: Map / List). */
export function Segmented({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(v) => v && onValueChange(v)}
      className="inline-flex gap-0.5 rounded-8 bg-soft p-1"
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className="min-h-9 min-w-11 cursor-pointer rounded-8 px-3 text-caption text-muted outline-none focus-visible:ring-2 focus-visible:ring-blueText data-[state=on]:bg-white data-[state=on]:font-semibold data-[state=on]:text-navy"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
