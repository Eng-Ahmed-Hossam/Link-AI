'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { marketApi, ownerApi, type ScheduleCell } from '@link/api-client';
import { formatClock, formatPercent, formatWeekday } from '@link/i18n';
import { Callout, Card, KpiCard, cn } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { QueryState } from '../../parent/QueryState';
import { useFollowupExtra } from '../../features';
import { useFlag } from '../../flags';
import { OwnerPageHeader, dayMonth, num, useCentre } from '../common';
import { ruleText } from './shared';

/** The grid runs 2 PM to 9 PM in half hours (Figma C03). */
const FROM = 14 * 60;
const TO = 21 * 60;
const COLS = (TO - FROM) / 30;
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const col = (t: string) => Math.max(0, Math.min(COLS, (mins(t) - FROM) / 30));

/**
 * C03 · Room schedule (MKT-CEN-04), the owner's home: which teacher uses which hall, how full each
 * group is (seats per session, "38 / 40"), and the slots free to rent. Week from Saturday to
 * Thursday (CF-16: the nav says "Room schedule"). With the Follow-up extra, a Today card on top.
 */
export function RoomSchedule() {
  const { locale, t } = useI18n();
  const { centreId, base } = useCentre();
  const q = useQuery({
    queryKey: ['schedule', centreId, locale],
    queryFn: () => marketApi.schedule(centreId),
  });
  const [day, setDay] = useState<number | null>(null);

  return (
    <>
      <OwnerPageHeader
        title={t('centre.schedule.title')}
        subtitle={t('centre.schedule.subtitle')}
      />
      <FollowupTodayCard centreId={centreId} base={base} />
      <QueryState query={q} loadingRows={4}>
        {(d) => {
          const active = day ?? defaultDay(d.days, d.dates);
          const cells = d.cells.filter((c) => c.weekday === active);
          return (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  role="group"
                  aria-label={t('centre.schedule.days')}
                  className="flex flex-wrap gap-2"
                >
                  {d.days.map((wd) => (
                    <button
                      key={wd}
                      type="button"
                      aria-pressed={wd === active}
                      data-testid={`day-${wd}`}
                      onClick={() => setDay(wd)}
                      className={cn(
                        'inline-flex min-h-11 items-center rounded-full px-4 text-label',
                        wd === active
                          ? 'bg-navy text-white'
                          : 'border border-border bg-white text-navy',
                      )}
                    >
                      {formatWeekday(wd, locale)}
                      {d.dates[wd] ? ` ${dayMonth(d.dates[wd]!, locale)}` : ''}
                    </button>
                  ))}
                </div>
                <ul
                  className="flex flex-wrap gap-4 text-caption text-muted"
                  aria-label={t('centre.schedule.legend')}
                >
                  <li className="flex items-center gap-1.5">
                    <span aria-hidden className="size-2.5 rounded-full bg-blue" />
                    {t('centre.schedule.teaching')}
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span aria-hidden className="size-2.5 rounded-full bg-amber" />
                    {t('centre.schedule.booked')}
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-2.5 rounded-full border-2 border-dashed border-green"
                    />
                    {t('centre.schedule.free')}
                  </li>
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <KpiCard
                  testId="kpi-use"
                  value={formatPercent(d.stats.roomUsePercent / 100, locale)}
                  label={t('centre.schedule.roomUse')}
                />
                <KpiCard
                  testId="kpi-free"
                  value={num(d.stats.freeSlots, locale)}
                  label={t('centre.schedule.freeSlots')}
                />
                <KpiCard
                  testId="kpi-filled"
                  value={formatPercent(d.stats.averageSeatsFilledPercent / 100, locale)}
                  label={t('centre.schedule.seatsFilled')}
                />
                <KpiCard
                  testId="kpi-teachers"
                  value={num(d.stats.teachersRenting, locale)}
                  label={t('centre.schedule.teachersRenting')}
                />
              </div>
              {/* Focusable so a keyboard user can scroll the grid sideways (axe scrollable-region-focusable). */}
              <Card padding="none" className="overflow-x-auto" tabIndex={0}>
                <div
                  role="table"
                  aria-label={t('centre.schedule.gridLabel', {
                    day: formatWeekday(active, locale, 'long'),
                  })}
                  className="grid min-w-[820px]"
                  style={{ gridTemplateColumns: `140px repeat(${COLS}, minmax(0, 1fr))` }}
                >
                  <div role="row" className="contents">
                    <span
                      role="columnheader"
                      className="border-b border-border p-3 text-caption text-muted"
                    >
                      {t('centre.schedule.hall')}
                    </span>
                    {Array.from({ length: COLS / 2 }, (_, i) => (
                      <span
                        key={i}
                        role="columnheader"
                        className="col-span-2 border-b border-s border-border p-3 text-caption text-muted"
                      >
                        {formatClock(`${String(14 + i).padStart(2, '0')}:00`, locale)}
                      </span>
                    ))}
                  </div>
                  {d.halls.map((h, row) => (
                    <div
                      role="row"
                      key={h.id}
                      className="contents"
                      data-testid={`hall-row-${h.id}`}
                    >
                      <span
                        role="rowheader"
                        className="flex flex-col justify-center border-b border-border p-3"
                        style={{ gridRow: row + 2, gridColumn: 1 }}
                      >
                        <span className="text-label text-navy">{h.name}</span>
                        <span className="text-caption text-muted">
                          {t('centre.schedule.seats', {
                            count: h.capacity,
                            n: num(h.capacity, locale),
                          })}
                        </span>
                      </span>
                      {cells
                        .filter((c) => c.hallId === h.id)
                        .map((c) => (
                          <Cell key={`${c.kind}-${c.start}`} c={c} row={row + 2} />
                        ))}
                      <span
                        aria-hidden
                        className="border-b border-border"
                        style={{ gridRow: row + 2, gridColumn: `2 / span ${COLS}`, zIndex: -1 }}
                      />
                    </div>
                  ))}
                </div>
              </Card>
              <Callout tone="info">{t('centre.schedule.note')}</Callout>
            </>
          );
        }}
      </QueryState>
    </>
  );
}

