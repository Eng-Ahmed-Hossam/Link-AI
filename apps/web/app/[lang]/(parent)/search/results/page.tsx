import { Suspense } from 'react';
import { P03Results } from '@/parent/screens/P03Results';

import { getT, parseLocale } from '@/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return { title: getT(parseLocale((await params).lang))('parent.results.metaTitle') };
}

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const p = await params;
  parseLocale(p.lang);
  return (
    <Suspense>
      <P03Results />
    </Suspense>
  );
}
