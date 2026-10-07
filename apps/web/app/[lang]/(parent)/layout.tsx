import type { ReactNode } from 'react';
import { parseLocale } from '@/i18n';
import { AppProviders } from '@/AppProviders';
import { ParentShell } from '@/parent/ParentShell';

export default async function ParentLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  return (
    <AppProviders locale={parseLocale((await params).lang)}>
      <ParentShell>{children}</ParentShell>
    </AppProviders>
  );
}
