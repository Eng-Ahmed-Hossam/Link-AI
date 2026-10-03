import { Card, PageTitle } from '@link/ui';
import { ParentShell } from '@/parent/ParentShell';
import { getT, parseLocale } from '@/i18n';

/** MKT-ACC-02 AC4: teachers continue in the teacher app (Batch 3). Placeholder. */
export default async function TeacherNextPage({ params }: { params: Promise<{ lang: string }> }) {
  const t = getT(parseLocale((await params).lang));
  return (
    <ParentShell eyebrow={t('parent.welcome.eyebrow')}>
      <PageTitle
        title={t('parent.welcome.teacherNextTitle')}
        subtitle={t('parent.welcome.teacherNextBody')}
      />
      <Card>
        <p className="text-caption text-muted">{t('parent.welcome.placeholderBatch3')}</p>
      </Card>
    </ParentShell>
  );
}
