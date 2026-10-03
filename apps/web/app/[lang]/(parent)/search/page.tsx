import { Suspense } from 'react';
import { P02SearchHome } from '@/parent/screens/P02SearchHome';

import { getT, parseLocale } from '@/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return { title: getT(parseLocale((await params).lang))('parent.search.metaTitle') };
}

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const p = await params;
  parseLocale(p.lang);
  return (
    <Suspense>
      <P02SearchHome />
    </Suspense>
  );
}
