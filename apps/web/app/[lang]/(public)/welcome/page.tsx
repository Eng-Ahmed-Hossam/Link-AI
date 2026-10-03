import { Card } from '@link/ui';
import { getT, parseLocale } from '@/i18n';

export default async function WelcomePage({ params }: { params: Promise<{ lang: string }> }) {
  const t = getT(parseLocale((await params).lang));
  return (
    <Card>
      <h1 className="text-title">{t('parent.shell.title')}</h1>
      <p className="mt-2 text-body text-muted">{t('parent.shell.placeholder')}</p>
    </Card>
  );
}
