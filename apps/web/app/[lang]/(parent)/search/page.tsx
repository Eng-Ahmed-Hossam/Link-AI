import { TeacherList } from '@/TeacherList';
import { getT, parseLocale } from '@/i18n';

export default async function SearchPage({ params }: { params: Promise<{ lang: string }> }) {
  const locale = parseLocale((await params).lang);
  const t = getT(locale);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title">{t('parent.shell.title')}</h1>
      <TeacherList locale={locale} />
    </div>
  );
}
