import { Suspense } from 'react';
import { P10Feedback } from '@/parent/screens/P10Feedback';
import { RequireParent } from '@/parent/RequireParent';
import { getT, parseLocale } from '@/i18n';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  return { title: getT(parseLocale((await params).lang))('parent.feedback.metaTitle') };
}

export default async function Page({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const p = await params;
  parseLocale(p.lang);
  return (
    <Suspense>
      <RequireParent>
        <P10Feedback id={p.id} />
      </RequireParent>
    </Suspense>
  );
}