function Cell({ c, row }: { c: ScheduleCell; row: number }) {
  const { locale, t } = useI18n();
  const span = { gridRow: row, gridColumn: `${col(c.start) + 2} / ${col(c.end) + 2}` };
  const time = `${formatClock(c.start, locale)}–${formatClock(c.end, locale)}`;
  if (c.kind === 'free')
    return (
      <div role="cell" style={span} className="p-1.5" data-testid="cell-free">
        <div className="flex h-full flex-col gap-0.5 rounded-12 border-2 border-dashed border-green/60 bg-greenSoft/40 p-2">
          <span className="text-caption font-semibold text-green">
            {t('centre.schedule.freeCell')}
          </span>
          {c.rentRule ? (
            <span className="text-caption text-navy">{ruleText(c.rentRule, t, locale)}</span>
          ) : null}
          <span className="sr-only">{time}</span>
        </div>
      </div>
    );
  const teaching = c.kind === 'teaching';
  return (
    <div
      role="cell"
      style={span}
      className="p-1.5"
      data-testid={teaching ? 'cell-teaching' : 'cell-booked'}
    >
      <div
        className={cn(
          'flex h-full flex-col gap-0.5 rounded-12 p-2',
          teaching ? 'bg-blueSoft' : 'bg-amberSoft',
        )}
      >
        <span className="text-caption font-semibold text-navy">
          <bdi>{c.teacher}</bdi>
        </span>
        {c.group ? <span className="text-caption text-muted">{c.group}</span> : null}
        {teaching && c.seats ? (
          <span className="flex items-center gap-1 text-caption text-blueText">
            <span aria-hidden className="size-1.5 rounded-full bg-blue" />
            {t('centre.schedule.seatsFilled2', {
              filled: num(c.seats.filled, locale),
              cap: num(c.seats.cap, locale),
            })}
          </span>
        ) : null}
        {!teaching && c.startsOn ? (
          <span className="flex items-center gap-1 text-caption text-amber">
            <span aria-hidden className="size-1.5 rounded-full bg-amber" />
            {t('centre.schedule.startsOn', { date: dayMonth(c.startsOn, locale) })}
          </span>
        ) : null}
        <span className="sr-only">{time}</span>
      </div>
    </div>
  );
}

/** Today's weekday when the centre works that day, else Saturday. */
function defaultDay(days: number[], dates: Record<number, string>): number {
  const sorted = Object.entries(dates).sort((a, b) => a[1].localeCompare(b[1]));
  return Number(sorted[0]?.[0] ?? days[0]);
}

/** With the Follow-up extra: a small "Today" card on the owner's home (OD-58). */
function FollowupTodayCard({ centreId, base }: { centreId: string; base: string }) {
  const { locale, t } = useI18n();
  const extra = useFollowupExtra(centreId);
  const flag = useFlag('followup.owner_nav');
  const q = useQuery({
    queryKey: ['owner-today', centreId, locale],
    queryFn: () => ownerApi.today(centreId),
    enabled: extra === true && flag,
  });
  if (!(extra === true && flag) || !q.data) return null;
  const d = q.data;
  return (
    <Card
      className="flex flex-wrap items-center justify-between gap-4"
      data-testid="followup-today-card"
    >
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-caption text-muted">
          {t('centre.nav.followup')}
          <span className="rounded-full bg-amberSoft px-2 py-0.5 text-[11px] font-semibold text-amber">
            {t('centre.nav.paidExtra')}
          </span>
        </p>
        <p className="text-heading text-navy">
          {t('centre.schedule.todayCard', {
            due: d.dueToday,
            n: num(d.dueToday, locale),
          })}
        </p>
        <p className="text-caption text-muted">
          {t('owner.today.dueContext', { count: d.overdue.count, n: num(d.overdue.count, locale) })}
        </p>
      </div>
      <Link
        href={`${base}/today`}
        className="inline-flex min-h-11 items-center rounded-12 bg-blue px-5 text-label text-navy shadow-glow"
      >
        {t('centre.schedule.openToday')}
      </Link>
    </Card>
  );
}
