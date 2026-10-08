'use client';

import { CheckCircle2 } from 'lucide-react';
import { Card } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { contactEmail } from '../../site/contact';
import { OwnerPageHeader } from '../common';

const ITEMS = ['i1', 'i2', 'i3', 'i4', 'i5'] as const;

/**
 * "What's included" for a centre without the Follow-up extra (OD-58). No prices: the extra is
 * agreed with Link ("Contact us" — Link's address when set, else the request form on the website).
 */
export function FollowupExtra() {
  const { locale, t } = useI18n();
  const email = contactEmail();
  return (
    <>
      <OwnerPageHeader title={t('centre.extra.title')} subtitle={t('centre.extra.lead')} />
      <Card className="flex max-w-2xl flex-col gap-4" data-testid="followup-extra">
        <h2 className="flex items-center gap-2 text-heading text-navy">
          {t('centre.extra.included')}
          <span className="rounded-full bg-amberSoft px-2 py-0.5 text-caption font-semibold text-amber">
            {t('centre.nav.paidExtra')}
          </span>
        </h2>
        <ul className="flex flex-col gap-3">
          {ITEMS.map((k) => (
            <li key={k} className="flex items-start gap-2 text-body text-navy">
              <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-green" />
              {t(`centre.extra.${k}`)}
            </li>
          ))}
        </ul>
        <a
          href={email ? `mailto:${email}` : `/${locale}#join`}
          data-testid="extra-contact"
          className="inline-flex min-h-11 items-center justify-center self-start rounded-12 bg-blue px-5 text-label text-navy shadow-glow hover:brightness-95"
        >
          {t('centre.extra.contact')}
        </a>
        <p className="text-caption text-muted">{t('centre.extra.note')}</p>
      </Card>
    </>
  );
}
