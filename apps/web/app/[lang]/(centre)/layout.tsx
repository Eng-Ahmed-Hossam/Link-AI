import type { ReactNode } from 'react';
import { parseLocale } from '@/i18n';
import { AppProviders } from '@/AppProviders';

/** The centre workspace (owner web): the app providers. */
export default async function CentreGroupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  return <AppProviders locale={parseLocale((await params).lang)}>{children}</AppProviders>;
}
