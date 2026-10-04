'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ownerApi } from '@link/api-client';
import { formatTime } from '@link/i18n';
import { Avatar, Callout, Card, KpiCard, StatusBadge } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { QueryState } from '../../parent/QueryState';
import {
  OwnerPageHeader,
  caseStatus,
  dayMonth,
  longDay,
  num,
  todayYmd,
  useCentre,
} from '../common';

/** A01 / A12 · Today (FUP-DSH-01): the owner's landing page in the follow-up workspace. */
export function OwnerToday() {
  const { locale, t } = useI18n();
  const { centreId, base } = useCentre();
  const q = useQuery({
    queryKey: ['owner-today', centreId, locale],
    queryFn: () => ownerApi.today(centreId),
  });

  return (
    <>
      <OwnerPageHeader
        title={t('owner.today.title')}
        subtitle={`${longDay(todayYmd(), locale)} • ${t('owner.today.subtitle')}`}
      />
      <QueryState query={q} loadingRows={4}>
        {(d) => (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                testId="kpi-due"
                value={num(d.dueToday, locale)}
                label={t('owner.today.due', { count: d.dueToday })}
                context={t('owner.today.dueContext', {
                  count: d.overdue.count,
                  n: num(d.overdue.count, locale),
                })}
              />
              <KpiCard
                testId="kpi-overdue"
                tone={d.overdue.count ? 'red' : 'navy'}
                value={num(d.overdue.count, locale)}
                label={t('owner.today.overdue', { count: d.overdue.count })}
                context={
                  d.overdue.owners.length
                    ? t('owner.today.assignedTo', {
                        names: d.overdue.owners.map((o) => o.displayName).join('، '),
                      })
                    : t('owner.today.noOverdue')
                }
              />
              <KpiCard
                testId="kpi-missing"
                tone={d.missingRecords.missing ? 'amber' : 'navy'}
                value={num(d.missingRecords.missing, locale)}
                label={t('owner.today.missing', { count: d.missingRecords.missing })}
                context={t('owner.today.ofEligible', { n: num(d.missingRecords.eligible, locale) })}
              />
              <KpiCard
                testId="kpi-complete"
                value={`${num(d.recordsComplete.confirmed, locale)} / ${num(d.recordsComplete.eligible, locale)}`}
                label={t('owner.today.complete')}
                context={t('owner.today.confirmedByTeachers')}
              />
            </div>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
              <section className="flex flex-col gap-4" aria-labelledby="follow-up-today">
                <h2 id="follow-up-today" className="text-heading text-navy">
                  {t('owner.today.followUpToday')}
                </h2>
                {d.followUpToday.length ? (
                  d.followUpToday.map((c) => {
                    const st = caseStatus(t, c);
                    return (
                      <Card
                        key={c.id}
                        className="flex flex-col gap-3"
                        data-testid={`today-case-${c.id}`}
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <Avatar name={c.student.displayName} size="sm" tone="green" />
                          <h3 className="text-heading text-navy">
                            <bdi>{c.student.displayName}</bdi>
                          </h3>
                          <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                        </div>
                        <p className="text-body text-navy">{c.signal.explanation}</p>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-caption text-muted">
                            {c.assignee.role} •{' '}
                            {t('owner.case.due', { date: dayMonth(c.dueOn, locale) })} •{' '}
                            {c.attempts.length
                              ? t('owner.case.attempts', {
                                  count: c.attempts.length,
                                  n: num(c.attempts.length, locale),
                                })
                              : t('owner.case.noContact')}
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
                  // 11 §4 "No flags".
                  <Callout tone="info">{t('owner.today.noFlags')}</Callout>
                )}
              </section>
              <Card className="flex flex-col gap-4 self-start">
                <h2 className="text-heading text-navy">{t('owner.today.keepComplete')}</h2>
                {d.keepComplete.length ? (
                  <ul className="flex flex-col gap-3">
                    {d.keepComplete.map((k) => (
                      <li key={k.sessionDate} className="flex flex-col">
                        <span className="text-label text-navy">{k.groupName}</span>
                        <span className="text-body text-muted">
                          {dayMonth(k.sessionDate, locale)}, {formatTime(k.startsAt, locale)} —{' '}
                          {k.status === 'draft'
                            ? t('owner.today.recordDraft')
                            : t('owner.today.recordMissing')}{' '}
                          • {k.teacher.displayName}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-body text-muted">{t('owner.today.allRecorded')}</p>
                )}
                <Callout tone="info" title={t('states.missingData')}>
                  {t('owner.today.missingBody')}
                </Callout>
                <Link
                  href={`${base}/sessions`}
                  className="inline-flex min-h-11 items-center justify-center rounded-12 border border-border px-5 text-label text-navy"
                >
                  {t('owner.today.reviewSessions')}
                </Link>
              </Card>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
