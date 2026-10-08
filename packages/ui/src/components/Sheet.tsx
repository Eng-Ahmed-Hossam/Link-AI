'use client';

import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '../cn';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
  /** `bottom` = mobile bottom sheet; `center` = dialog; `end` = side panel at the end edge. */
  side?: 'bottom' | 'center' | 'end';
}

/** Bottom sheet / dialog on Radix Dialog: focus trap, Esc, and scroll lock come for free. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  closeLabel,
  side = 'bottom',
}: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-navy/40" />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex max-h-[90dvh] flex-col gap-4 overflow-y-auto bg-white p-6 shadow-raised outline-none',
            side === 'bottom'
              ? 'inset-x-0 bottom-0 mx-auto max-w-md rounded-t-24'
              : side === 'end'
                ? 'inset-y-0 end-0 max-h-dvh w-full max-w-sm rounded-s-24'
                : 'inset-x-4 top-1/2 mx-auto max-w-md -translate-y-1/2 rounded-24',
          )}
        >
          {side === 'bottom' ? (
            <span aria-hidden className="mx-auto h-1 w-10 rounded-full bg-border" />
          ) : null}
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Dialog.Title className="text-heading text-navy">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="text-body text-muted">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              aria-label={closeLabel}
              className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-12 text-heading text-muted hover:bg-soft"
            >
              <span aria-hidden>×</span>
            </Dialog.Close>
          </div>
          {children}
          {footer}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
