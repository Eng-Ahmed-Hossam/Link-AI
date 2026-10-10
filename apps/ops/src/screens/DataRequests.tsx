'use client';

import { useState } from 'react';
import { opsApi, type OpsDataRequest } from '@link/api-client';
import { createTranslator, type Locale, type MessageKey } from '@link/i18n';
import { Button, Callout, Card, Segmented, StatusBadge } from '@link/ui';
import {
  ActionError,
  DueBadge,
  Header,
  History,
  Last4,
  ListState,
  ReasonAction,
  type T,
  useAction,
  when,
} from '../parts';
import { useLoad } from '../useLoad';

type Filter = 'open' | 'all';

/** Save the person's data as a JSON file (the download is in the audit log). */
async function download(id: string) {
  const data = await opsApi.exportDataRequest(id);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `link-data-${id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Data-subject requests (MKT-OPS-09, PDPL Law 151/2020; 10 §3). */
export function DataRequestsScreen({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);
  const [filter, setFilter] = useState<Filter>('open');
  const q = useLoad(() => opsApi.dataRequests(filter), [filter]);
  return (
    <>
      <Header
        title={t('ops.dataRequests.title')}
        lead={t('ops.dataRequests.lead')}
        side={
          <Segmented
            label={t('ops.dataRequests.filter')}
            value={filter}
            onValueChange={(v) => setFilter(v as Filter)}
            options={[
              { value: 'open', label: t('ops.dataRequests.status.open') },
              { value: 'all', label: t('ops.refunds.all') },
            ]}
          />
        }
      />
      <Callout tone="info" className="mb-4">
        {t('ops.dataRequests.howTo')}
      </Callout>
      <ListState t={t} {...q} empty={t('ops.dataRequests.empty')}>
        {(rows) => (
          <div className="flex flex-col gap-4">
            {rows.map((d) => (
              <RequestCard key={d.id} t={t} locale={locale} d={d} reload={q.reload} />
            ))}
          </div>
        )}
      </ListState>
    </>
  );
}

function RequestCard({
  t,
  locale,
  d,
  reload,
}: {
  t: T;
  locale: Locale;
  d: OpsDataRequest;
  reload: () => void;
}) {
  const a = useAction(t, reload);
  return (
    <Card padding="lg" className="flex flex-col gap-4" data-testid="data-request">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-heading">{t(`ops.dataRequests.kind.${d.kind}` as MessageKey)}</h2>
          <p className="text-caption text-muted">
            {d.userName ?? '—'} <Last4 last4={d.phoneLast4} /> ·{' '}
            {d.roles.map((r) => t(`ops.dataRequests.role.${r}` as MessageKey)).join('، ') || '—'} ·{' '}
            {when(d.createdAt, locale)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            tone={
              d.status === 'open' ? 'warning' : d.status === 'completed' ? 'success' : 'neutral'
            }
          >
            {t(`ops.dataRequests.status.${d.status}` as MessageKey)}
          </StatusBadge>
          {d.status === 'open' ? <DueBadge t={t} dueAt={d.dueAt} /> : null}
        </div>
      </div>
      {d.details ? <p className="rounded-12 bg-soft p-3 text-body">{d.details}</p> : null}
      {d.outcome ? (
        <p className="text-body">
          {t('ops.dataRequests.outcome')}: {d.outcome}
        </p>
      ) : null}
      {d.status === 'open' ? (
        <div className="flex flex-wrap items-start gap-2">
          {d.kind === 'access' ? (
            <Button
              variant="secondary"
              disabled={a.busy}
              onClick={() => a.run(() => download(d.id))}
              data-testid="data-request-export"
            >
              {t('ops.dataRequests.export')}
            </Button>
          ) : null}
          <ReasonAction
            t={t}
            label={t('ops.dataRequests.complete')}
            field={t('ops.dataRequests.whatWasDone')}
            busy={a.busy}
            onConfirm={(o) => a.run(() => opsApi.completeDataRequest(d.id, 'completed', o))}
            testId="data-request-complete"
          />
          <ReasonAction
            t={t}
            label={t('ops.dataRequests.reject')}
            field={t('ops.common.reason')}
            busy={a.busy}
            danger
            onConfirm={(o) => a.run(() => opsApi.completeDataRequest(d.id, 'rejected', o))}
          />
        </div>
      ) : null}
      <ActionError error={a.error} />
      <History t={t} locale={locale} objectType="data_request" objectRef={d.id} />
    </Card>
  );
}
