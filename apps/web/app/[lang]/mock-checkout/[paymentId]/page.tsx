import { Suspense } from 'react';
import { MockCheckout } from '@/parent/screens/MockCheckout';

import { getT, parseLocale } from '@/i18n';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; paymentId: string }>;
}) {
  return { title: getT(parseLocale((await params).lang))('mockpay.metaTitle') };
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; paymentId: string }>;
}) {
  const p = await params;
  parseLocale(p.lang);
  return (
    <Suspense>
      <MockCheckout paymentId={p.paymentId} />
    </Suspense>
  );
}
