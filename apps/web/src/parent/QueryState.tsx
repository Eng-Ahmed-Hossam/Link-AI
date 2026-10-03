'use client';

import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ApiError } from '@link/api-client';
import { Button, EmptyState, ErrorState, LoadingState, OfflineState } from '@link/ui';
import { useI18n } from '../i18n-client';

/**
 * Renders the "operational honesty" states (11 §4) for one query: loading, offline (no response),
 * error (with retry), empty, then the content.
 */
export function QueryState<T>({
  query,
  isEmpty,
  empty,
  children,
  loadingRows = 3,
}: {
  query: UseQueryResult<T, ApiError>;
  isEmpty?: (data: T) => boolean;
  /** Custom empty state; defaults to the generic one. */
  empty?: ReactNode;
  children: (data: T) => ReactNode;
  loadingRows?: number;
}) {
  const { t } = useI18n();
  if (query.isPending) return <LoadingState label={t('states.loading.label')} rows={loadingRows} />;
  if (query.isError) {
    const retry = (
      <Button variant="secondary" onClick={() => query.refetch()}>
        {t('common.retry')}
      </Button>
    );
    return query.error.isNetwork ? (
      <OfflineState
        title={t('states.offline.title')}
        body={t('states.offline.body')}
        action={retry}
      />
    ) : (
      <ErrorState title={t('states.error.title')} body={t('states.error.body')} action={retry} />
    );
  }
  if (isEmpty?.(query.data))
    return (
      <>{empty ?? <EmptyState title={t('states.empty.title')} body={t('states.empty.body')} />}</>
    );
  return <>{children(query.data)}</>;
}
