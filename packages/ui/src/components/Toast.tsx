'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import * as RToast from '@radix-ui/react-toast';

type ShowToast = (message: string) => void;
const Ctx = createContext<ShowToast>(() => {});

/** Wrap the app once. `useToast()(message)` shows a short polite status ("Code copied"). */
export function ToastProvider({ children, label }: { children: ReactNode; label: string }) {
  const [items, setItems] = useState<{ id: number; message: string }[]>([]);
  const show = useCallback<ShowToast>(
    (message) => setItems((xs) => [...xs, { id: Date.now(), message }]),
    [],
  );
  return (
    <Ctx.Provider value={show}>
      <RToast.Provider swipeDirection="down" label={label}>
        {children}
        {items.map((t) => (
          <RToast.Root
            key={t.id}
            duration={3000}
            onOpenChange={(open) => !open && setItems((xs) => xs.filter((x) => x.id !== t.id))}
            className="rounded-12 bg-navy px-4 py-3 text-label text-white shadow-raised"
          >
            <RToast.Description>{t.message}</RToast.Description>
          </RToast.Root>
        ))}
        <RToast.Viewport className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-sm flex-col gap-2 outline-none" />
      </RToast.Provider>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
