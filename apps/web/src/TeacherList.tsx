'use client';

import { useSearchTeachers } from '@link/api-client';
import { Card, EmptyState, ErrorState, LoadingState, StatusBadge, Button } from '@link/ui';
import { createTranslator, formatMoney, type Locale } from '@link/i18n';

/** Batch 0 proof that the mock endpoint, hooks and states work. The real P02/P03 arrive in Batch 1. */
export function TeacherList({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);
  const q = useSearchTeachers({ radiusKm: 5 });

  if (q.isPending) return <LoadingState label={t('states.loading.label')} />;
  if (q.isError)
    return (
      <ErrorState
        title={t('states.error.title')}
        body={t('states.error.body')}
        action={
          <Button variant="secondary" onClick={() => q.refetch()}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  if (q.data.items.length === 0)
    return <EmptyState title={t('states.empty.title')} body={t('states.empty.body')} />;

  return (
    <ul className="flex flex-col gap-3">
      {q.data.items.map((teacher) => (
        <li key={teacher.id}>
          <Card>
            {/* RTL-09: names may wrap to two lines; never truncate. */}
            <h2 className="text-heading">
              <bdi>{teacher.displayName}</bdi>
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge tone={teacher.seatState === 'full_waitlist' ? 'warning' : 'success'}>
                {teacher.seatState === 'full_waitlist'
                  ? t('common.status.warning')
                  : t('common.seatsLeft', { count: teacher.seatState === 'few' ? 2 : 8 })}
              </StatusBadge>
              {teacher.fromSessionFee ? (
                <span className="text-label">
                  {formatMoney(teacher.fromSessionFee.amountPt, locale)}
                </span>
              ) : null}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
