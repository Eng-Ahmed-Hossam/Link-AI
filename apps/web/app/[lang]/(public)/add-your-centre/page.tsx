import { Card, PageTitle } from '@link/ui';
import { ParentShell } from '@/parent/ParentShell';
import { getT, parseLocale } from '@/i18n';

/** MKT-ACC-02 AC3 → C01 "Add my centre" (Batch 2). Placeholder so P01's owner path has a target. */
export default async function AddCentrePlaceholder({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const t = getT(parseLocale((await params).lang));
  return (
    <ParentShell eyebrow={t('parent.welcome.eyebrow')}>
      <PageTitle
        title={t('parent.welcome.ownerNextTitle')}
        subtitle={t('parent.welcome.ownerNextBody')}
      />
      <Card>
        <p className="text-caption text-muted">{t('parent.welcome.placeholderBatch2')}</p>
      </Card>
    </ParentShell>
  );
}
