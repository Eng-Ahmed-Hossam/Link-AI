'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  api,
  ApiError,
  METHODS_FOR_PLAN,
  newIdempotencyKey,
  useEnrolment,
  useGroup,
  useChildren,
  type PaymentMethod,
  type PaymentPlan,
} from '@link/api-client';
import { addMonthIso } from '../dates';
import { formatCountdown, formatNumber } from '@link/i18n';
import {
  Avatar,
  Button,
  Callout,
  Card,
  Checkbox,
  Countdown,
  ErrorState,
  LoadingState,
  PageTitle,
  RadioCards,
  SummaryRow,
  useSecondsLeft,
} from '@link/ui';
import { useI18n } from '../../i18n-client';
import { money, scheduleLabel, shortDate } from '../format';
import { readDraft, type ReserveDraft } from '../reserve-draft';

/**
 * P07 · Reserve & pay (MKT-ENR-02…05). Before Pay the route holds a draft id; Pay creates the
 * hold (POST /v1/enrolments, Idempotency-Key) and the URL switches to the enrolment id.
 * Card data never touches Link: card and wallet go to the provider's hosted page (BR-MNY-06).
 */
export function P07ReservePay({ id }: { id: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const isDraft = id.startsWith('draft-');
  const [draft, setDraft] = useState<ReserveDraft | null | undefined>(undefined);
  useEffect(() => setDraft(isDraft ? readDraft(id) : null), [id, isDraft]);

  const enrolment = useEnrolment(isDraft ? undefined : id, { refetchInterval: 5000 });
  const e = enrolment.data;
  const groupId = draft?.groupId ?? e?.group.id;
  const groupQ = useGroup(groupId);
  const g = groupQ.data ?? e?.group;
  const kids = useChildren();
  const child =
    kids.data?.data.find((c) => c.id === (draft?.studentId ?? e?.student.id)) ?? e?.student;
  const firstSessionId = draft?.firstSessionId ?? e?.firstSession.id;
  const firstSession =
    g?.upcomingSessions.find((s) => s.id === firstSessionId) ??
    (e
      ? { ...e.firstSession, endsAt: e.firstSession.startsAt, seatsLeft: 1, seatCap: 1 }
      : undefined);

  const [plan, setPlan] = useState<PaymentPlan>('single_month');
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [sharePhone, setSharePhone] = useState(false); // AC4: unticked by default
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ startsAt: string } | null>(null);
  const attemptKey = useRef<string | null>(null);

  useEffect(() => {
    if (g && isDraft) setPlan(g.offersMonthlyRecurring ? 'monthly_recurring' : 'single_month');
  }, [g?.id]);
  useEffect(() => {
    if (e) {
      setPlan(e.plan);
      setSharePhone(e.phoneShared);
      if (e.status === 'confirmed' || e.status === 'awaiting_teacher')
        router.replace(`/${locale}/reserve/${e.id}/done`);
    }
  }, [e?.status]);
  useEffect(() => {
    if (!METHODS_FOR_PLAN[plan].includes(method)) setMethod('card');
  }, [plan, method]);

  // Sessions this plan would cover (BR-ENR-13), to name a full one before Pay (AC7).
  const covered = useMemo(() => {
    if (!g || !firstSession) return [];
    if (plan === 'per_session') return g.upcomingSessions.filter((s) => s.id === firstSession.id);
    const end = addMonthIso(firstSession.startsAt);
    return g.upcomingSessions.filter(
      (s) => s.startsAt >= firstSession.startsAt && s.startsAt < end,
    );
  }, [g, firstSession, plan]);
  const fullCovered = isDraft ? covered.find((s) => s.seatsLeft <= 0) : undefined;
  const fullSession = conflict ?? (fullCovered ? { startsAt: fullCovered.startsAt } : null);

  const holdLeft = useSecondsLeft(e?.status === 'pending_payment' ? e.holdExpiresAt : null);
  const price = g ? (plan === 'per_session' ? g.sessionFee : g.monthlyFee) : null;

  if (
    draft === undefined ||
    (isDraft && !draft) ||
    groupQ.isPending ||
    (!isDraft && enrolment.isPending)
  ) {
    if (isDraft && draft === null) {
      return (
        <ErrorState
          title={t('parent.pay.draftMissingTitle')}
          body={t('parent.pay.draftMissingBody')}
          action={
            <Link href={`/${locale}/search`} className="text-label text-blueText">
              {t('parent.nav.search')}
            </Link>
          }
        />
      );
    }
    return <LoadingState label={t('states.loading.label')} rows={4} />;
  }
  if (!g || !child || !firstSession) {
    return (
      <ErrorState
        title={t('states.error.title')}
        body={
          enrolment.error?.isNetwork || groupQ.error?.isNetwork
            ? t('states.offline.body')
            : t('states.error.body')
        }
        action={
          <Button variant="secondary" onClick={() => (enrolment.refetch(), groupQ.refetch())}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  }

  const teacherFirst = g.teacher.displayName;
  const expired = e?.status === 'expired' || (e?.status === 'pending_payment' && holdLeft === 0);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      let enrolmentId = e?.id;
      if (!enrolmentId) {
        const created = await api.createEnrolment(
          plan === 'per_session'
            ? {
                groupId: g!.id,
                studentId: child!.id,
                paymentPlan: plan,
                sessionId: firstSession!.id,
                sharePhone,
              }
            : {
                groupId: g!.id,
                studentId: child!.id,
                paymentPlan: plan,
                firstSessionId: firstSession!.id,
                sharePhone,
              },
          draft!.enrolmentKey,
        );
        enrolmentId = created.id;
        router.replace(`/${locale}/reserve/${enrolmentId}`, { scroll: false });
      }
      // A new attempt gets a new key (07: /checkout may be called again after a failed attempt).
      attemptKey.current ??= newIdempotencyKey();
      const c = await api.checkout(enrolmentId, method, attemptKey.current);
      attemptKey.current = null;
      // The provider's hosted page: another site in live mode (fake-pay), a route of ours in mock.
      if (c.kind === 'redirect')
        if (/^https?:\/\//.test(c.checkoutUrl)) window.location.assign(c.checkoutUrl);
        else router.push(`/${locale}${c.checkoutUrl}`);
      else router.push(`/${locale}/reserve/${enrolmentId}/done`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'seat_unavailable') {
        const s = err.problem.errors?.[0];
        setConflict({ startsAt: String(s?.startsAt ?? '') });
      } else if (err instanceof ApiError && err.code === 'hold_expired') {
        enrolment.refetch();
      } else {
        setError(
          err instanceof ApiError && err.isNetwork
            ? t('states.offline.body')
            : t('states.error.body'),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  const planOptions = [
    ...(g.offersMonthlyRecurring
      ? [
          {
            value: 'monthly_recurring',
            title: t('parent.pay.plan.monthly', { name: teacherFirst }),
            description: t('parent.pay.plan.monthlyDesc', {
              day: formatNumber(new Date(firstSession.startsAt).getUTCDate(), locale),
            }),
          },
        ]
      : []),
    {
      value: 'single_month',
      title: t('parent.pay.plan.single'),
      description: t('parent.pay.plan.singleDesc', {
        from: shortDate(firstSession.startsAt, locale),
        to: shortDate(
          new Date(new Date(addMonthIso(firstSession.startsAt)).getTime() - 86400000).toISOString(),
          locale,
        ),
      }),
    },
    {
      value: 'per_session',
      title: t('parent.pay.plan.perSession', { fee: money(g.sessionFee, locale) }),
      description: t('parent.pay.plan.perSessionDesc', {
        date: shortDate(firstSession.startsAt, locale),
      }),
    },
  ];

  const allowed = METHODS_FOR_PLAN[plan];
  const methodBadge = (label: string) => (
    <span
      aria-hidden
      className="flex h-7 w-10 shrink-0 items-center justify-center rounded-8 bg-soft text-caption text-navy"
    >
      {label}
    </span>
  );

  return (
    <>
      <PageTitle
        context={`${t('common.stepOf', { current: 2, total: 2 })} • ${t('parent.pay.secure')}`}
        title={t('parent.pay.title')}
      />

      <Card className="flex items-center gap-3">
        <Avatar name={g.teacher.displayName} tone="navy" square />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-label text-navy">
            <bdi>{g.teacher.displayName}</bdi> • {g.subject.name} {g.schoolYear.shortName}
          </span>
          <span className="text-caption text-muted">
            {t('parent.pay.where', { centre: g.centre.name, room: g.room.name })} •{' '}
            {scheduleLabel(g, locale)} •{' '}
            {t('parent.pay.fromDate', { date: shortDate(firstSession.startsAt, locale) })}
          </span>
          <span className="text-caption text-muted">
            {t('parent.reserve.forChild')} <bdi>{child.displayName}</bdi>
          </span>
        </div>
      </Card>

      {e?.status === 'pending_payment' && holdLeft ? (
        <Callout tone="info" role="status" title={t('parent.pay.held')}>
          <span>
            {t('parent.pay.heldFor')}{' '}
            <Countdown
              seconds={holdLeft}
              format={(s) => formatCountdown(s, locale)}
              label={t('parent.pay.holdTimer')}
            />
          </span>
        </Callout>
      ) : null}
      {e?.lastPaymentFailed && !expired ? (
        <Callout tone="error" role="alert" title={t('parent.pay.failedTitle')}>
          {t('parent.pay.failedBody')}
        </Callout>
      ) : null}
      {expired ? (
        <Callout tone="warning" role="alert" title={t('parent.pay.expiredTitle')}>
          <span>{t('parent.pay.expiredBody')}</span>
          <Link
            href={`/${locale}/teachers/${g.teacher.slug}/reserve?group=${g.id}`}
            className="mt-2 inline-flex min-h-11 items-center text-label text-navy underline"
          >
            {t('parent.pay.startAgain')}
          </Link>
        </Callout>
      ) : null}

      <h2 className="text-label text-navy">{t('parent.pay.howToPay')}</h2>
      <RadioCards
        label={t('parent.pay.howToPay')}
        value={plan}
        onValueChange={(v) => {
          setPlan(v as PaymentPlan);
          setConflict(null);
        }}
        options={planOptions.map((o) => ({ ...o, disabled: !isDraft && o.value !== plan }))}
      />

      {fullSession ? (
        // MKT-ENR-02 AC7: name the full session and offer the waitlist.
        <Callout
          tone="warning"
          role="alert"
          title={t('parent.pay.sessionFullTitle', {
            date: shortDate(fullSession.startsAt, locale),
          })}
        >
          <span>{t('parent.pay.sessionFullBody')}</span>
          <Link
            href={`/${locale}/teachers/${g.teacher.slug}/reserve?group=${g.id}`}
            className="mt-2 inline-flex min-h-11 items-center text-label text-navy underline"
          >
            {t('parent.waitlist.join')}
          </Link>
        </Callout>
      ) : null}

      <section
        aria-labelledby="method"
        className="flex flex-col overflow-hidden rounded-16 border border-border bg-white py-1 shadow-card"
      >
        <h2 id="method" className="px-4 py-2 text-label text-navy">
          {t('parent.pay.method')}
        </h2>
        <RadioCards
          layout="list"
          label={t('parent.pay.method')}
          value={method}
          onValueChange={(v) => setMethod(v as PaymentMethod)}
          options={[
            {
              value: 'card',
              leading: methodBadge(t('parent.pay.methodBadge.card')),
              title: t('parent.pay.methods.card'),
              description: t('parent.pay.methods.cardDesc'),
            },
            {
              value: 'fawry',
              leading: methodBadge(t('parent.pay.methodBadge.fawry')),
              title: t('parent.pay.methods.fawry'),
              description: t('parent.pay.methods.fawryDesc'),
              disabled: !allowed.includes('fawry'),
            },
            {
              value: 'wallet',
              leading: methodBadge(t('parent.pay.methodBadge.wallet')),
              title: t('parent.pay.methods.wallet'),
              description: t('parent.pay.methods.walletDesc'),
              disabled: !allowed.includes('wallet'),
            },
          ]}
        />
        {plan === 'monthly_recurring' ? (
          <p className="flex items-center gap-2 px-4 py-2 text-caption text-amber">
            <span aria-hidden className="size-2 rounded-full bg-amber" />
            {t('parent.pay.monthlyCardOnly')}
          </p>
        ) : null}
      </section>

      <Card>
        <dl className="flex flex-col gap-2">
          <SummaryRow
            label={
              plan === 'per_session'
                ? t('parent.pay.sessionFee', { name: teacherFirst })
                : t('parent.pay.monthlyFee', { name: teacherFirst })
            }
            value={money(price, locale)}
          />
          <SummaryRow
            label={t('parent.pay.bookingFee')}
            value={money({ amountPt: 0, currency: 'EGP' }, locale)}
          />
          <SummaryRow strong label={t('parent.pay.totalToday')} value={money(price, locale)} />
        </dl>
        <p className="mt-2 text-caption text-muted">
          {t('parent.pay.noExtraFees', { name: teacherFirst })}
        </p>
      </Card>

      <section aria-labelledby="share" className="flex flex-col gap-2">
        <h2 id="share" className="sr-only">
          {t('parent.pay.sharingTitle')}
        </h2>
        {/* AC4: name and school year are needed for the service; the phone is a separate, optional consent. */}
        <p className="text-caption text-navy">
          {t('parent.pay.sharesNeeded', {
            child: child.displayName.split(' ')[0] ?? '',
            teacher: teacherFirst,
            centre: g.centre.name,
          })}
        </p>
        <Checkbox
          checked={sharePhone}
          onCheckedChange={setSharePhone}
          description={t('parent.pay.sharePhoneHelp')}
        >
          {t('parent.pay.sharePhone', { teacher: teacherFirst, centre: g.centre.name })}
        </Checkbox>
      </section>

      <p className="text-caption text-muted">{t('parent.pay.refundRule')}</p>

      {error ? (
        <p role="alert" className="text-caption text-red">
          {error}
        </p>
      ) : null}

      <Button block disabled={busy || expired || !!fullSession} onClick={pay}>
        {busy
          ? t('common.loading')
          : e?.lastPaymentFailed
            ? t('parent.pay.tryAgain')
            : t('parent.pay.payCta', { amount: money(price, locale) })}
      </Button>
      <p className="text-center text-caption text-muted">🔒 {t('parent.pay.securePayment')}</p>
    </>
  );
}
