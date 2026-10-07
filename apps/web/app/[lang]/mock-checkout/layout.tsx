import type { ReactNode } from 'react';
import { parseLocale } from '@/i18n';
import { AppProviders } from '@/AppProviders';

/** The mock payment provider page (dev only): the app providers. */
export default async function MockCheckoutLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  return <AppProviders locale={parseLocale((await params).lang)}>{children}</AppProviders>;
}
