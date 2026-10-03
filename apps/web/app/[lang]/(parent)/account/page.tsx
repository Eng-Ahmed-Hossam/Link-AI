import { EmptyState } from '@link/ui';
import { getT, parseLocale } from '@/i18n';

export default async function AccountPage({ params }: { params: Promise<{ lang: string }> }) {
  const t = getT(parseLocale((await params).lang));
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title">{t('parent.nav.account')}</h1>
      <EmptyState title={t('states.empty.title')} body={t('parent.shell.placeholder')} />
    </div>
  );
}
