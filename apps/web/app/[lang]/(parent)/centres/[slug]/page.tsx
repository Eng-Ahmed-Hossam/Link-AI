import { Suspense } from 'react';
import { P04Centre } from '@/parent/screens/P04Centre';

import { getT, parseLocale } from '@/i18n';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  return { title: getT(parseLocale((await params).lang))('parent.centre.metaTitle') };
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const p = await params;
  parseLocale(p.lang);
  return (
    <Suspense>
      <P04Centre slug={p.slug} />
    </Suspense>
  );
}
