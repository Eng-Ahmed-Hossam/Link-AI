'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, marketApi, type RoomRequest } from '@link/api-client';
import { formatTime } from '@link/i18n';
import { Avatar, Button, Callout, Chip, Textarea, cn } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { QueryState } from '../../parent/QueryState';
import { OwnerPageHeader, dayMonth, num, useCentre } from '../common';
import { daysTimes, ruleText } from './shared';

const COLUMNS = ['requested', 'phone_call', 'meeting', 'approved'] as const;
type Column = (typeof COLUMNS)[number];

/**
 * C06 · Room requests (MKT-HAL-04): Requested → Phone call → Meeting → Approved, one way. "Approve
 * instantly" appears only when every auto-approve rule is met (checked from the data). Approving
 * books the slot (C03 shows it as Booked). Declining asks for a reason.
 */
export function RoomRequests() {
  const { locale, t } = useI18n();
  const { centreId } = useCentre();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['room-requests', centreId, locale],
    queryFn: () => marketApi.centreRequests(centreId),
  });
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['room-requests', centreId] });
    void qc.invalidateQueries({ queryKey: ['schedule', centreId] });
  };

  return (
    <>
      <OwnerPageHeader
        title={t('centre.requests.title')}
        subtitle={t('centre.requests.subtitle')}
      />
      <QueryState query={q} loadingRows={4}>
        {(all) => {
          const open = all.filter((r) => r.stage !== 'declined');
          return (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {COLUMNS.map((col) => {
                  const items = open.filter((r) => r.stage === col);
                  return (
                    <section
                      key={col}
                      aria-labelledby={`col-${col}`}
                      data-testid={`column-${col}`}
                      className="flex flex-col gap-3 rounded-16 bg-soft p-3"
                    >
                      <h2
                        id={`col-${col}`}
                        className="flex items-center justify-between px-1 text-label text-navy"
                      >
                        {t(`centre.requests.col.${col}`)}
                        <span className="text-caption text-muted">{num(items.length, locale)}</span>
                      </h2>
                      {items.length ? (
                        items.map((r) => (
                          <RequestCard key={r.id} r={r} column={col} onDone={done} />
                        ))
                      ) : (
                        <p className="px-1 py-4 text-caption text-muted">
                          {t('centre.requests.empty')}
                        </p>
                      )}
                    </section>
                  );
                })}
              </div>
              <Callout tone="info">{t('centre.requests.note')}</Callout>
            </>
          );
        }}
      </QueryState>
    </>
  );
}

function RequestCard({
  r,
  column,
  onDone,
}: {
  r: RoomRequest;
  column: Column;
  onDone: () => void;
}) {
  const { locale, t } = useI18n();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const act = useMutation({
    mutationFn: (
      a:
        | { kind: 'move'; stage: 'phone_call' | 'meeting' }
        | { kind: 'approve' }
        | { kind: 'decline' },
    ) =>
      a.kind === 'move'
        ? marketApi.moveRequest(r.id, a.stage)
        : a.kind === 'approve'
          ? marketApi.approveRequest(r.id)
          : marketApi.declineRequest(r.id, reason),
    onSuccess: () => {
      setError(null);
      setDeclining(false);
      onDone();
    },
    onError: (e) =>
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : t('states.error.title')),
  });
  const next = column === 'requested' ? 'phone_call' : column === 'phone_call' ? 'meeting' : null;
  const issue = !r.checks.verifiedId
    ? t('centre.requests.idPending')
    : !r.checks.rating
      ? t('centre.requests.ratingBelow')
      : !r.checks.fitsCapacity
        ? t('centre.requests.tooBig')
        : !r.checks.slotFree
          ? t('centre.requests.slotTaken')
          : null;

  return (
    <article
      data-testid={`request-${r.id}`}
      className="flex flex-col gap-2 rounded-12 border border-border bg-white p-3 shadow-card"
    >
      <div className="flex items-center gap-2">
        <Avatar name={r.teacher.name} size="sm" tone="blue" />
        <div className="min-w-0 flex-1">
          <h3 className="text-label text-navy">
            <bdi>{r.teacher.name}</bdi>
          </h3>
          <p className="text-caption text-muted">
            {r.teacher.isNew || r.teacher.rating === null
              ? t('centre.requests.newToLink')
              : t('centre.requests.rating', {
                  rating: num(r.teacher.rating, locale),
                  count: r.teacher.reviewCount,
                  n: num(r.teacher.reviewCount, locale),
                })}
          </p>
        </div>
      </div>
      <p className="text-caption text-navy">
        {r.subject} • {r.schoolYear} • {r.hall.name}
      </p>
      <p className="text-caption text-muted">
        {daysTimes(r.weekdays, r.start, r.end, locale)} •{' '}
        {t('centre.requests.students', {
          count: r.expectedStudents,
          n: num(r.expectedStudents, locale),
        })}
      </p>
      {column === 'approved' ? (
        <Chip tone="success" className="h-auto whitespace-normal">
          {t('centre.requests.startsRent', {
            date: dayMonth(r.startsOn, locale),
            rule: ruleText(r.rentRule, t, locale),
          })}
        </Chip>
      ) : column === 'requested' ? (
        r.meetsRules ? (
          <Chip tone="success" className="whitespace-normal">
            {t('centre.requests.meetsRules')}
          </Chip>
        ) : issue ? (
          <Chip tone="warning">{issue}</Chip>
        ) : null
      ) : r.stageAt ? (
        <Chip tone="info">
          {t(column === 'phone_call' ? 'centre.requests.callAt' : 'centre.requests.meetingAt', {
            when: `${dayMonth(r.stageAt.slice(0, 10), locale)} ${formatTime(r.stageAt, locale)}`,
          })}
        </Chip>
      ) : null}
      {column !== 'approved' ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {column === 'requested' && r.meetsRules ? (
            <Button
              className="min-h-11 px-3"
              onClick={() => act.mutate({ kind: 'approve' })}
              disabled={act.isPending}
              data-testid={`approve-instantly-${r.id}`}
            >
              {t('centre.requests.approveInstantly')}
            </Button>
          ) : column !== 'requested' ? (
            <Button
              className="min-h-11 px-3"
              onClick={() => act.mutate({ kind: 'approve' })}
              disabled={act.isPending || !r.checks.slotFree}
              data-testid={`approve-${r.id}`}
            >
              {t('centre.requests.approve')}
            </Button>
          ) : null}
          {next ? (
            <Button
              className="min-h-11 px-3"
              variant="secondary"
              onClick={() => act.mutate({ kind: 'move', stage: next })}
              disabled={act.isPending}
              data-testid={`move-${r.id}`}
            >
              {t(next === 'phone_call' ? 'centre.requests.toCall' : 'centre.requests.toMeeting')}
            </Button>
          ) : null}
          <button
            type="button"
            className={cn('inline-flex min-h-11 items-center px-2 text-caption text-red underline')}
            onClick={() => setDeclining((v) => !v)}
            aria-expanded={declining}
          >
            {t('centre.requests.decline')}
          </button>
        </div>
      ) : null}
      {declining ? (
        <div className="flex flex-col gap-2">
          <Textarea
            label={t('centre.requests.reason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            counter={(n, max) => t('common.counter', { n, max })}
            rows={2}
          />
          <Button
            className="min-h-11 px-3"
            variant="secondary"
            onClick={() => act.mutate({ kind: 'decline' })}
            disabled={act.isPending || !reason.trim()}
            data-testid={`decline-${r.id}`}
          >
            {t('centre.requests.sendDecline')}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-caption text-red">
          {error}
        </p>
      ) : null}
    </article>
  );
}
