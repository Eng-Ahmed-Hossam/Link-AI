import { Suspense } from 'react';
import { P05Teacher } from '@/parent/screens/P05Teacher';

import { getT, parseLocale } from '@/i18n';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  return { title: getT(parseLocale((await params).lang))('parent.teacher.metaTitle') };
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
      <P05Teacher slug={p.slug} />
    </Suspense>
  );
}
