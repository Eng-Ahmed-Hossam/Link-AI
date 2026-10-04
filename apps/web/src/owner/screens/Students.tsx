'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ownerApi, type Attendance, type CentreStudentRow } from '@link/api-client';
import { Avatar, EmptyState, FilterChip, Input, Select, StatusBadge } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { QueryState } from '../../parent/QueryState';
import { OwnerPageHeader, caseStatus, num, useCentre } from '../common';

type Filter = 'attention' | 'notes' | 'noGuardian';

/** Attendance as a coloured dot AND a letter (status is never colour alone, 11 §6). */
export function AttendanceDots({ values }: { values: (Attendance | 'none')[] }) {
  const { t } = useI18n();
  const map = {
    present: { c: 'bg-green', l: t('owner.att.presentShort'), n: t('teacher.attendance.present') },
    late: { c: 'bg-amber', l: t('owner.att.lateShort'), n: t('teacher.attendance.late') },
    absent: { c: 'bg-red', l: t('owner.att.absentShort'), n: t('teacher.attendance.absent') },
    not_recorded: { c: 'border border-muted', l: '–', n: t('teacher.attendance.not_recorded') },
    none: { c: 'border border-muted', l: '–', n: t('teacher.attendance.not_recorded') },
  } as const;
  return (
    <span
      className="inline-flex items-center gap-1.5"
      aria-label={values.map((v) => map[v].n).join('، ')}
      role="img"
    >
      {values.map((v, i) => (
        <span key={i} className="inline-flex flex-col items-center gap-0.5" aria-hidden>
          <span className={`size-2.5 rounded-full ${map[v].c}`} />
          <span className="text-[10px] leading-none text-muted">{map[v].l}</span>
        </span>
      ))}
    </span>
  );
}

/** A13 · Students (FUP-DSH-02): search by student or guardian; filters; guardian status. */
export function OwnerStudents() {
  const { locale, t } = useI18n();
  const { centreId, base } = useCentre();
  const q = useQuery({
    queryKey: ['centre-students', centreId, locale],
    queryFn: () => ownerApi.students(centreId),
  });
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('all');
  const [filters, setFilters] = useState<Filter[]>([]);
  const test: Record<Filter, (r: CentreStudentRow) => boolean> = {
    attention: (r) => !!r.followUp,
    notes: (r) => !!r.latestNote,
    noGuardian: (r) => r.guardian.status === 'missing_phone',
  };
  const s = search.trim().toLowerCase();
  const rows = (q.data?.data ?? []).filter(
    (r) =>
      (!s ||
        r.student.displayName.toLowerCase().includes(s) ||
        (r.guardian.name ?? '').toLowerCase().includes(s)) &&
      (group === 'all' || r.group.id === group) &&
      filters.every((f) => test[f](r)),
  );
  const count = (f: Filter) => (q.data?.data ?? []).filter(test[f]).length;
  const labels: Record<Filter, string> = {
    attention: t('owner.students.attention'),
    notes: t('owner.students.hasNotes'),
    noGuardian: t('owner.students.noGuardian'),
  };

  return (
    <>
      <OwnerPageHeader
        title={t('owner.students.title')}
        subtitle={
          q.data
            ? t('owner.students.subtitle', {
                count: q.data.data.length,
                n: num(q.data.data.length, locale),
              })
            : undefined
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-sm">
          <Input
            label={t('owner.students.search')}
            placeholder={t('owner.students.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="students-search"
          />
        </div>
        <div className="w-56">
          <Select
            label={t('owner.students.group')}
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            options={[
              { value: 'all', label: t('owner.students.allGroups') },
              ...[...new Map((q.data?.data ?? []).map((r) => [r.group.id, r.group.name]))].map(
                ([value, label]) => ({ value, label }),
              ),
            ]}
          />
        </div>
        <div
          role="group"
          aria-label={t('owner.followUps.filters')}
          className="flex flex-wrap gap-2"
        >
          {(Object.keys(test) as Filter[]).map((f) => (
            <FilterChip
              key={f}
              data-testid={`students-${f}`}
              pressed={filters.includes(f)}
              onPressedChange={(on) =>
                setFilters((x) => (on ? [...x, f] : x.filter((y) => y !== f)))
              }
            >
              {labels[f]} · {num(count(f), locale)}
            </FilterChip>
          ))}
        </div>
      </div>
      <QueryState query={q}>
        {() =>
          rows.length ? (
            <div className="overflow-x-auto rounded-16 border border-border bg-white">
              <table className="w-full text-start">
                <thead className="bg-soft text-caption uppercase text-muted">
                  <tr>
                    {[
                      t('owner.students.colStudent'),
                      t('owner.students.group'),
                      t('owner.students.colLast4'),
                      t('owner.students.colScore'),
                      t('owner.students.colFollowUp'),
                      t('owner.students.colNote'),
                      t('owner.students.colGuardian'),
                    ].map((h) => (
                      <th key={h} scope="col" className="px-4 py-3 text-start font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const st = r.followUp
                      ? caseStatus(t, { status: r.followUp.status, overdue: r.followUp.overdue })
                      : null;
                    return (
                      <tr
                        key={r.student.id}
                        className="border-t border-border align-top"
                        data-testid={`student-row-${r.student.id}`}
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`${base}/students/${r.student.id}`}
                            className="flex min-h-11 items-center gap-3 text-label text-navy"
                          >
                            <Avatar name={r.student.displayName} size="sm" tone="green" />
                            <bdi>{r.student.displayName}</bdi>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-body">{r.group.name}</td>
                        <td className="px-4 py-3">
                          <AttendanceDots values={r.lastSessions} />
                        </td>
                        <td className="px-4 py-3 text-label">
                          {r.latestScore ? (
                            `${num(r.latestScore.score, locale)}/${num(r.latestScore.maxScore, locale)}`
                          ) : (
                            <span className="text-muted">{t('teacher.scores.notEntered')}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {st ? (
                            <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                          ) : (
                            <span className="text-caption text-muted">
                              {t('owner.students.noneOpen')}
                            </span>
                          )}
                        </td>
                        <td className="max-w-64 px-4 py-3 text-caption">
                          {r.latestNote ? (
                            <>
                              <p className="text-navy">{r.latestNote.body}</p>
                              <p className="text-muted">{t('owner.students.internalTeacher')}</p>
                            </>
                          ) : (
                            <span className="text-muted">{t('owner.students.noNote')}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.guardian.status === 'verified' ? (
                            <StatusBadge tone="success">{t('owner.students.verified')}</StatusBadge>
                          ) : r.guardian.status === 'kept_by_centre' ? (
                            // Pilot: Link holds only a label; the centre keeps the phone number.
                            <span className="text-caption text-muted">
                              <bdi>{r.guardian.name}</bdi> • {t('owner.pilot.phoneKept')}
                            </span>
                          ) : (
                            <StatusBadge tone="warning">
                              {t('owner.students.missingPhone')}
                            </StatusBadge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="border-t border-border px-4 py-3 text-caption text-muted">
                {t('owner.students.footnote')}
              </p>
            </div>
          ) : (
            <EmptyState title={t('owner.students.empty')} body={t('owner.students.emptyBody')} />
          )
        }
      </QueryState>
    </>
  );
}
