'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiUrl, useEnrolment, type Enrolment } from '@link/api-client';
import { formatCountdown } from '@link/i18n';
import {
  Button,
  Callout,
  Card,
  Countdown,
  ErrorState,
  LoadingState,
  Sheet,
  SummaryRow,
  Timeline,
  useSecondsLeft,
  useToast,
  type TimelineStep,
} from '@link/ui';
import { useI18n } from '../../i18n-client';
import { icsFor, longDate, money, shortDate, time } from '../format';

/** P08 · Place reserved (MKT-ENR-06, MKT-ENR-04). Status comes from the server, never the redirect. */
export function P08Done({ id }: { id: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const q = useEnrolment(id, {
    // Poll while the webhook has not landed yet ("Confirming…").
    refetchInterval: (query) => (query.state.data?.status === 'pending_payment' ? 1500 : false),
  });
  const e = q.data;

  useEffect(() => {
    if (e?.status === 'pending_payment' && e.lastPaymentFailed)
      router.replace(`/${locale}/reserve/${e.id}`);
  }, [e, locale, router]);

  if (q.isPending) return <LoadingState label={t('states.loading.label')} rows={3} />;
  if (q.isError || !e)
    return (
      <ErrorState
        title={t('states.error.title')}
        body={q.error?.isNetwork ? t('states.offline.body') : t('states.error.body')}
        action={
          <Button variant="secondary" onClick={() => q.refetch()}>
            {t('common.retry')}
          </Button>
        }
      />
    );

  if (e.status === 'pending_payment' && e.fawry) return <FawryPending e={e} />;
  if (e.status === 'pending_payment')
    return (
      <Card
        padding="lg"
        className="flex flex-col items-center gap-3 text-center"
        role="status"
        aria-live="polite"
      >
        <span
          aria-hidden
          className="size-12 animate-spin rounded-full border-4 border-blueSoft border-t-blue"
        />
        <h1 className="text-title text-navy">{t('parent.done.confirming')}</h1>
        <p className="text-body text-muted">{t('parent.done.confirmingBody')}</p>
      </Card>
    );
  if (e.status === 'expired' || e.status === 'cancelled')
    return (
      <ErrorState
        title={t(e.status === 'expired' ? 'parent.pay.expiredTitle' : 'parent.status.cancelled')}
        body={t('parent.pay.expiredBody')}
        action={
          <Link
            href={`/${locale}/teachers/${e.group.teacher.slug}/reserve?group=${e.group.id}`}
            className="text-label text-blueText"
          >
            {t('parent.pay.startAgain')}
          </Link>
        }
      />
    );
  return <Reserved e={e} />;
}

function Reserved({ e }: { e: Enrolment }) {
  const { locale, t } = useI18n();
  const [dirOpen, setDirOpen] = useState(false);
  const waiting = e.status === 'awaiting_teacher';
  const childFirst = e.student.displayName.split(' ')[0] ?? '';
  const teacher = e.group.teacher.displayName;

  const steps: TimelineStep[] = [
    {
      id: 'paid',
      state: 'done',
      stateLabel: t('parent.done.state.done'),
      title: t('parent.done.step.paid'),
      detail: e.payment
        ? `${shortDate(e.payment.paidAt, locale)} • ${time(e.payment.paidAt, locale)}`
        : undefined,
    },
    {
      id: 'shared',
      state: 'done',
      stateLabel: t('parent.done.state.done'),
      title: t('parent.done.step.shared', { name: teacher }),
      detail: e.phoneShared
        ? t('parent.done.step.sharedWithPhone')
        : t('parent.done.step.sharedNoPhone'),
    },
    // OD-08: only when the teacher reviews each enrolment.
    ...(e.teacherReviewsEnrolments
      ? [
          {
            id: 'teacher',
            state: (waiting ? 'current' : 'done') as TimelineStep['state'],
            stateLabel: waiting ? t('parent.done.state.current') : t('parent.done.state.done'),
            title: t('parent.done.step.teacherConfirms', { name: teacher }),
            detail: t('parent.done.step.teacherConfirmsDetail'),
          },
        ]
      : []),
    {
      id: 'first',
      state: 'upcoming',
      stateLabel: t('parent.done.state.next'),
      title: t('parent.done.step.first'),
      detail: `${shortDate(e.firstSession.startsAt, locale)} • ${time(e.firstSession.startsAt, locale)} • ${e.group.centre.address}`,
    },
  ];

  const ics = () => {
    const blob = new Blob(
      [
        icsFor({
          uid: e.id,
          title: `${e.group.subject.name} — ${teacher}`,
          startsAt: e.firstSession.startsAt,
          endsAt: e.group.upcomingSessions[0]?.endsAt ?? e.firstSession.startsAt,
          location: `${e.group.centre.name}, ${e.group.centre.address}`,
        }),
      ],
      { type: 'text/calendar' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `link-${e.reference}.ics`;
    a.click();
  };

  return (
    <>
      <section
        className="flex flex-col items-center gap-3 rounded-24 border border-border bg-white px-5 pb-6 pt-7 text-center shadow-raised"
        aria-live="polite"
      >
        <span
          aria-hidden
          className="flex size-22 items-center justify-center rounded-full bg-greenSoft"
        >
          <span className="flex size-15 items-center justify-center rounded-full bg-green text-title text-white">
            ✓
          </span>
        </span>
        <h1 className="text-title text-navy">
          {waiting ? t('parent.done.paidTitle') : t('parent.done.title')}
        </h1>
        <p className="text-body text-muted">
          {t(waiting ? 'parent.done.bodyWaiting' : 'parent.done.body', {
            child: childFirst,
            teacher,
            subject: e.group.subject.name,
            centre: e.group.centre.name,
            room: e.group.room.name,
            date: longDate(e.firstSession.startsAt, locale),
            time: time(e.firstSession.startsAt, locale),
          })}
        </p>
      </section>

      <Card>
        <dl className="flex flex-col gap-2">
          <SummaryRow
            label={t('parent.done.reference')}
            value={<bdi dir="ltr">{e.reference}</bdi>}
          />
          {e.payment ? (
            <SummaryRow
              label={t('parent.done.paid')}
              value={`${t('parent.done.paidTo', { amount: money(e.payment.amount, locale), name: teacher })}${e.payment.cardLast4 ? ` • ${t('parent.done.cardEnding', { last4: e.payment.cardLast4 })}` : ` • ${t(`parent.pay.methods.${e.payment.method}`)}`}`}
            />
          ) : null}
          {e.plan === 'monthly_recurring' && e.renewsOn ? (
            <SummaryRow
              label={t('parent.done.monthlyPlan')}
              value={t('parent.done.renews', { date: shortDate(e.renewsOn, locale) })}
            />
          ) : null}
        </dl>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-label text-navy">{t('parent.done.next')}</h2>
        <Timeline steps={steps} />
      </Card>

      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={ics}>
          {t('parent.done.calendar')}
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => setDirOpen(true)}>
          {t('parent.done.directions')}
        </Button>
      </div>
      <Link
        href={`/${locale}/children`}
        className="inline-flex min-h-12 items-center justify-center rounded-12 text-label text-navy hover:bg-soft"
      >
        {t('parent.done.toChildren')}
      </Link>

      <Sheet
        open={dirOpen}
        onOpenChange={setDirOpen}
        title={t('parent.done.directions')}
        closeLabel={t('common.close')}
      >
        <p className="text-body text-navy">
          <bdi>{e.group.centre.name}</bdi> — {e.group.centre.address}
        </p>
        {/* Maps provider is OD-46; until then we show the address only. */}
        <p className="text-caption text-muted">{t('parent.done.directionsPlaceholder')}</p>
      </Sheet>
    </>
  );
}

/** MKT-ENR-04: Fawry reference + 24 h expiry. The seat stays held until the code expires. */
function FawryPending({ e }: { e: Enrolment }) {
  const { locale, t } = useI18n();
  const toast = useToast();
  const left = useSecondsLeft(e.fawry!.expiresAt);
  const ref = e.fawry!.reference;
  const pretty = `${ref.slice(0, 4)} ${ref.slice(4)}`;
  return (
    <>
      <section className="flex flex-col items-center gap-3 rounded-24 border border-border bg-white px-5 pb-6 pt-7 text-center shadow-raised">
        <h1 className="text-title text-navy">{t('parent.fawry.title')}</h1>
        <p className="text-body text-muted">
          {t('parent.fawry.body', { amount: money(e.price, locale) })}
        </p>
        <p className="text-caption text-muted">{t('parent.fawry.codeLabel')}</p>
        <p className="text-display text-navy" aria-label={ref.split('').join(' ')}>
          <bdi dir="ltr">{pretty}</bdi>
        </p>
        <div className="flex w-full gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(ref);
                toast(t('parent.fawry.copied'));
              } catch {
                toast(t('states.error.title'));
              }
            }}
          >
            {t('parent.fawry.copy')}
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() =>
              navigator
                .share?.({
                  text: t('parent.fawry.shareText', { code: ref, amount: money(e.price, locale) }),
                })
                .catch(() => {})
            }
          >
            {t('parent.fawry.share')}
          </Button>
        </div>
      </section>
      <Callout tone="info" role="status" title={t('parent.fawry.heldTitle')}>
        <span>
          {t('parent.fawry.validUntil', {
            date: `${shortDate(e.fawry!.expiresAt, locale)} • ${time(e.fawry!.expiresAt, locale)}`,
          })}{' '}
          {left != null ? (
            <>
              (
              <Countdown
                seconds={left}
                format={(s) => formatCountdown(s, locale)}
                label={t('parent.pay.holdTimer')}
              />
              )
            </>
          ) : null}
        </span>
      </Callout>
      <Callout tone="neutral">{t('parent.fawry.after')}</Callout>
      {process.env.NODE_ENV !== 'production' ? (
        <Button
          variant="secondary"
          onClick={() => fetch(apiUrl(`/__mock/fawry/${e.id}/pay`), { method: 'POST' })}
          lang="en"
        >
          Simulate payment at a Fawry outlet (mock)
        </Button>
      ) : null}
    </>
  );
}
