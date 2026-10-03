'use client';

import { useId, type ReactNode } from 'react';
import * as RCheckbox from '@radix-ui/react-checkbox';
import { cn } from '../cn';

/**
 * Checkbox with a label. Never pre-ticked by this component: callers pass `checked`, and consent
 * boxes must start `false` (MKT-ENR-02 AC4).
 */
export function Checkbox({
  checked,
  onCheckedChange,
  children,
  description,
  className,
  id,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  children: ReactNode;
  description?: ReactNode;
  className?: string;
  id?: string;
}) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <div className={cn('flex items-start gap-3 rounded-12 bg-soft p-3', className)}>
      <RCheckbox.Root
        id={cid}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        aria-describedby={description ? `${cid}-d` : undefined}
        className="mt-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-8 border-2 border-border bg-white outline-none focus-visible:ring-2 focus-visible:ring-blueText data-[state=checked]:border-navy data-[state=checked]:bg-navy"
      >
        <RCheckbox.Indicator className="text-caption leading-none text-white">
          ✓
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* A 44 px tall label row keeps the touch target big enough. */}
        <label htmlFor={cid} className="-my-3 cursor-pointer py-3 text-caption text-navy">
          {children}
        </label>
        {description ? (
          <p id={`${cid}-d`} className="text-caption text-muted">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
