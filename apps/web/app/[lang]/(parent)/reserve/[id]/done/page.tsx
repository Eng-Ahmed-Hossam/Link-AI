import { Suspense } from 'react';
import { P08Done } from '@/parent/screens/P08Done';
import { RequireParent } from '@/parent/RequireParent';
import { getT, parseLocale } from '@/i18n';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  return { title: getT(parseLocale((await params).lang))('parent.done.metaTitle') };
}

export default async function Page({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const p = await params;
  parseLocale(p.lang);
  return (
    <Suspense>
      <RequireParent>
        <P08Done id={p.id} />
      </RequireParent>
    </Suspense>
  );
}
