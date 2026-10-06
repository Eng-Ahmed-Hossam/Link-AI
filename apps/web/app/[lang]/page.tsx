import { redirect } from 'next/navigation';
import { parseLocale } from '@/i18n';
import { PILOT } from '@/api-mode';

/** `/{lang}` alone: the centre workspace in the pilot (the only app it serves), else the welcome page. */
export default async function LangHome({ params }: { params: Promise<{ lang: string }> }) {
  const lang = parseLocale((await params).lang);
  redirect(PILOT ? `/${lang}/centre` : `/${lang}/welcome`);
}
