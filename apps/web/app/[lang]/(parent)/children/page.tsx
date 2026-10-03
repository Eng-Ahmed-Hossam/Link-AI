import { Suspense } from 'react';
import { P09Children } from '@/parent/screens/P09Children';
import { RequireParent } from '@/parent/RequireParent';
import { getT, parseLocale } from '@/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return { title: getT(parseLocale((await params).lang))('parent.children.metaTitle') };
}

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const p = await params;
  parseLocale(p.lang);
  return (
    <Suspense>
      <RequireParent>
        <P09Children />
      </RequireParent>
    </Suspense>
  );
}
