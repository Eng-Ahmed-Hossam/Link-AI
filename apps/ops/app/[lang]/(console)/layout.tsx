import type { ReactNode } from 'react';
import { parseLocale } from '@/i18n';
import { OpsShell } from '@/OpsShell';

export default async function ConsoleLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  return <OpsShell locale={parseLocale((await params).lang)}>{children}</OpsShell>;
}
