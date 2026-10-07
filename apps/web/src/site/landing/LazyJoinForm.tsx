'use client';

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import dynamic from 'next/dynamic';
import type { JoinForm as Form } from './JoinForm';

const JoinForm = dynamic(() => import('./JoinForm').then((m) => m.JoinForm), { ssr: false });

/**
 * The join form, loaded as the visitor scrolls toward it: its code (form controls, validation)
 * stays out of the first load. A minimum height keeps the layout still.
 */
export function LazyJoinForm(props: ComponentProps<typeof Form>) {
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
    <div ref={ref} className={show ? undefined : 'min-h-[400px]'}>
      {show ? <JoinForm {...props} /> : null}
    </div>
  );
}
