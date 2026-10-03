'use client';

import type { ReactNode } from 'react';
import { DirectionProvider } from '@radix-ui/react-direction';
import { dirOf, type Locale } from '@link/i18n';

/** Wrap every app: Radix primitives read their direction from here (RTL-01). */
export function LinkProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <DirectionProvider dir={dirOf(locale)}>{children}</DirectionProvider>;
}
