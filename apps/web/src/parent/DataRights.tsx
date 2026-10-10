'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  newIdempotencyKey,
  opsApi,
  type DataRequest,
  type DataRequestKind,
} from '@link/api-client';
import { formatDate, type MessageKey } from '@link/i18n';
import { Button, Callout, Card, StatusBadge, Textarea } from '@link/ui';
import { useI18n } from '../i18n-client';

const KINDS: DataRequestKind[] = ['access', 'correction', 'deletion'];

/**
 * "My data" (PDPL Law 151/2020, MKT-OPS-09): ask Link for a copy, a correction or deletion. Link
 * ops answer within 30 days in the ops console; the status shows here. One open request per kind.
 */
export function DataRights() {
  const { locale, t } = useI18n();
  const [list, setList] = useState<DataRequest[] | null>(null);
  const [kind, setKind] = useState<DataRequestKind | null>(null);
  const [details, setDetails] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      opsApi
        .myDataRequests()
        .then(setList)
        .catch(() => setList([])),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const open = new Set(list?.filter((r) => r.status === 'open').map((r) => r.kind));

  async function send() {
    if (!kind) return;
    setBusy(true);
    setError(null);
    try {
      await opsApi.createDataRequest(kind, details.trim(), key);
      setKind(null);
      setDetails('');
      setKey(newIdempotencyKey());
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'already_open'
          ? t('parent.account.data.alreadyOpen')
          : t('states.error.body'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3" data-testid="data-rights">
      <h2 className="text-label text-navy">{t('parent.account.data.title')}</h2>
      <p className="text-body text-muted">{t('parent.account.data.lead')}</p>
      {kind ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <p className="text-label text-navy">
            {t(`parent.account.data.kind.${kind}` as MessageKey)}
          </p>
          {kind === 'deletion' ? (
            <Callout tone="warning">{t('parent.account.data.deletionNote')}</Callout>
          ) : null}
          <Textarea
            label={t('parent.account.data.details')}
            maxLength={2000}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            counter={(n, max) => t('common.counter', { n, max })}
            rows={3}
          />
          {error ? (
            <Callout tone="error" role="alert">
              {error}
            </Callout>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy} data-testid="data-request-send">
              {t('parent.account.data.send')}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setKind(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          {KINDS.map((k) => (
            <Button
              key={k}
              variant="secondary"
              disabled={open.has(k)}
              onClick={() => setKind(k)}
              data-testid={`data-request-${k}`}
            >
              {t(`parent.account.data.ask.${k}` as MessageKey)}
            </Button>
          ))}
        </div>
      )}
      {list?.length ? (
        <ul className="flex flex-col gap-2" aria-label={t('parent.account.data.yours')}>
          {list.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 rounded-12 bg-soft p-3">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-label text-navy">
                  {t(`parent.account.data.kind.${r.kind}` as MessageKey)}
                </span>
                <StatusBadge
                  tone={
                    r.status === 'open' ? 'info' : r.status === 'completed' ? 'success' : 'neutral'
                  }
                >
                  {t(`parent.account.data.status.${r.status}` as MessageKey)}
                </StatusBadge>
              </span>
              <span className="text-caption text-muted">
                {formatDate(r.createdAt, locale, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              {r.outcome ? <span className="text-body">{r.outcome}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
