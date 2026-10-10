'use client';

import { useQuery } from '@tanstack/react-query';
import { marketApi, type RentIncome as Income } from '@link/api-client';
import { formatPercent } from '@link/i18n';
import { Avatar, Button, Callout, Card, KpiCard, StatusBadge, useToast } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { QueryState } from '../../parent/QueryState';
import { OwnerPageHeader, dayMonth, longDay, num, useCentre, useIsOwner } from '../common';
import { egp, ruleText } from './shared';
import { PayoutCard } from './PayoutCard';

/**
 * C07 · Rent income (MKT-LED-08): what each teacher owes for the rooms they used this month, how
 * they paid, and what is outstanding. Link's marketing fee (OD-01) is its own column and the net to
 * the centre is computed from the rows — never the Figma sample totals (CF-13).
 */
export function RentIncome() {
  const { locale, t } = useI18n();
  const { centreId } = useCentre();
  const toast = useToast();
  const owner = useIsOwner();
  const q = useQuery({
    queryKey: ['rent-income', centreId, locale],
    queryFn: () => marketApi.rentIncome(centreId),
    enabled: owner,
  });
  const month = (m: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(`${m}-15T12:00:00Z`));

  return (
    <>
      <OwnerPageHeader title={t('centre.rent.title')} subtitle={t('centre.rent.subtitle')} />
      {!owner ? (
        <div data-testid="owner-only">
          <Callout tone="info">{t('centre.ownerOnly.rent')}</Callout>
        </div>
      ) : null}
      {owner ? (
        <QueryState query={q} loadingRows={4} isEmpty={(d) => !d.rows.length}>
          {(d) => (
            <>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <KpiCard
                  testId="kpi-rent-due"
                  value={egp(d.totals.rentDue, locale)}
                  label={t('centre.rent.due', { month: month(d.month) })}
                  context={t('centre.rent.dueContext', {
                    teachers: d.teachers,
                    t: num(d.teachers, locale),
                    halls: d.halls,
                    h: num(d.halls, locale),
                  })}
                />
                <KpiCard
                  testId="kpi-collected"
                  value={egp(d.totals.collected, locale)}
                  label={t('centre.rent.collected')}
                  context={t('centre.rent.soFar', {
                    pct: formatPercent(
                      d.totals.rentDue.amountPt
                        ? d.totals.collected.amountPt / d.totals.rentDue.amountPt
                        : 0,
                      locale,
                    ),
                  })}
                />
                <KpiCard
                  testId="kpi-outstanding"
                  tone={d.totals.outstanding.amountPt ? 'amber' : 'navy'}
                  value={egp(d.totals.outstanding, locale)}
                  label={t('centre.rent.outstanding')}
                />
                <KpiCard
                  testId="kpi-room-use"
                  value={formatPercent(d.roomUsePercent / 100, locale)}
                  label={t('centre.rent.roomUse')}
                />
              </div>
              <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[1fr_320px]">
                <Card padding="none" className="overflow-x-auto">
                  <div className="flex items-center justify-between gap-3 p-5">
                    <h2 className="text-heading text-navy">
                      {t('centre.rent.byTeacher', { month: month(d.month) })}
                    </h2>
                    <Button
                      variant="quiet"
                      onClick={() => downloadCsv(d, t, locale)}
                      data-testid="export-csv"
                    >
                      {t('centre.rent.export')}
                    </Button>
                  </div>
                  <table className="w-full min-w-[860px] text-start text-caption">
                    <thead className="border-y border-border bg-soft text-muted">
                      <tr>
                        {(
                          [
                            'teacher',
                            'room',
                            'use',
                            'rule',
                            'amount',
                            'fee',
                            'net',
                            'paid',
                          ] as const
                        ).map((c) => (
                          <th key={c} scope="col" className="px-4 py-2 text-start font-semibold">
                            {c === 'fee'
                              ? t('centre.rent.col.fee', { pct: d.feePercent })
                              : t(`centre.rent.col.${c}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {d.rows.map((r, i) => (
                        <tr
                          key={`${r.teacher.id}-${r.hall.id}-${i}`}
                          className="border-b border-border"
                          data-testid="rent-row"
                        >
                          <th scope="row" className="px-4 py-3 text-start font-semibold text-navy">
                            <span className="flex items-center gap-2">
                              <Avatar name={r.teacher.name} size="xs" tone="amber" />
                              <bdi className="whitespace-nowrap">{r.teacher.name}</bdi>
                            </span>
                          </th>
                          <td className="whitespace-nowrap px-4 py-3 text-navy">{r.hall.name}</td>
                          <td className="px-4 py-3 text-muted">
                            {t('centre.rent.sessions', {
                              count: r.sessions,
                              n: num(r.sessions, locale),
                            })}
                            {r.rentRule.basis === 'per_student_per_session' && r.sessions
                              ? ` • ${t('centre.rent.avg', { n: num(Math.round(r.studentSessions / r.sessions), locale) })}`
                              : ''}
                          </td>
                          <td className="px-4 py-3 text-blueText">
                            {r.feesBase
                              ? t('centre.rent.percentOf', {
                                  pct: r.rentRule.percent ?? 0,
                                  base: egp(r.feesBase, locale),
                                })
                              : r.rentRule.basis === 'per_student_per_session'
                                ? t('centre.rent.perStudentTimes', {
                                    amount: egp(r.rentRule.amount ?? 0, locale),
                                    n: num(r.studentSessions, locale),
                                  })
                                : ruleText(r.rentRule, t, locale)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold text-navy">
                            {egp(r.rent, locale)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted">
                            −{egp(r.linkFee, locale)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold text-navy">
                            {egp(r.net, locale)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {r.paidVia === 'link' ? (
                              <StatusBadge tone="success">
                                {t('centre.rent.autoFromLink')}
                              </StatusBadge>
                            ) : (
                              <StatusBadge tone="warning">
                                {t('centre.rent.dueOn', { date: dayMonth(r.dueOn!, locale) })}
                              </StatusBadge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-soft font-semibold text-navy">
                        <th scope="row" colSpan={4} className="px-4 py-3 text-start">
                          {t('centre.rent.total')}
                        </th>
                        <td className="whitespace-nowrap px-4 py-3" data-testid="total-rent">
                          {egp(d.totals.rentDue, locale)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3" data-testid="total-fee">
                          −{egp(d.totals.linkFee, locale)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3" data-testid="total-net">
                          {egp(d.totals.net, locale)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </Card>
                <div className="grid grid-cols-1 content-start gap-4 lg:grid-cols-3 2xl:grid-cols-1">
                  <div className="flex flex-col gap-2 rounded-16 bg-navy p-5 text-white">
                    <h2 className="text-label">{t('centre.rent.howTitle')}</h2>
                    <ul className="flex list-disc flex-col gap-1 ps-4 text-caption text-white/80">
                      <li>{t('centre.rent.how1')}</li>
                      <li>{t('centre.rent.how2', { pct: d.feePercent })}</li>
                    </ul>
                  </div>
                  <Card className="flex flex-col gap-1" data-testid="next-transfer">
                    <p className="text-caption text-muted">{t('centre.rent.nextTransfer')}</p>
                    <p className="text-display text-green">{egp(d.nextTransfer.amount, locale)}</p>
                    <p className="text-caption text-muted">
                      {longDay(d.nextTransfer.on, locale)} →{' '}
                      <bdi dir="ltr">{d.nextTransfer.account}</bdi>
                    </p>
                    <p className="text-caption text-muted">
                      {t('centre.rent.afterFee', { pct: d.feePercent })}
                    </p>
                  </Card>
                  <PayoutCard centreId={centreId} />
                  {d.rows.some((r) => r.paidVia === 'due') ? (
                    <Card className="flex flex-col gap-2">
                      <h2 className="text-label text-navy">{t('centre.rent.outstanding')}</h2>
                      {d.rows
                        .filter((r) => r.paidVia === 'due')
                        .map((r, i) => (
                          <p
                            key={`${r.teacher.id}-${r.hall.id}-${i}`}
                            className="flex justify-between gap-2 text-caption"
                          >
                            <bdi className="text-navy">{r.teacher.name}</bdi>
                            <span className="font-semibold text-amber">{egp(r.rent, locale)}</span>
                          </p>
                        ))}
                      <button
                        type="button"
                        onClick={() => toast(t('centre.rent.reminderSent'))}
                        className="inline-flex min-h-11 items-center self-start text-label text-blueText"
                      >
                        {t('centre.rent.sendReminder')}
                      </button>
                    </Card>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </QueryState>
      ) : null}
    </>
  );
}

/** The month's rows as CSV (generated in the browser from the same data the table shows). */
function downloadCsv(d: Income, t: ReturnType<typeof useI18n>['t'], locale: 'ar' | 'en') {
  const head = [
    'teacher',
    'room',
    'sessions',
    'rule',
    'rent_pt',
    'link_fee_pt',
    'net_pt',
    'paid_via',
  ];
  const rows = d.rows.map((r) => [
    r.teacher.name,
    r.hall.name,
    String(r.sessions),
    ruleText(r.rentRule, t, locale),
    String(r.rent.amountPt),
    String(r.linkFee.amountPt),
    String(r.net.amountPt),
    r.paidVia,
  ]);
  const csv = [head, ...rows]
    .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `rent-income-${d.month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
