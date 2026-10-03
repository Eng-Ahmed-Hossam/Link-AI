import type { ReactNode } from 'react';
import { parseLocale } from '@/i18n';
import { ParentShell } from '@/ParentShell';

export default async function ParentLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const locale = parseLocale((await params).lang);
  return <ParentShell locale={locale}>{children}</ParentShell>;
}
