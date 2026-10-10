import { Card } from '@link/ui';
import { getT, parseLocale } from '@/i18n';
import { LangSwitch } from '@/LangSwitch';
import { OpsSignIn } from '@/OpsSignIn';

/** Ops sign-in (MKT-OPS-08): a phone code, then the `link_ops` role and the network are checked. */
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
        <p className="text-body text-muted">{t('ops.signIn.lead')}</p>
        <OpsSignIn locale={locale} />
      </Card>
    </main>
  );
}
