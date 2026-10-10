import { redirect } from 'next/navigation';
import { parseLocale } from '@/i18n';

/** `/{lang}` → the first queue (the shell sends a user without ops.verify to their own one). */
export default async function OpsHome({ params }: { params: Promise<{ lang: string }> }) {
  redirect(`/${parseLocale((await params).lang)}/centres`);
}
