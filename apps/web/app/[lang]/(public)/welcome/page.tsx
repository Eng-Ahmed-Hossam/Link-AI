import { Suspense } from 'react';
import { ParentShell } from '@/parent/ParentShell';
import { P01Welcome } from '@/parent/screens/P01Welcome';
import { getT, parseLocale } from '@/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return { title: getT(parseLocale((await params).lang))('parent.welcome.metaTitle') };
}

export default async function WelcomePage({ params }: { params: Promise<{ lang: string }> }) {
  const t = getT(parseLocale((await params).lang));
  return (
    <ParentShell eyebrow={t('parent.welcome.eyebrow')}>
      <Suspense>
        <P01Welcome />
      </Suspense>
    </ParentShell>
  );
}
