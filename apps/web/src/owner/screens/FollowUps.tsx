'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fuApi, type FollowupCase } from '@link/api-client';
import { Avatar, Callout, Card, FilterChip, StatusBadge } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { useSession } from '../../session';
import { QueryState } from '../../parent/QueryState';
import { OwnerPageHeader, caseStatus, dayMonth, num, useCentre } from '../common';

type Filter = 'open' | 'mine' | 'overdue' | 'closed';

/** A02 · Follow-ups (FUP-CAS-01): student, reason with dates and rule, owner, next step, due status. */
export function OwnerFollowUps() {
  const { locale, t } = useI18n();
  const { base } = useCentre();
  const { session } = useSession();
  const [filter, setFilter] = useState<Filter>('open');
  const q = useQuery({ queryKey: ['cases', locale], queryFn: () => fuApi.cases() });
  const closed = (c: FollowupCase) => c.status === 'resolved' || c.status === 'dismissed';
  const match: Record<Filter, (c: FollowupCase) => boolean> = {
    open: (c) => !closed(c),
    mine: (c) => !closed(c) && c.assignee.id === session?.userId,
    overdue: (c) => c.overdue,
    closed,
  };
  const labels: Record<Filter, string> = {
    open: t('owner.followUps.allOpen'),
    mine: t('owner.followUps.mine'),
    overdue: t('owner.followUps.overdue'),
    closed: t('owner.followUps.closed'),
  };

  return (
    <>
      <OwnerPageHeader
        title={t('owner.followUps.title')}
        subtitle={t('owner.followUps.subtitle')}
      />
      <QueryState query={q}>
        {(d) => {
          const rows = d.data.filter(match[filter]);
          return (
            <>
              <div
                role="group"
                aria-label={t('owner.followUps.filters')}
                className="flex flex-wrap gap-2"
              >
                {(Object.keys(match) as Filter[]).map((f) => (
                  <FilterChip
                    key={f}
                    pressed={filter === f}
                    onPressedChange={() => setFilter(f)}
                    data-testid={`filter-${f}`}
                  >
                    {labels[f]} · {num(d.data.filter(match[f]).length, locale)}
                  </FilterChip>
                ))}
              </div>
              {rows.length ? (
                rows.map((c) => {
                  const st = caseStatus(t, c);
                  const next = c.attempts.at(-1)?.nextAction;
                  return (
                    <Card
                      key={c.id}
                      className="flex flex-col gap-3"
                      data-testid={`case-row-${c.id}`}
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <Avatar name={c.student.displayName} size="sm" tone="green" />
                        <h2 className="text-heading text-navy">
                          <bdi>{c.student.displayName}</bdi>
                        </h2>
                        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                      </div>
                      <p className="text-body text-navy">
                        {c.signal.explanation} •{' '}
                        {t('owner.followUps.rule', {
                          rule: t('owner.rule.consecutive_absences'),
                          v: num(c.signal.ruleVersion, locale),
                        })}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-caption text-muted">
                          {c.assignee.displayName} ({c.assignee.role}) •{' '}
                          {next ?? t('owner.followUps.nextContact')} •{' '}
                          {c.overdue
                            ? t('owner.followUps.wasDue', { date: dayMonth(c.dueOn, locale) })
                            : t('owner.case.due', { date: dayMonth(c.dueOn, locale) })}
                        </p>
                        <Link
                          href={`${base}/follow-ups/${c.id}`}
                          className="inline-flex min-h-11 items-center rounded-12 border border-border px-5 text-label text-navy"
                        >
                          {t('owner.today.reviewCase')}
                        </Link>
                      </div>
                    </Card>
                  );
                })
              ) : (
                <Callout tone="info">{t('owner.today.noFlags')}</Callout>
              )}
              <Callout tone="info" title={t('owner.followUps.explainable')}>
                {t('owner.followUps.notPrediction')}
              </Callout>
            </>
          );
        }}
      </QueryState>
    </>
  );
}
