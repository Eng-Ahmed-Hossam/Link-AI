import { Suspense } from 'react';
import { P06ChooseGroup } from '@/parent/screens/P06ChooseGroup';
import { RequireParent } from '@/parent/RequireParent';
import { getT, parseLocale } from '@/i18n';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  return { title: getT(parseLocale((await params).lang))('parent.reserve.metaTitle') };
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
      <RequireParent>
        <P06ChooseGroup slug={p.slug} />
      </RequireParent>
    </Suspense>
  );
}
