import { notFound } from 'next/navigation';
import { parseLocale } from '@/i18n';
import { PILOT } from '@/api-mode';
import { SiteHeader } from '@/site/SiteHeader';
import { AddCentre } from '@/owner/market/AddCentre';

/** C01 · Add my centre (MKT-ACC-02 AC3): the website header, then the request to join. */
export default async function AddCentrePage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = parseLocale((await params).lang);
  if (PILOT) notFound();
  return (
    <>
      <div className="bg-navy">
        <SiteHeader locale={lang} />
      </div>
      <main id="main" className="min-h-dvh bg-[linear-gradient(180deg,#e8f7fe_0%,#fafdff_100%)]">
        <AddCentre />
      </main>
    </>
  );
}
