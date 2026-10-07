'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * Renders its children once the page has loaded. The hero's Figma pictures (cards, orb, outer
 * ring) are decoration that fades in on its own loop; keeping them out of the first paint lets
 * the heading and lead show first on a slow phone.
 */
export function AfterLoad({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (document.readyState === 'complete') {
      setReady(true);
      return;
    }
    const on = () => setReady(true);
    window.addEventListener('load', on, { once: true });
    return () => window.removeEventListener('load', on);
  }, []);
  return ready ? children : null;
}
