'use client';

import { useState } from 'react';
import { newIdempotencyKey, opsApi, type OpsRefund } from '@link/api-client';
import { createTranslator, formatMoney, type Locale, type MessageKey } from '@link/i18n';
import { Button, Card, Segmented, StatusBadge } from '@link/ui';
import {
  ActionError,
  Header,
  History,
  ListState,
  Notes,
  ReasonAction,
  type T,
  useAction,
  when,
} from '../parts';
import { useLoad } from '../useLoad';

type Filter = 'requested' | 'all';

/** L03 · Refunds (MKT-OPS-04, BR-REF-07, OD-42): only `ops.finance` decides. */
export function RefundsScreen({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);
  const [filter, setFilter] = useState<Filter>('requested');
  const q = useLoad(() => opsApi.refunds(filter), [filter]);
  return (
    <>
      <Header
        title={t('ops.refunds.title')}
        lead={t('ops.refunds.lead')}
        side={
          <Segmented
            label={t('ops.refunds.filter')}
            value={filter}
            onValueChange={(v) => setFilter(v as Filter)}
            options={[
              { value: 'requested', label: t('ops.refunds.status.requested') },
              { value: 'all', label: t('ops.refunds.all') },
            ]}
          />
        }
      />
      <ListState t={t} {...q} empty={t('ops.refunds.empty')}>
        {(rows) => (
          <div className="flex flex-col gap-4">
            {rows.map((r) => (
              <RefundCard key={r.id} t={t} locale={locale} r={r} reload={q.reload} />
            ))}
          </div>
        )}
      </ListState>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="text-body text-navy">{children}</dd>
    </div>
  );
}

function RefundCard({
  t,
  locale,
  r,
  reload,
}: {
  t: T;
  locale: Locale;
  r: OpsRefund;
  reload: () => void;
}) {
  const a = useAction(t, reload);
  // One key per decision on this card: a double click or a retry never decides twice (07 §1).
  const [keys] = useState(() => ({ approve: newIdempotencyKey(), reject: newIdempotencyKey() }));
  const money = (pt: number) => formatMoney(pt, locale);
  return (
    <Card padding="lg" className="flex flex-col gap-4" data-testid="refund-item">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-heading">{money(r.amount.amountPt)}</h2>
          <p className="text-caption text-muted">
            {[r.centreName, r.teacherName].filter(Boolean).join(' · ')}
            {r.enrolmentRef ? (
              <>
                {' · '}
                <bdi dir="ltr">{r.enrolmentRef}</bdi>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            tone={
              r.status === 'requested'
                ? 'warning'
                : r.status === 'rejected' || r.status === 'failed'
                  ? 'error'
                  : 'success'
            }
          >
            {t(`ops.refunds.status.${r.status}` as MessageKey)}
          </StatusBadge>
          {r.autoEligible ? (
            <StatusBadge tone="info">{t('ops.refunds.autoEligible')}</StatusBadge>
          ) : null}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Row label={t('ops.refunds.policy')}>
          {t(`ops.refunds.policies.${r.policy}` as MessageKey)}
        </Row>
        <Row label={t('ops.refunds.paid')}>
          {money(r.paid.amountPt)}
          {r.paidAt ? ` · ${when(r.paidAt, locale)}` : ''}
        </Row>
        <Row label={t('ops.refunds.commission')}>{money(r.commission.amountPt)}</Row>
        <Row label={t('ops.refunds.firstSession')}>
          {r.firstSessionAt ? when(r.firstSessionAt, locale) : '—'}
        </Row>
        <Row label={t('ops.refunds.enrolment')}>
          {r.enrolmentStatus
            ? t(`ops.refunds.enrolmentStatus.${r.enrolmentStatus}` as MessageKey)
            : '—'}
        </Row>
        <Row label={t('ops.refunds.requested')}>{when(r.requestedAt, locale)}</Row>
        {r.decidedAt ? (
          <Row label={t('ops.refunds.decided')}>{when(r.decidedAt, locale)}</Row>
        ) : null}
      </dl>
      {r.reason ? (
        <p className="rounded-12 bg-soft p-3 text-body">
          {t('ops.refunds.parentReason')}: {r.reason}
        </p>
      ) : null}
      {r.status === 'requested' ? (
        <>
          <p className="text-caption text-muted">{t('ops.refunds.approveExplain')}</p>
          <div className="flex flex-wrap items-start gap-2">
            <Button
              disabled={a.busy}
              onClick={() => a.run(() => opsApi.approveRefund(r.id, keys.approve))}
              data-testid="refund-approve"
            >
              {t('ops.refunds.approve')}
            </Button>
            <ReasonAction
              t={t}
              label={t('ops.refunds.deny')}
              field={t('ops.refunds.denyReason')}
              busy={a.busy}
              danger
              onConfirm={(reason) => a.run(() => opsApi.rejectRefund(r.id, reason, keys.reject))}
            />
          </div>
        </>
      ) : null}
      <ActionError error={a.error} />
      <Notes t={t} locale={locale} subjectType="refund" subjectId={r.id} initial={[]} />
      <History t={t} locale={locale} objectType="refund" objectRef={r.id} />
    </Card>
  );
}
