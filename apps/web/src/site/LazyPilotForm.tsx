'use client';

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import dynamic from 'next/dynamic';
import type { PilotForm as Form } from './PilotForm';

const PilotForm = dynamic(() => import('./PilotForm').then((m) => m.PilotForm), { ssr: false });

/**
 * The landing page's pilot form, loaded as the visitor scrolls toward it: its code (form
 * controls, validation) stays out of the first load. A fixed-height box keeps the layout still.
 */
export function LazyPilotForm(props: ComponentProps<typeof Form>) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="min-h-[640px]">
      {show ? <PilotForm {...props} /> : null}
    </div>
  );
}
