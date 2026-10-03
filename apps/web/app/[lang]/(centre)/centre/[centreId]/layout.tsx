import type { ReactNode } from 'react';
import { parseLocale } from '@/i18n';
import { CentreShell } from '@/CentreShell';

export default async function CentreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string; centreId: string }>;
}) {
  const { lang, centreId } = await params;
  return (
    <CentreShell locale={parseLocale(lang)} centreId={centreId}>
      {children}
    </CentreShell>
  );
}
