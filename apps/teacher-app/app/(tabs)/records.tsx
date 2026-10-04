import { useQuery } from '@tanstack/react-query';
import { fuApi } from '@link/api-client';
import { StateView } from '@link/ui-native';
import { useLocale } from '@/locale';
import { track } from '@/net';
import { RecordsHistory } from '@/screens/RecordsHistory';
import { Screen } from '@/ui/Screen';

/**
 * Records tab (Phase 2 only, CF-29): the records history of the teacher's follow-up group. With
 * the marketplace on too, Records is reached from My groups and Today instead.
 */
export default function RecordsTab() {
  const { locale, t } = useLocale();
  const q = useQuery({
    queryKey: ['teacher-groups', locale],
    queryFn: () => track(fuApi.teacherGroups()),
  });
  const group = q.data?.find((g) => g.followup);
  if (group) return <RecordsHistory groupId={group.id} />;
  return (
    <Screen title={t('teacher.history.title')}>
      <StateView
        locale={locale}
        kind={q.isPending ? 'loading' : q.isError ? 'error' : 'empty'}
        title={
          q.isPending
            ? t('states.loading.label')
            : q.isError
              ? t('states.error.title')
              : t('teacher.history.empty')
        }
        actionLabel={q.isError ? t('common.retry') : undefined}
        onAction={() => q.refetch()}
      />
    </Screen>
  );
}
