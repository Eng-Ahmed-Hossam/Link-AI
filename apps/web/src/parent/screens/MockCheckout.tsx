'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@link/api-client';
import { formatMoney } from '@link/i18n';
import { Button, Card, ErrorState, LoadingState } from '@link/ui';
import { useI18n } from '../../i18n-client';

interface MockPayment {
  id: string;
  enrolmentId: string;
  method: 'card' | 'wallet';
  amountPt: number;
  reference: string;
}

/**
 * Stand-in for the payment provider's hosted checkout (mock mode only; fake-pay plays this role
 * against core-api). Card details are never collected — not here, not anywhere in Link (BR-MNY-06).
 * The redirect back never changes payment status; only the (mock) webhook does (BR-MNY-12).
 */
export function MockCheckout({ paymentId }: { paymentId: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [p, setP] = useState<MockPayment | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(apiUrl(`/__mock/payments/${paymentId}`))
      .then((r) => (r.ok ? r.json() : null))
      .then(setP)
      .catch(() => setP(null));
  }, [paymentId]);

  async function complete(result: 'succeeded' | 'failed') {
    setBusy(true);
    await fetch(apiUrl(`/__mock/payments/${paymentId}/complete`), {
      method: 'POST',
      body: JSON.stringify({ result }),
    });
    router.replace(
      result === 'succeeded'
        ? `/${locale}/reserve/${p!.enrolmentId}/done`
        : `/${locale}/reserve/${p!.enrolmentId}`,
    );
  }

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 bg-soft p-5"
    >
      {p === undefined ? (
        <LoadingState label={t('states.loading.label')} rows={2} />
      ) : p === null ? (
        <ErrorState title={t('mockpay.notFound')} />
      ) : (
        <Card padding="lg" className="flex flex-col gap-3">
          <p className="text-caption text-muted">{t('mockpay.provider')}</p>
          <h1 className="text-heading text-navy">
            {t(p.method === 'wallet' ? 'mockpay.titleWallet' : 'mockpay.titleCard')}
          </h1>
          <p className="text-body text-muted">{t('mockpay.explain')}</p>
          <p className="text-label text-navy">
            {t('mockpay.amount', { amount: formatMoney(p.amountPt, locale) })} •{' '}
            <bdi dir="ltr">{p.reference}</bdi>
          </p>
          <Button block disabled={busy} onClick={() => complete('succeeded')}>
            {t('mockpay.success')}
          </Button>
          <Button
            block
            variant="secondary"
            danger
            disabled={busy}
            onClick={() => complete('failed')}
          >
            {t('mockpay.failure')}
          </Button>
        </Card>
      )}
    </main>
  );
}
