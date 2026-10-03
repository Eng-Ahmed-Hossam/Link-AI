import Link from 'next/link';
import { Card, StatusBadge } from '@link/ui';
import { getT, parseLocale } from '@/i18n';
import { LangSwitch } from '@/LangSwitch';

/**
 * Local SSO stub. Ops sign in through the company IdP, never with a phone code (MKT-OPS-08).
 * Locally the IdP is `oidc-stub` (docs/14 §2); this page just continues into the console.
 */
export default async function OpsSignInPage({ params }: { params: Promise<{ lang: string }> }) {
  const locale = parseLocale((await params).lang);
  const t = getT(locale);
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div className="flex justify-end">
        <LangSwitch locale={locale} />
      </div>
      <Card padding="lg" className="flex flex-col gap-4">
        <h1 className="text-title">{t('ops.signIn.title')}</h1>
        <StatusBadge tone="neutral">{t('ops.signIn.stub')}</StatusBadge>
        <Link
          href={`/${locale}/centres`}
          className="inline-flex min-h-11 items-center justify-center rounded-12 bg-blue px-5 text-label text-navy shadow-glow"
        >
          {t('ops.signIn.sso')}
        </Link>
      </Card>
    </main>
  );
}
