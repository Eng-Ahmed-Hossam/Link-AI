import type { ReactNode } from 'react';
import { parseLocale } from '@/i18n';
import { AppProviders } from '@/AppProviders';

/** The dev route index: the app providers (one-click sign-in, Demo controls). */
export default async function DevLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  return <AppProviders locale={parseLocale((await params).lang)}>{children}</AppProviders>;
}
