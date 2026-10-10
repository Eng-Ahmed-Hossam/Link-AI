'use client';

import { useState } from 'react';
import {
  newIdempotencyKey,
  opsApi,
  type OpsPayout,
  type OpsPayoutAccount,
  type PayoutBatch,
} from '@link/api-client';
import { createTranslator, formatMoney, type Locale, type MessageKey } from '@link/i18n';
import { Button, Callout, Card, Input, Segmented, StatusBadge } from '@link/ui';
import {
  ActionError,
  Header,
  History,
  ListState,
  ReasonAction,
  type T,
  useAction,
  when,
} from '../parts';
import { useLoad } from '../useLoad';

type Filter = 'initiated' | 'failed' | 'settled' | 'all';

/** Save a CSV in the browser (the export itself is audited by core-api). */
function save(filename: string, csv: string) {
  // A BOM so spreadsheet apps read the Arabic names as UTF-8.
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Payouts (MKT-OPS-11, BR-OUT-01…08): the weekly batch, its CSV for the bank or InstaPay, then
 * each transfer marked settled or failed; payout accounts checked before anyone is paid.
 */
export function PayoutsScreen({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);
  const [filter, setFilter] = useState<Filter>('initiated');
  const batches = useLoad(() => opsApi.payoutBatches(), []);
  const accounts = useLoad(() => opsApi.payoutAccountsToVerify(), []);
  const payouts = useLoad(() => opsApi.payouts(filter), [filter]);
  const reloadAll = () => {
    batches.reload();
    accounts.reload();
    payouts.reload();
  };
  const run = useAction(t, reloadAll);
  const [runKey] = useState(newIdempotencyKey);
  const [ran, setRan] = useState<string | null>(null);

  return (
    <>
      <Header
        title={t('ops.payouts.title')}
        lead={t('ops.payouts.lead')}
        side={
          <Button
            disabled={run.busy}
            onClick={() =>
              run.run(async () => {
                const r = await opsApi.runPayouts(runKey);
                setRan(
                  t('ops.payouts.ran', {
                    n: r.count,
                    total: formatMoney(r.totalPt, locale),
                  }),
                );
              })
            }
            data-testid="run-payouts"
          >
            {t('ops.payouts.run')}
          </Button>
        }
      />
      {ran ? (
        <Callout tone="success" role="status" className="mb-4">
          {ran}
        </Callout>
      ) : null}
      <ActionError error={run.error} />

      <section className="mb-8 flex flex-col gap-3" aria-labelledby="accounts">
        <h2 id="accounts" className="text-heading">
          {t('ops.payouts.accountsTitle')}
        </h2>
        <ListState t={t} {...accounts} empty={t('ops.payouts.accountsEmpty')}>
          {(rows) => (
            <div className="flex flex-col gap-3">
              {rows.map((a) => (
                <AccountCard key={a.id} t={t} locale={locale} a={a} reload={reloadAll} />
              ))}
            </div>
          )}
        </ListState>
      </section>

      <section className="mb-8 flex flex-col gap-3" aria-labelledby="batches">
        <h2 id="batches" className="text-heading">
          {t('ops.payouts.batchesTitle')}
        </h2>
        <ListState t={t} {...batches} empty={t('ops.payouts.batchesEmpty')}>
          {(rows) => (
            <div className="flex flex-col gap-3">
              {rows.map((b) => (
                <BatchCard key={b.id} t={t} locale={locale} b={b} reload={reloadAll} />
              ))}
            </div>
          )}
        </ListState>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="payouts">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="payouts" className="text-heading">
            {t('ops.payouts.listTitle')}
          </h2>
          <Segmented
            label={t('ops.payouts.filter')}
            value={filter}
            onValueChange={(v) => setFilter(v as Filter)}
            options={(['initiated', 'failed', 'settled', 'all'] as const).map((s) => ({
              value: s,
              label: s === 'all' ? t('ops.refunds.all') : t(`ops.payouts.status.${s}`),
            }))}
          />
        </div>
        <ListState t={t} {...payouts} empty={t('ops.payouts.empty')}>
          {(rows) => (
            <div className="flex flex-col gap-3">
              {rows.map((p) => (
                <PayoutCard key={p.id} t={t} locale={locale} p={p} reload={reloadAll} />
              ))}
            </div>
          )}
        </ListState>
      </section>
    </>
  );
}

function AccountCard({
  t,
  locale,
  a,
  reload,
}: {
  t: T;
  locale: Locale;
  a: OpsPayoutAccount;
  reload: () => void;
}) {
  const act = useAction(t, reload);
  return (
    <Card className="flex flex-col gap-3" data-testid="payout-account">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-label text-navy">
            {a.payeeName} · {t(`ops.payouts.payee.${a.payeeType}`)}
          </span>
          <span className="text-caption text-muted">
            {t(`ops.payouts.kind.${a.kind}`)} <bdi dir="ltr">•••• {a.last4}</bdi> ·{' '}
            {t('ops.payouts.holder', { name: a.holderName ?? '—' })} · {when(a.addedAt, locale)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={act.busy}
            onClick={() => act.run(() => opsApi.decidePayoutAccount(a.id, 'verify'))}
          >
            {t('ops.payouts.verifyAccount')}
          </Button>
          <ReasonAction
            t={t}
            label={t('ops.payouts.rejectAccount')}
            field={t('ops.common.reason')}
            busy={act.busy}
            danger
            onConfirm={(r) => act.run(() => opsApi.decidePayoutAccount(a.id, 'reject', r))}
          />
        </div>
      </div>
      <p className="text-caption text-muted">{t('ops.payouts.verifyHow')}</p>
      <ActionError error={act.error} />
    </Card>
  );
}

function BatchCard({
  t,
  locale,
  b,
  reload,
}: {
  t: T;
  locale: Locale;
  b: PayoutBatch;
  reload: () => void;
}) {
  const act = useAction(t, reload);
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3" data-testid="payout-batch">
      <div className="flex flex-col gap-1">
        <span className="text-label text-navy">
          {t('ops.payouts.week', {
            date: when(`${b.runOn}T09:00:00+02:00`, locale),
          })}
        </span>
        <span className="text-caption text-muted">
          {t('ops.payouts.batchLine', {
            n: b.payouts,
            open: b.initiated,
            settled: b.settled,
            failed: b.failed,
            total: formatMoney(b.total.amountPt, locale),
          })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge
          tone={b.status === 'closed' ? 'success' : b.status === 'exported' ? 'info' : 'warning'}
        >
          {t(`ops.payouts.batchStatus.${b.status}`)}
        </StatusBadge>
        <Button
          variant="secondary"
          disabled={act.busy || b.initiated === 0}
          onClick={() =>
            act.run(async () => {
              const x = await opsApi.exportPayoutBatch(b.id);
              save(x.filename, x.csv);
            })
          }
          data-testid="export-batch"
        >
          {t('ops.payouts.exportCsv')}
        </Button>
      </div>
      <ActionError error={act.error} />
    </Card>
  );
}

function PayoutCard({
  t,
  locale,
  p,
  reload,
}: {
  t: T;
  locale: Locale;
  p: OpsPayout;
  reload: () => void;
}) {
  const act = useAction(t, reload);
  const [ref, setRef] = useState('');
  const [keys] = useState(() => ({
    settle: newIdempotencyKey(),
    fail: newIdempotencyKey(),
    retry: newIdempotencyKey(),
  }));
  return (
    <Card padding="lg" className="flex flex-col gap-3" data-testid="payout-item">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-heading">
            {formatMoney(p.amount.amountPt, locale)} · {p.payeeName}
          </h3>
          <span className="text-caption text-muted">
            {t(`ops.payouts.payee.${p.payeeType}`)} · {t(`ops.payouts.kind.${p.kind}`)}{' '}
            <bdi dir="ltr">{p.account}</bdi> · {p.week}
            {p.attempts > 1 ? ` · ${t('ops.payouts.attempts', { n: p.attempts })}` : ''}
          </span>
          {p.failureReason ? (
            <span className="text-caption text-red">{p.failureReason}</span>
          ) : null}
          {p.reference ? (
            <span className="text-caption text-muted">
              {t('ops.payouts.reference')}: <bdi dir="ltr">{p.reference}</bdi>
            </span>
          ) : null}
        </div>
        <StatusBadge
          tone={p.status === 'settled' ? 'success' : p.status === 'failed' ? 'error' : 'warning'}
        >
          {t(`ops.payouts.status.${p.status}` as MessageKey)}
        </StatusBadge>
      </div>
      {p.status === 'initiated' ? (
        <div className="flex flex-wrap items-end gap-2">
          <Input
            label={t('ops.payouts.reference')}
            value={ref}
            maxLength={80}
            onChange={(e) => setRef(e.target.value)}
            ltr
          />
          <Button
            disabled={act.busy}
            onClick={() =>
              act.run(() => opsApi.settlePayout(p.id, ref.trim() || undefined, keys.settle))
            }
            data-testid="payout-settle"
          >
            {t('ops.payouts.settle')}
          </Button>
          <ReasonAction
            t={t}
            label={t('ops.payouts.fail')}
            field={t('ops.payouts.failReason')}
            busy={act.busy}
            danger
            onConfirm={(r) => act.run(() => opsApi.failPayout(p.id, r, keys.fail))}
          />
        </div>
      ) : p.status === 'failed' ? (
        <Button
          variant="secondary"
          className="self-start"
          disabled={act.busy}
          onClick={() => act.run(() => opsApi.retryPayout(p.id, keys.retry))}
        >
          {t('ops.payouts.retry')}
        </Button>
      ) : null}
      <ActionError error={act.error} />
      <History t={t} locale={locale} objectType="payout" objectRef={p.id} />
    </Card>
  );
}
