import type { ReactNode } from 'react';

/** Public pages choose their own frame: P01 uses the mobile parent frame, C01 (Batch 2) a desktop one. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
