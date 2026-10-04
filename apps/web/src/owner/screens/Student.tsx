'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fuApi, ownerApi } from '@link/api-client';
import { Callout, Card, StatusBadge } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { QueryState } from '../../parent/QueryState';
import { OwnerPageHeader, dayMonth, num, useCentre } from '../common';

/**
 * A04 · Student profile (FUP-DSH-03): open follow-ups, recent sessions ("Not recorded" shown as
 * such), learning record and the latest internal observation. A trend needs at least 3 results
 * from the same assessment series.
 */
export function OwnerStudent({ studentId }: { studentId: string }) {
  const { locale, t } = useI18n();
  const { centreId, base } = useCentre();
  const q = useQuery({
    queryKey: ['student', studentId, locale],
    queryFn: () => fuApi.student(studentId),
  });
  const cases = useQuery({ queryKey: ['cases', locale], queryFn: () => fuApi.cases() });
  const rows = useQuery({
    queryKey: ['centre-students', centreId, locale],
    queryFn: () => ownerApi.students(centreId),
  });
  const label = (v: string) =>
    v === 'present'
      ? t('teacher.attendance.present')
      : v === 'absent'
        ? t('teacher.attendance.absent')
        : v === 'late'
          ? t('teacher.attendance.late')
          : t('teacher.attendance.not_recorded');

  return (
    <QueryState query={q}>
      {(d) => {
        const open = (cases.data?.data ?? []).filter(
          (c) => c.student.id === studentId && !['resolved', 'dismissed'].includes(c.status),
        );
        const row = rows.data?.data.find((r) => r.student.id === studentId);
        const note = d.notes[0];
        const comparable = d.trends.filter((tr) => tr.points.length >= 3);
        return (
          <>
            <OwnerPageHeader
              back={{ href: `${base}/students`, label: t('owner.nav.students') }}
              title={d.student.displayName}
              subtitle={`${d.group.name} • ${row?.guardian.status === 'missing_phone' ? t('owner.students.missingPhone') : t('owner.student.guardianVerified')}`}
            />
            {open.map((c) => (
              <Callout key={c.id} tone="warning" title={t('owner.student.openFollowUp')}>
                {c.signal.explanation} • {t('owner.student.assigned', { name: c.assignee.role })}{' '}
                <Link href={`${base}/follow-ups/${c.id}`} className="underline">
                  {t('owner.today.reviewCase')}
                </Link>
              </Callout>
            ))}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card className="flex flex-col gap-3">
                <h2 className="text-heading text-navy">{t('owner.student.recentSessions')}</h2>
                <table className="w-full text-start">
                  <thead className="text-caption text-muted">
                    <tr>
                      <th scope="col" className="py-2 text-start font-normal">
                        {t('owner.student.date')}
                      </th>
                      <th scope="col" className="py-2 text-start font-normal">
                        {t('owner.student.attendance')}
                      </th>
                      <th scope="col" className="py-2 text-start font-normal">
                        {t('owner.student.record')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.attendance
                      .slice(-6)
                      .reverse()
                      .map((a) => (
                        <tr key={a.sessionDate} className="border-t border-border">
                          <td className="py-2 text-body">{dayMonth(a.sessionDate, locale)}</td>
                          <td className="py-2 text-body">{label(a.value)}</td>
                          <td className="py-2 text-body">
                            {a.value === 'none'
                              ? t('owner.sessions.statusNotStarted')
                              : t('owner.sessions.statusConfirmed')}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                <p className="text-caption text-muted">{t('owner.student.notRecordedNote')}</p>
              </Card>
              <Card className="flex flex-col gap-3">
                <h2 className="text-heading text-navy">{t('owner.student.learning')}</h2>
                {d.latestScore ? (
                  <div>
                    <p className="text-label text-navy">{d.latestScore.title}</p>
                    <p className="text-body text-muted">
                      {num(d.latestScore.score, locale)} / {num(d.latestScore.maxScore, locale)} •{' '}
                      {t('owner.student.teacherConfirmed')}
                    </p>
                  </div>
                ) : null}
                {comparable.length ? (
                  comparable.map((tr) => (
                    <div key={tr.series}>
                      <p className="text-label text-navy">{tr.points.at(-1)!.title}</p>
                      <p className="text-body text-muted">
                        {tr.points
                          .map((p) => `${num(p.score, locale)}/${num(p.maxScore, locale)}`)
                          .join(' → ')}
                      </p>
                    </div>
                  ))
                ) : (
                  <div data-testid="no-trend">
                    <p className="text-label text-navy">{t('owner.student.noTrendTitle')}</p>
                    <p className="text-body text-muted">{t('owner.student.noTrend')}</p>
                  </div>
                )}
                <div>
                  <p className="text-label text-navy">{t('owner.student.observation')}</p>
                  {note ? (
                    <p className="text-body text-muted">
                      {note.body}{' '}
                      <StatusBadge tone="neutral">
                        {t('owner.students.internalTeacher')}
                      </StatusBadge>
                    </p>
                  ) : (
                    <p className="text-body text-muted">{t('owner.student.noObservation')}</p>
                  )}
                </div>
              </Card>
            </div>
          </>
        );
      }}
    </QueryState>
  );
}
