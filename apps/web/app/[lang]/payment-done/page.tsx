import { Card } from '@link/ui';
import { getT, parseLocale } from '@/i18n';

/**
 * Where the payment provider sends a teacher back after paying rent from the app (S3, OD-12).
 * The redirect changes nothing: the payment counts only when the provider's signed webhook
 * confirms it (BR-MNY-12). So this page only says so, and points back to the app.
 */
export default async function PaymentDone({ params }: { params: Promise<{ lang: string }> }) {
  const locale = parseLocale((await params).lang);
  const t = getT(locale);
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <Card padding="lg" className="flex flex-col gap-3" data-testid="payment-done">
        <h1 className="text-title">{t('site.paymentDone.title')}</h1>
        <p className="text-body text-muted">{t('site.paymentDone.body')}</p>
      </Card>
    </main>
  );
}
