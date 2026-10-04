'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ownerApi, type ActivityKind } from '@link/api-client';
import { formatTime } from '@link/i18n';
import { Card, FilterChip } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { QueryState } from '../../parent/QueryState';
import { OwnerPageHeader, dayMonth, num, todayYmd, useCentre } from '../common';

type Filter = 'all' | ActivityKind;

/** A17 · Activity history (FUP-DSH-04): append-only, grouped by day, with weekly counts. */
export function OwnerActivity() {
  const { locale, t } = useI18n();
  const { centreId } = useCentre();
  const [filter, setFilter] = useState<Filter>('all');
  const q = useQuery({
    queryKey: ['activity', centreId, locale],
    queryFn: () => ownerApi.activity(centreId),
  });
  const labels: Record<Filter, string> = {
    all: t('owner.activity.all'),
    records: t('owner.activity.records'),
    followups: t('owner.activity.followups'),
    messages: t('owner.activity.messages'),
    corrections: t('owner.activity.corrections'),
    access: t('owner.activity.access'),
  };
  const dot: Record<ActivityKind, string> = {
    records: 'bg-blue',
    followups: 'bg-amber',
    messages: 'bg-green',
    corrections: 'bg-blueText',
    access: 'bg-navy',
  };
  return (
    <>
      <OwnerPageHeader title={t('owner.activity.title')} subtitle={t('owner.activity.subtitle')} />
      <div role="group" aria-label={t('owner.followUps.filters')} className="flex flex-wrap gap-2">
        {(Object.keys(labels) as Filter[]).map((f) => (
          <FilterChip
            key={f}
            variant="solid"
            pressed={filter === f}
            onPressedChange={() => setFilter(f)}
            data-testid={`activity-${f}`}
          >
            {labels[f]}
          </FilterChip>
        ))}
      </div>
      <QueryState query={q}>
        {(d) => {
          const events = d.events.filter((e) => filter === 'all' || e.kind === filter);
          const days = [...new Set(events.map((e) => e.at.slice(0, 10)))];
          return (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
              <div className="flex flex-col gap-4" data-testid="activity-days">
                {days.map((day) => (
                  <section key={day} className="flex flex-col gap-2">
                    <h2 className="text-caption text-muted">
                      {day === todayYmd() ? `${t('owner.activity.today')} • ` : ''}
                      {dayMonth(day, locale)}
                    </h2>
                    <Card className="flex flex-col gap-3">
                      {events
                        .filter((e) => e.at.slice(0, 10) === day)
                        .map((e) => (
                          <div
                            key={e.id}
                            className="flex items-start gap-3"
                            data-testid="activity-event"
                          >
                            <span className="w-14 shrink-0 text-caption text-muted">
                              {formatTime(e.at, locale)}
                            </span>
                            <span
                              aria-hidden
                              className={`mt-1.5 size-2 shrink-0 rounded-full ${dot[e.kind]}`}
                            />
                            <span className="sr-only">{labels[e.kind]}:</span>
                            <p className="min-w-0 flex-1 text-body text-navy">{e.text}</p>
                            <span className="shrink-0 text-caption text-muted">
                              {e.actor?.displayName ?? t('owner.case.system')}
                            </span>
                          </div>
                        ))}
                    </Card>
                  </section>
                ))}
              </div>
              <div className="flex flex-col gap-4 self-start">
                <div className="flex flex-col gap-2 rounded-16 bg-navy p-5 text-white">
                  <h2 className="text-label">{t('owner.activity.cantEdit')}</h2>
                  <p className="text-caption">{t('owner.activity.cantEditBody')}</p>
                </div>
                <Card className="flex flex-col gap-2" data-testid="week-counts">
                  <h2 className="text-heading text-navy">{t('owner.activity.week')}</h2>
                  {[
                    [d.week.recordsConfirmed, t('owner.activity.weekRecords')],
                    [d.week.followUpsOpened, t('owner.activity.weekFollowUps')],
                    [d.week.outcomesRecorded, t('owner.activity.weekOutcomes')],
                    [d.week.corrections, t('owner.activity.weekCorrections')],
                  ].map(([n, l]) => (
                    <p key={String(l)} className="text-body">
                      <span className="me-2 text-heading text-blueText">
                        {num(Number(n), locale)}
                      </span>
                      {l}
                    </p>
                  ))}
                </Card>
              </div>
            </div>
          );
        }}
      </QueryState>
    </>
  );
}
