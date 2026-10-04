'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  fuApi,
  ownerApi,
  type CentreSessionRow,
  type SessionRecord,
} from '@link/api-client';
import { formatTime } from '@link/i18n';
import {
  Avatar,
  Button,
  Callout,
  Card,
  EmptyState,
  FilterChip,
  Select,
  StatusBadge,
  Textarea,
} from '@link/ui';
import { useSession } from '../../session';
import { useI18n } from '../../i18n-client';
import { QueryState } from '../../parent/QueryState';
import { OwnerPageHeader, dateTime, dayMonth, num, useCentre } from '../common';

type Filter = 'all' | 'draft' | 'not_started';

/** A05 · Sessions (FUP-REC-12 AC1): group, teacher, attendance summary, record status. */
export function OwnerSessions() {
  const { locale, t } = useI18n();
  const { centreId, base } = useCentre();
  const q = useQuery({
    queryKey: ['centre-sessions', centreId, locale],
    queryFn: () => ownerApi.sessions(centreId),
  });
  const [filter, setFilter] = useState<Filter>('all');
  const match = (r: CentreSessionRow) => filter === 'all' || r.status === filter;
  const status = (r: CentreSessionRow) =>
    r.status === 'confirmed'
      ? { tone: 'success' as const, label: t('owner.sessions.statusConfirmed') }
      : r.status === 'draft'
        ? { tone: 'warning' as const, label: t('owner.sessions.statusDraft') }
        : { tone: 'neutral' as const, label: t('owner.sessions.statusNotStarted') };
  const labels: Record<Filter, string> = {
    all: t('owner.sessions.all'),
    draft: t('owner.sessions.awaiting'),
    not_started: t('owner.sessions.notRecorded'),
  };
  return (
    <>
      <OwnerPageHeader title={t('owner.sessions.title')} subtitle={t('owner.sessions.subtitle')} />
      <QueryState query={q}>
        {(d) => (
          <>
            <div
              role="group"
              aria-label={t('owner.followUps.filters')}
              className="flex flex-wrap gap-2"
            >
              {(['all', 'draft', 'not_started'] as Filter[]).map((f) => (
                <FilterChip
                  key={f}
                  pressed={filter === f}
                  onPressedChange={() => setFilter(f)}
                  data-testid={`sessions-${f}`}
                >
                  {labels[f]} ·{' '}
                  {num(d.data.filter((r) => f === 'all' || r.status === f).length, locale)}
                </FilterChip>
              ))}
            </div>
            {d.data.filter(match).length ? (
              <div className="overflow-x-auto rounded-16 border border-border bg-white">
                <table className="w-full">
                  <thead className="bg-soft text-caption uppercase text-muted">
                    <tr>
                      {[
                        t('owner.sessions.colSession'),
                        t('owner.sessions.colTeacher'),
                        t('owner.sessions.colAttendance'),
                        t('owner.sessions.colStatus'),
                      ].map((h) => (
                        <th key={h} scope="col" className="px-4 py-3 text-start font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.data.filter(match).map((r) => {
                      const st = status(r);
                      return (
                        <tr
                          key={r.sessionDate}
                          className="border-t border-border"
                          data-testid={`session-row-${r.sessionDate}`}
                        >
                          <td className="px-4 py-3">
                            {r.recordId ? (
                              <Link
                                href={`${base}/sessions/${r.recordId}`}
                                className="inline-flex min-h-11 items-center text-label text-blueText"
                              >
                                {r.groupName} • {dayMonth(r.sessionDate, locale)},{' '}
                                {formatTime(r.startsAt, locale)}
                              </Link>
                            ) : (
                              <span className="text-label text-navy">
                                {r.groupName} • {dayMonth(r.sessionDate, locale)},{' '}
                                {formatTime(r.startsAt, locale)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-body">{r.teacher.displayName}</td>
                          <td className="px-4 py-3 text-body">
                            {r.attendance
                              ? t('owner.sessions.attendance', {
                                  present: num(r.attendance.present + r.attendance.late, locale),
                                  absent: num(r.attendance.absent, locale),
                                  nr: num(r.attendance.notRecorded, locale),
                                })
                              : t('teacher.attendance.not_recorded')}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title={t('owner.sessions.empty')} />
            )}
            <Callout tone="info" title={t('owner.sessions.onlyConfirmedTitle')}>
              {t('owner.sessions.onlyConfirmedBody')}
            </Callout>
          </>
        )}
      </QueryState>
    </>
  );
}

/**
 * A14 · Session record detail (FUP-REC-08, FUP-REC-12): attendance, scores, observations, the record
 * status timeline, rules triggered by this record and the correction history (the original kept).
 */
export function OwnerSessionRecord({ recordId }: { recordId: string }) {
  const { locale, t } = useI18n();
  const { base } = useCentre();
  const q = useQuery({
    queryKey: ['record', recordId, locale],
    queryFn: () => fuApi.record(recordId),
  });
  const label = (v: string) =>
    v === 'present'
      ? t('teacher.attendance.present')
      : v === 'absent'
        ? t('teacher.attendance.absent')
        : v === 'late'
          ? t('teacher.attendance.late')
          : t('teacher.attendance.not_recorded');
  const val = (v: string | null) =>
    v == null || v === '' ? '—' : /^\d+(\.\d+)?$/.test(v) ? num(Number(v), locale) : label(v);
  const tone = (v: string) =>
    (v === 'present'
      ? 'success'
      : v === 'absent'
        ? 'error'
        : v === 'late'
          ? 'warning'
          : 'neutral') as 'success';
  return (
    <QueryState query={q}>
      {(r) => {
        const c = { present: 0, absent: 0, late: 0, not_recorded: 0 };
        for (const e of r.entries) c[e.attendance]++;
        const corrected = new Map(r.corrections.map((x) => [x.entryId + x.field, x]));
        const scored = r.entries.filter(
          (e) => e.score != null || (r.assessment && e.attendance === 'absent'),
        );
        return (
          <>
            <OwnerPageHeader
              back={{ href: `${base}/sessions`, label: t('owner.nav.sessions') }}
              title={t('owner.record.title', { date: dayMonth(r.sessionDate, locale) })}
              subtitle={`${r.confirmedBy?.displayName ?? ''} • ${formatTime(r.startsAt, locale)} • ${r.status === 'confirmed' ? t('owner.sessions.statusConfirmed') : t('owner.sessions.statusDraft')}`}
            />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
              <div className="flex flex-col gap-6">
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-heading text-navy">{t('owner.record.attendance')}</h2>
                    <p className="text-caption text-muted">
                      {t('teacher.review.counts', {
                        present: num(c.present, locale),
                        absent: num(c.absent, locale),
                        late: num(c.late, locale),
                        notRecorded: num(c.not_recorded, locale),
                      })}
                    </p>
                  </div>
                  <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {r.entries.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-center justify-between gap-2 rounded-12 bg-soft p-3"
                      >
                        <span className="flex items-center gap-2 text-label">
                          <Avatar name={e.student.displayName} size="xs" />
                          <bdi>{e.student.displayName}</bdi>
                        </span>
                        <StatusBadge tone={tone(e.attendance)}>{label(e.attendance)}</StatusBadge>
                      </li>
                    ))}
                  </ul>
                </Card>
                {r.assessment ? (
                  <Card className="flex flex-col gap-3">
                    <h2 className="text-heading text-navy">
                      {t('owner.record.scores', {
                        title: r.assessment.title,
                        max: num(r.assessment.maxScore, locale),
                      })}
                    </h2>
                    <ul className="flex flex-col gap-2">
                      {scored.map((e) => {
                        const cor = corrected.get(e.id + 'score');
                        return (
                          <li
                            key={e.id}
                            className="flex items-center justify-between gap-2 border-b border-border py-2"
                          >
                            <bdi className="text-body">{e.student.displayName}</bdi>
                            <span className="text-label" data-testid={`score-${e.student.id}`}>
                              {cor ? (
                                <s className="me-2 text-caption text-muted">{val(cor.oldValue)}</s>
                              ) : null}
                              {e.score != null
                                ? `${num(e.score, locale)} / ${num(r.assessment!.maxScore, locale)}`
                                : t('owner.record.absentNoScore')}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                ) : null}
                <Card className="flex flex-col gap-3">
                  <h2 className="text-heading text-navy">{t('owner.record.observations')}</h2>
                  {r.entries.filter((e) => e.observation).length || r.groupObservation ? (
                    <>
                      {r.entries
                        .filter((e) => e.observation)
                        .map((e) => (
                          <div key={e.id} className="rounded-12 bg-soft p-3">
                            <p className="text-label text-navy">
                              <bdi>{e.student.displayName}</bdi>{' '}
                              <StatusBadge tone="neutral">{t('owner.record.internal')}</StatusBadge>
                            </p>
                            <p className="text-body">{e.observation}</p>
                            <p className="text-caption text-muted">
                              {e.source === 'voice'
                                ? t('owner.record.fromVoice')
                                : t('owner.record.fromTap')}{' '}
                              •{' '}
                              {t('owner.record.confirmedBy', {
                                name: r.confirmedBy?.displayName ?? '',
                              })}
                            </p>
                          </div>
                        ))}
                      {r.groupObservation ? (
                        <div className="rounded-12 bg-soft p-3">
                          <p className="text-label text-navy">{t('teacher.review.groupNote')}</p>
                          <p className="text-body">{r.groupObservation}</p>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-body text-muted">{t('owner.record.noObservations')}</p>
                  )}
                </Card>
              </div>
              <div className="flex flex-col gap-6">
                <Card className="flex flex-col gap-3">
                  <h2 className="text-heading text-navy">{t('owner.record.status')}</h2>
                  <ol className="flex flex-col gap-2" data-testid="record-timeline">
                    {r.confirmedAt ? (
                      <li>
                        <p className="text-label text-navy">
                          {t('owner.sessions.statusConfirmed')}
                        </p>
                        <p className="text-caption text-muted">
                          {r.confirmedBy?.displayName} • {dateTime(r.confirmedAt, locale)}
                        </p>
                      </li>
                    ) : null}
                    <li>
                      <p className="text-label text-navy">{t('owner.record.draftCreated')}</p>
                      <p className="text-caption text-muted">{dateTime(r.createdAt, locale)}</p>
                    </li>
                  </ol>
                  {r.signals.length ? (
                    <Callout tone="warning" title={t('owner.record.rulesTriggered')}>
                      {r.signals.map((s) => (
                        <p key={s.id}>
                          <bdi>{s.student.displayName}</bdi> — {s.explanation}
                          {s.caseId ? (
                            <>
                              {' '}
                              →{' '}
                              <Link href={`${base}/follow-ups/${s.caseId}`} className="underline">
                                {t('owner.record.caseOpened')}
                              </Link>
                            </>
                          ) : null}
                        </p>
                      ))}
                    </Callout>
                  ) : (
                    <p className="text-caption text-muted">{t('owner.record.noRules')}</p>
                  )}
                </Card>
                <Card className="flex flex-col gap-3">
                  <h2 className="text-heading text-navy">{t('owner.record.corrections')}</h2>
                  {r.corrections.length ? (
                    r.corrections.map((x) => (
                      <div key={x.id} data-testid={`correction-${x.id}`}>
                        <p className="text-caption text-muted">
                          {dateTime(x.at, locale)} • {x.author.displayName}
                        </p>
                        <p className="text-label text-navy">
                          {t('owner.record.correctionLine', { name: x.student.displayName })}
                        </p>
                        <p className="text-body text-muted">
                          {val(x.oldValue)} → {val(x.newValue)} •{' '}
                          {t('teacher.history.reason', { reason: x.reason })}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-body text-muted">{t('owner.record.noCorrections')}</p>
                  )}
                  <p className="text-caption text-muted">{t('owner.record.originalKept')}</p>
                </Card>
                {r.status === 'confirmed' ? <AskTeacher record={r} /> : null}
              </div>
            </div>
          </>
        );
      }}
    </QueryState>
  );
}

/**
 * CF-34: corrections stay with the teacher. The owner asks — a note that appears on the teacher's
 * Today and closes when the teacher adds a correction to this record (or marks it done).
 */
function AskTeacher({ record }: { record: SessionRecord }) {
  const { locale, t } = useI18n();
  const { session } = useSession();
  const qc = useQueryClient();
  const owner = session?.roles.includes('centre_owner');
  const [studentId, setStudentId] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requests = record.correctionRequests ?? [];
  if (!owner && !requests.length) return null;
  return (
    <Card className="flex flex-col gap-3" data-testid="ask-teacher">
      <h2 className="text-heading text-navy">{t('owner.record.askTitle')}</h2>
      {requests.map((q) => (
        <div key={q.id} className="flex flex-col gap-1">
          <p className="text-caption text-muted">
            {dateTime(q.at, locale)} • {q.requestedBy.displayName}
            {q.student ? ` • ${q.student.displayName}` : ''}
          </p>
          <p className="text-body text-navy">{q.text}</p>
          <StatusBadge tone={q.status === 'open' ? 'warning' : 'success'} className="self-start">
            {q.status === 'open' ? t('owner.record.askOpen') : t('owner.record.askDone')}
          </StatusBadge>
        </div>
      ))}
      {owner ? (
        <>
          <Select
            label={t('owner.record.askStudent')}
            placeholder={t('owner.record.askWholeRecord')}
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            options={record.entries.map((e) => ({
              value: e.student.id,
              label: e.student.displayName,
            }))}
          />
          <Textarea
            label={t('owner.record.askText')}
            value={text}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
            counter={(n, max) => t('common.counter', { n, max })}
            data-testid="ask-text"
          />
          {error ? (
            <Callout tone="error" role="alert">
              {error}
            </Callout>
          ) : null}
          <Button
            className="self-start"
            variant="secondary"
            data-testid="ask-teacher-send"
            disabled={busy || !text.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await ownerApi.requestCorrection(record.id, {
                  studentId: studentId || null,
                  text: text.trim(),
                });
                setText('');
                setStudentId('');
                await qc.invalidateQueries();
              } catch (e) {
                setError(
                  e instanceof ApiError
                    ? (e.problem.detail ?? t('states.error.body'))
                    : t('states.error.body'),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('owner.record.askSend')}
          </Button>
          <p className="text-caption text-muted">{t('owner.record.askNote')}</p>
        </>
      ) : null}
    </Card>
  );
}
