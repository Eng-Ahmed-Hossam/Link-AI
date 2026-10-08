'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ownerApi,
  marketApi,
  api,
  ApiError,
  queryKeys,
  useMe,
  useMyEnrolments,
  type Child,
  type Enrolment,
} from '@link/api-client';
import { formatDate } from '@link/i18n';
import {
  Avatar,
  Button,
  Callout,
  Card,
  EmptyState,
  PageTitle,
  Sheet,
  StatusBadge,
  Textarea,
  cn,
  useToast,
} from '@link/ui';
import { useI18n } from '../../i18n-client';
import { useFlag } from '../../flags';
import { QueryState } from '../QueryState';
import { ChildSheet } from '../ChildSheet';
import { useSelectedChild } from '../search-context';
import { enrolmentTone, money, refundTone, scheduleLabel, shortDate, time } from '../format';

/**
 * P09 · My children (MKT-ENR-07, MKT-ENR-08). The updates feed is behind `parent.updates_feed` and
 * shows only when a child's centre has the Follow-up extra (OD-58).
 */
export function P09Children() {
  const { t } = useI18n();
  const me = useMe();
  const { child, children, setChildId, query: kids } = useSelectedChild();
  const enrolments = useMyEnrolments();
  const feedFlag = useFlag('parent.updates_feed');
  const extra = useQuery({
    queryKey: ['parent-features'],
    queryFn: marketApi.parentFeatures,
    enabled: feedFlag,
  });
  const feedOn = feedFlag && extra.data?.followupExtra === true;
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <PageTitle context={me.data?.name ?? ' '} title={t('parent.nav.children')} />
      <QueryState
        query={kids}
        isEmpty={(d) => d.data.length === 0}
        empty={
          <EmptyState
            title={t('parent.children.emptyTitle')}
            body={t('parent.children.emptyBody')}
            action={<Button onClick={() => setAddOpen(true)}>{t('parent.child.add')}</Button>}
          />
        }
      >
        {() => (
          <>
            <div
              role="group"
              aria-label={t('parent.children.pick')}
              className="-mx-5 flex gap-2 overflow-x-auto px-5"
            >
              {children.map((c) => {
                const on = c.id === child?.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setChildId(c.id)}
                    className={cn(
                      'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full py-1.5 pe-3 ps-2 text-caption',
                      on ? 'bg-navy text-white' : 'border border-border bg-white text-navy',
                    )}
                  >
                    <Avatar name={c.displayName} size="xs" tone={on ? 'blue' : 'green'} />
                    <bdi>{c.displayName.split(' ')[0]}</bdi> • {c.schoolYear.shortName}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-border bg-white px-3 text-caption text-navy"
              >
                + {t('parent.child.add')}
              </button>
            </div>
            {child ? (
              <QueryState query={enrolments} loadingRows={2}>
                {(d) => (
                  <ChildEnrolments
                    child={child}
                    enrolments={d.data.filter((e) => e.student.id === child.id)}
                    feedOn={feedOn}
                  />
                )}
              </QueryState>
            ) : null}
          </>
        )}
      </QueryState>
      <ChildSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        children={children}
        selectedId={child?.id ?? null}
        onSelect={setChildId}
        startWithAdd
      />
    </>
  );
}

function ChildEnrolments({
  child,
  enrolments,
  feedOn,
}: {
  child: Child;
  enrolments: Enrolment[];
  feedOn: boolean;
}) {
  const { locale, t } = useI18n();
  const live = enrolments.filter((e) =>
    ['pending_payment', 'awaiting_teacher', 'confirmed', 'past_due'].includes(e.status),
  );
  const recent = enrolments.filter(
    (e) => !live.includes(e) && (e.refund || e.status === 'declined'),
  );
  const first = child.displayName.split(' ')[0] ?? '';
  const marketplace = useFlag('marketplace.enabled');
  // CF-39: with the marketplace off (the follow-up pilot), only the child's groups at the centre.
  if (!marketplace)
    return (
      <>
        <CentreGroups childId={child.id} />
        {feedOn ? <UpdatesFeed childId={child.id} /> : null}
      </>
    );
  return (
    <>
      {[...live, ...recent].map((e) => (
        <EnrolmentCard key={e.id} e={e} />
      ))}
      {live.length === 0 ? (
        // MKT-ENR-07 AC3
        <div className="flex items-center gap-3 rounded-12 bg-soft px-4 py-3 text-caption">
          <p className="min-w-0 flex-1 text-muted">
            {t('parent.children.notEnrolled', { name: first })}
          </p>
          <Link
            href={`/${locale}/search`}
            className="inline-flex min-h-11 items-center text-blueText"
          >
            {t('parent.children.findTeacher')}{' '}
            <span aria-hidden className="ms-1 rtl:-scale-x-100">
              ›
            </span>
          </Link>
        </div>
      ) : null}
      {feedOn ? <UpdatesFeed childId={child.id} /> : null}
    </>
  );
}

function EnrolmentCard({ e }: { e: Enrolment }) {
  const { locale, t } = useI18n();
  const [manage, setManage] = useState(false);
  const started = e.firstSessionStarted;
  const nextSession = e.group.upcomingSessions.find((s) => e.sessionIds.includes(s.id)) ?? null;
  const shown = started ? nextSession : { startsAt: e.firstSession.startsAt };
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Avatar name={e.group.centre.name} tone="navy" square />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-label text-navy">
            {e.group.subject.name} • <bdi>{e.group.teacher.displayName}</bdi>
          </span>
          <span className="text-caption text-muted">
            {t('parent.pay.where', { centre: e.group.centre.name, room: e.group.room.name })} •{' '}
            {scheduleLabel(e.group, locale)}
          </span>
        </div>
        {/* Enrolment status: one of the 8 states (08 §4). */}
        <StatusBadge tone={enrolmentTone[e.status]}>{t(`parent.status.${e.status}`)}</StatusBadge>
      </div>

      {/* Refund status is separate from the enrolment status (MKT-ENR-08, BR-ENR-14). */}
      {e.refund ? (
        <div className="flex items-center gap-2 rounded-12 border border-border px-3 py-2">
          <span className="min-w-0 flex-1 text-caption text-navy">
            {t('parent.refund.label', { amount: money(e.refund.amount, locale) })}
          </span>
          <StatusBadge tone={refundTone[e.refund.status]}>
            {t(`parent.refund.${e.refund.status}`)}
          </StatusBadge>
        </div>
      ) : null}

      {shown &&
      ['confirmed', 'awaiting_teacher', 'past_due', 'pending_payment'].includes(e.status) ? (
        <div className="flex items-center gap-3 rounded-12 bg-blueSoft p-3">
          <div className="flex flex-col items-center rounded-8 bg-white px-2 py-1">
            <span className="text-caption uppercase text-blueText">
              {formatDate(shown.startsAt, locale, { weekday: 'short' })}
            </span>
            <span className="text-heading text-navy">
              {formatDate(shown.startsAt, locale, { day: 'numeric' })}
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-label text-navy">
              {started ? t('parent.children.nextSession') : t('parent.done.step.first')}
            </span>
            <span className="text-caption text-blueText">
              {time(shown.startsAt, locale)} • {e.group.centre.address}
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-caption">
        <p className="min-w-0 flex-1 text-muted">
          {e.plan === 'monthly_recurring'
            ? e.renewsOn
              ? t('parent.children.planRenews', { date: shortDate(e.renewsOn, locale) })
              : t('parent.children.planStopped')
            : t(`parent.children.plan.${e.plan}`)}
          {e.payment?.cardLast4
            ? ` • ${t('parent.done.cardEnding', { last4: e.payment.cardLast4 })}`
            : ''}
        </p>
        {['confirmed', 'awaiting_teacher', 'pending_payment', 'past_due'].includes(e.status) ? (
          <Button variant="quiet" onClick={() => setManage(true)}>
            {t('parent.children.manage')}
          </Button>
        ) : null}
      </div>

      {e.status === 'pending_payment' ? (
        <Link href={`/${locale}/reserve/${e.id}`} className="text-label text-blueText">
          {t('parent.children.finishPayment')}
        </Link>
      ) : null}

      {e.canReview ? (
        <Link
          href={`/${locale}/enrolments/${e.id}/feedback`}
          className="inline-flex min-h-12 items-center justify-center rounded-12 border border-border bg-white text-label text-navy shadow-subtle"
        >
          {t('parent.children.leaveFeedback')}
        </Link>
      ) : null}

      <ManageSheet e={e} open={manage} onOpenChange={setManage} />
    </Card>
  );
}

/** MKT-ENR-07 AC2: stop the monthly plan (BR-PMT-05) or cancel the enrolment (MKT-ENR-08). */
function ManageSheet({
  e,
  open,
  onOpenChange,
}: {
  e: Enrolment;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { locale, t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState<null | 'plan' | 'cancel' | 'dispute'>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: queryKeys.myEnrolments });
      toast(done);
      setConfirm(null);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof ApiError && err.isNetwork
          ? t('states.offline.body')
          : t('states.error.body'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('parent.children.manage')}
      closeLabel={t('common.close')}
    >
      {confirm === null ? (
        <div className="flex flex-col gap-3">
          {e.plan === 'monthly_recurring' && e.renewsOn ? (
            <Button variant="secondary" onClick={() => setConfirm('plan')}>
              {t('parent.manage.stopPlan')}
            </Button>
          ) : null}
          {!e.firstSessionStarted ? (
            <Button variant="secondary" danger onClick={() => setConfirm('cancel')}>
              {t('parent.manage.cancel')}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setConfirm('dispute')}>
              {t('parent.manage.askRefund')}
            </Button>
          )}
        </div>
      ) : confirm === 'plan' ? (
        <div className="flex flex-col gap-3">
          <Callout tone="info">
            {t('parent.manage.stopPlanBody', {
              date: e.renewsOn ? shortDate(e.renewsOn, locale) : '',
            })}
          </Callout>
          <Button
            disabled={busy}
            onClick={() => run(() => api.cancelPlan(e.id), t('parent.manage.stopPlanDone'))}
          >
            {t('parent.manage.stopPlanConfirm')}
          </Button>
        </div>
      ) : confirm === 'cancel' ? (
        <div className="flex flex-col gap-3">
          <Callout tone="warning">
            {e.status === 'pending_payment'
              ? t('parent.manage.cancelUnpaid')
              : t('parent.manage.cancelBody')}
          </Callout>
          <Button
            variant="secondary"
            danger
            disabled={busy}
            onClick={() => run(() => api.cancelEnrolment(e.id), t('parent.manage.cancelDone'))}
          >
            {t('parent.manage.cancelConfirm')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Callout tone="info">{t('parent.manage.disputeBody')}</Callout>
          <Textarea
            label={t('parent.manage.reason')}
            value={reason}
            maxLength={600}
            onChange={(ev) => setReason(ev.target.value)}
            counter={(n, max) => t('common.counter', { n, max })}
          />
          <Button
            disabled={busy || !reason.trim()}
            onClick={() =>
              run(() => api.refundRequest(e.id, reason.trim()), t('parent.manage.disputeDone'))
            }
          >
            {t('parent.manage.disputeSend')}
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-caption text-red">
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}

/**
 * P09 "Updates from the centre" (FUP-MSG-08, Phase 2): approved messages only. Confirmed attendance
 * in the feed is a per-centre setting, off by default (OD-41), so it is not shown.
 */
function UpdatesFeed({ childId }: { childId: string }) {
  const { locale, t } = useI18n();
  const q = useQuery({
    queryKey: ['parent-updates', locale],
    queryFn: ownerApi.parentUpdates,
    refetchInterval: 4000,
  });
  const items = (q.data?.data ?? []).filter((u) => u.studentId === childId);
  return (
    <section
      aria-labelledby="updates-title"
      className="flex flex-col gap-2"
      data-testid="updates-feed"
    >
      <h2 id="updates-title" className="text-caption uppercase text-muted">
        {t('parent.children.updates')}
      </h2>
      <QueryState query={q} loadingRows={1}>
        {() =>
          items.length ? (
            <Card className="flex flex-col gap-4">
              {items.map((u) => (
                <div key={u.id} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-12 bg-blueSoft"
                  >
                    <span className="size-2 rounded-full bg-blueText" />
                  </span>
                  <div className="flex flex-col gap-1">
                    <p className="text-label text-navy">{t('parent.children.updateMessage')}</p>
                    <p dir="rtl" lang="ar" className="text-body text-navy">
                      {u.text}
                    </p>
                    <p className="text-caption text-muted">
                      {u.from} • {formatDate(u.at, locale, { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                </div>
              ))}
            </Card>
          ) : (
            <p className="rounded-12 bg-soft px-4 py-3 text-caption text-muted">
              {t('parent.children.noUpdates')}
            </p>
          )
        }
      </QueryState>
    </section>
  );
}

/** CF-39: the child's follow-up groups at the centre (name, teacher, weekly time). */
function CentreGroups({ childId }: { childId: string }) {
  const { locale, t } = useI18n();
  const q = useQuery({ queryKey: ['centre-groups', locale], queryFn: ownerApi.centreGroups });
  return (
    <QueryState query={q} loadingRows={1}>
      {(all) => {
        const mine = all.filter((g) => g.childId === childId);
        if (!mine.length)
          return <p className="text-body text-muted">{t('parent.children.noCentreGroup')}</p>;
        return (
          <>
            {mine.map((g) => (
              <Card
                key={g.groupId}
                className="flex flex-col gap-1"
                data-testid={`centre-group-${g.groupId}`}
              >
                <p className="text-label text-navy">{g.groupName}</p>
                <p className="text-caption text-muted">
                  {g.centreName} • {g.teacher.displayName}
                </p>
                <p className="text-caption text-muted">
                  {weekdays(g.weekdays, locale)} • {g.startTime}–{g.endTime}
                </p>
              </Card>
            ))}
          </>
        );
      }}
    </QueryState>
  );
}

const weekdays = (days: number[], locale: 'ar' | 'en') => {
  const fmt = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    weekday: 'long',
    timeZone: 'UTC',
  });
  // 2024-01-01 was a Monday (ISO weekday 1).
  return days
    .map((d) => fmt.format(new Date(Date.UTC(2024, 0, d))))
    .join(locale === 'ar' ? ' و' : ' & ');
};
