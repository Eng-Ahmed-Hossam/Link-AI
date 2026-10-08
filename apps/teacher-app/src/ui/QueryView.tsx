import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { StateView } from '@link/ui-native';
import { useLocale } from '../locale';
import { isNetworkError } from '../net';

/** Loading, offline / error (with retry) and empty states around a query's data. */
export function QueryView<T>({
  query,
  isEmpty,
  empty,
  children,
}: {
  query: UseQueryResult<T>;
  isEmpty?: (d: T) => boolean;
  empty?: { title: string; body?: string };
  children: (d: T) => ReactNode;
}) {
  const { locale, t } = useLocale();
  if (query.isPending)
    return <StateView locale={locale} kind="loading" title={t('states.loading.label')} />;
  if (query.isError) {
    const offline = isNetworkError(query.error);
    return (
      <StateView
        locale={locale}
        kind={offline ? 'offline' : 'error'}
        title={offline ? t('states.offline.title') : t('states.error.title')}
        body={offline ? t('states.offline.body') : t('states.error.body')}
        actionLabel={t('common.retry')}
        onAction={() => void query.refetch()}
      />
    );
  }
  if (empty && isEmpty?.(query.data))
    return <StateView locale={locale} kind="empty" title={empty.title} body={empty.body} />;
  return <>{children(query.data)}</>;
}
