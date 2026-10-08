'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { CaseStatus, DeliveryStatus, FollowupCase } from '@link/api-client';
import { formatDate, formatNumber, formatTime, type Locale } from '@link/i18n';
import { LoadingState, type StatusTone } from '@link/ui';
import { useI18n } from '../i18n-client';
import { useSession } from '../session';

/** The centre in the URL and the base path of its owner pages. */
export function useCentre() {
  const { centreId } = useParams<{ centreId: string }>();
  const { locale } = useI18n();
  return { centreId, base: `/${locale}/centre/${centreId}` };
}

/** 10 §1: rent income, the centre profile, halls and rent rules are the owner's alone. */
export const useIsOwner = () => !!useSession().session?.roles.includes('centre_owner');

export const isStaff = (roles: string[] | undefined) =>
  !!roles?.some((r) => r === 'centre_owner' || r === 'centre_staff');

/** Owner pages need a centre owner or staff session; otherwise go to the centre sign-in. */
export function RequireStaff({ children }: { children: ReactNode }) {
  const { session, ready } = useSession();
  const { locale, t } = useI18n();
  const router = useRouter();
  const ok = isStaff(session?.roles);
  useEffect(() => {
    if (ready && !ok) router.replace(`/${locale}/centre`);
  }, [ready, ok, locale, router]);
  if (!ready || !ok) return <LoadingState label={t('states.loading.label')} rows={3} />;
  return <>{children}</>;
}

const asDay = (ymd: string) => new Date(`${ymd}T12:00:00Z`);
export const dayMonth = (ymd: string, locale: Locale) =>
  formatDate(asDay(ymd), locale, { day: 'numeric', month: 'long' });
export const longDay = (ymd: string, locale: Locale) =>
  formatDate(asDay(ymd), locale, { weekday: 'long', day: 'numeric', month: 'long' });
export const dateTime = (iso: string, locale: Locale) =>
  `${formatDate(iso, locale, { day: 'numeric', month: 'long' })} • ${formatTime(iso, locale)}`;
export const num = (n: number, locale: Locale) => formatNumber(n, locale);
export const todayYmd = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

type T = ReturnType<typeof useI18n>['t'];

export function caseStatus(
  t: T,
  c: Pick<FollowupCase, 'status' | 'overdue'>,
): { tone: StatusTone; label: string } {
  if (c.overdue) return { tone: 'error', label: t('owner.case.status.overdue') };
  const map: Record<CaseStatus, { tone: StatusTone; label: string }> = {
    open: { tone: 'warning', label: t('owner.case.status.open') },
    in_progress: { tone: 'info', label: t('owner.case.status.in_progress') },
    awaiting_confirmation: { tone: 'info', label: t('owner.case.status.awaiting_confirmation') },
    resolved: { tone: 'success', label: t('owner.case.status.resolved') },
    dismissed: { tone: 'neutral', label: t('owner.case.status.dismissed') },
  };
  return map[c.status];
}

export function messageStatus(t: T, s: DeliveryStatus): { tone: StatusTone; label: string } {
  const map: Record<DeliveryStatus, { tone: StatusTone; label: string }> = {
    draft: { tone: 'warning', label: t('owner.msg.status.draft') },
    approved: { tone: 'info', label: t('owner.msg.status.approved') },
    queued: { tone: 'info', label: t('owner.msg.status.queued') },
    sent: { tone: 'info', label: t('owner.msg.status.sent') },
    delivered: { tone: 'success', label: t('owner.msg.status.delivered') },
    read: { tone: 'success', label: t('owner.msg.status.read') },
    failed: { tone: 'error', label: t('owner.msg.status.failed') },
    not_sendable: { tone: 'error', label: t('owner.msg.status.not_sendable') },
  };
  return map[s];
}

/** Page heading used by every owner page: back link, title, one-line subtitle. */
export function OwnerPageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {back ? (
        <Link
          href={back.href}
          className="inline-flex min-h-11 items-center gap-1 self-start text-label text-blueText"
        >
          <span aria-hidden className="rtl:-scale-x-100">
            ‹
          </span>
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-display text-navy">{title}</h1>
        {actions}
      </div>
      {subtitle ? <p className="text-body text-muted">{subtitle}</p> : null}
    </div>
  );
}
