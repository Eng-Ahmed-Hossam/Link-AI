'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as RadioGroup from '@radix-ui/react-radio-group';
import { api, ApiError, useTeacher, type GroupSummary } from '@link/api-client';
import { formatDate, formatNumber } from '@link/i18n';
import { useFlag } from '../../flags';
import { Avatar, Button, Callout, PageTitle, RadioCards, Rating, StatusBadge, cn } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { QueryState } from '../QueryState';
import { ChildSheet } from '../ChildSheet';
import { useSelectedChild } from '../search-context';
import { money, scheduleLabel, seatsInfo } from '../format';
import { createDraft } from '../reserve-draft';

/** P06 · Choose a group & start date (MKT-ENR-01, MKT-ENR-09). Step 1 of 2. */
export function P06ChooseGroup({ slug }: { slug: string }) {
  const bookings = useFlag('bookings.enabled');
  const { locale, t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const q = useTeacher(slug);
  const { child, children, setChildId } = useSelectedChild();
  const [groupId, setGroupId] = useState<string | undefined>(sp.get('group') ?? undefined);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [childOpen, setChildOpen] = useState(false);
  const [waitlist, setWaitlist] = useState<{ position: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const all = q.data?.groups ?? [];
    // The child's school year first (MKT-ENR-01 AC1), then the rest.
    return [...all].sort(
      (a, b) =>
        Number(b.schoolYear.id === child?.schoolYear.id) -
        Number(a.schoolYear.id === child?.schoolYear.id),
    );
  }, [q.data, child]);
  const group =
    groups.find((g) => g.id === groupId) ??
    groups.find((g) => seatsInfo(g, t, locale).state === 'open');

  useEffect(() => {
    if (group && group.id !== groupId) setGroupId(group.id);
  }, [group, groupId]);
  useEffect(() => {
    setSessionId(group?.upcomingSessions.find((s) => s.seatsLeft > 0)?.id);
    setWaitlist(null);
    setError(null);
  }, [group?.id]);

  const full = group ? seatsInfo(group, t, locale).state !== 'open' : false;
  const mismatch =
    group &&
    child &&
    (group.schoolYear.id !== child.schoolYear.id || group.curriculum.id !== child.curriculum.id);

  async function joinWaitlist() {
    if (!group || !child) return;
    setBusy(true);
    try {
      const w = await api.joinWaitlist(group.id, child.id);
      setWaitlist({ position: w.position });
    } catch (e) {
      setError(
        e instanceof ApiError && e.isNetwork ? t('states.offline.body') : t('states.error.body'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <QueryState query={q} loadingRows={4}>
      {(tc) => (
        <>
          <PageTitle
            context={`${t('common.stepOf', { current: 1, total: 2 })} • ${t('parent.reserve.enrollingWith', { name: tc.displayName })}`}
            title={t('parent.reserve.chooseTitle', { name: tc.displayName })}
            subtitle={
              group
                ? `${group.subject.name} • ${group.schoolYear.name} • ${t('parent.reserve.atCentre', { centre: group.centre.name })}`
                : undefined
            }
          />

          {child ? (
            <div className="flex items-center gap-3 rounded-12 bg-soft p-3">
              <Avatar name={child.displayName} size="md" tone="green" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-label text-navy">
                  {t('parent.reserve.forChild')} <bdi>{child.displayName}</bdi>
                </span>
                <span className="text-caption text-muted">
                  {child.schoolYear.name} • {child.curriculum.name}
                </span>
              </div>
              <Button variant="quiet" onClick={() => setChildOpen(true)}>
                {t('common.change')}
              </Button>
            </div>
          ) : (
            <Callout tone="warning" title={t('parent.reserve.noChild')}>
              <Button variant="secondary" onClick={() => setChildOpen(true)}>
                {t('parent.child.add')}
              </Button>
            </Callout>
          )}

          <RadioCards
            label={t('parent.reserve.groupsLabel')}
            value={group?.id}
            onValueChange={setGroupId}
            options={groups.map((g) => ({
              value: g.id,
              title: `${scheduleLabel(g, locale)} • ${g.room.name}`,
              children: <GroupDetails g={g} />,
            }))}
          />

          {mismatch ? (
            // BR-ENR-09: warn, never block.
            <Callout tone="warning" role="note">
              {t('parent.reserve.mismatch', {
                group: group!.schoolYear.name,
                child: child!.displayName.split(' ')[0] ?? '',
                year: child!.schoolYear.name,
              })}
            </Callout>
          ) : null}

          {group && !full ? (
            <section
              aria-labelledby="first"
              className="flex flex-col gap-3 rounded-16 border border-border bg-white p-4 shadow-card"
            >
              <h2 id="first" className="text-label text-navy">
                {t('parent.reserve.firstSession')}
              </h2>
              <RadioGroup.Root
                aria-labelledby="first"
                value={sessionId}
                onValueChange={setSessionId}
                className="grid grid-cols-3 gap-2"
              >
                {group.upcomingSessions.slice(0, 6).map((s) => {
                  const isFull = s.seatsLeft <= 0;
                  return (
                    <RadioGroup.Item
                      key={s.id}
                      value={s.id}
                      disabled={isFull}
                      className={cn(
                        'flex min-h-16 cursor-pointer flex-col items-center justify-center rounded-12 border border-border bg-white px-1 py-2 outline-none focus-visible:ring-2 focus-visible:ring-blueText',
                        'data-[state=checked]:border-navy data-[state=checked]:bg-navy data-[state=checked]:text-white',
                        'disabled:cursor-not-allowed disabled:bg-soft disabled:text-muted',
                      )}
                    >
                      <span className="text-caption">
                        {formatDate(s.startsAt, locale, { weekday: 'short' })}
                      </span>
                      <span className="text-label">
                        {formatDate(s.startsAt, locale, { day: 'numeric', month: 'short' })}
                      </span>
                      {/* Seats per session (MKT-GRP-03 AC4). */}
                      <span className="text-caption">
                        {isFull
                          ? t('parent.reserve.sessionFull')
                          : t('parent.reserve.sessionSeats', { count: s.seatsLeft })}
                      </span>
                    </RadioGroup.Item>
                  );
                })}
              </RadioGroup.Root>
            </section>
          ) : null}

          {group && full ? (
            waitlist ? (
              <Callout tone="success" role="status" title={t('parent.waitlist.joinedTitle')}>
                {t('parent.waitlist.joinedBody', {
                  position: formatNumber(waitlist.position, locale),
                })}
              </Callout>
            ) : (
              <Callout tone="neutral" title={t('parent.waitlist.title')}>
                {t('parent.waitlist.body')}
              </Callout>
            )
          ) : null}

          {group && !full ? (
            <Callout tone="success">
              {t('parent.reserve.perSessionTip', { fee: money(group.sessionFee, locale) })}
            </Callout>
          ) : null}

          {error ? (
            <p role="alert" className="text-caption text-red">
              {error}
            </p>
          ) : null}

          {!bookings ? (
            <Callout tone="info" role="status" title={t('parent.reserve.bookingsSoonTitle')}>
              {t('parent.reserve.bookingsSoon')}
            </Callout>
          ) : group && full ? (
            !waitlist ? (
              <Button block disabled={busy || !child} onClick={joinWaitlist}>
                {busy ? t('common.loading') : t('parent.waitlist.join')}
              </Button>
            ) : null
          ) : (
            <Button
              block
              disabled={!group || !sessionId || !child}
              onClick={() => {
                const d = createDraft({
                  groupId: group!.id,
                  studentId: child!.id,
                  firstSessionId: sessionId!,
                });
                router.push(`/${locale}/reserve/${d.id}`);
              }}
            >
              {t('parent.reserve.continue')}
            </Button>
          )}

          <ChildSheet
            open={childOpen}
            onOpenChange={setChildOpen}
            children={children}
            selectedId={child?.id ?? null}
            onSelect={setChildId}
          />
        </>
      )}
    </QueryState>
  );
}

function GroupDetails({ g }: { g: GroupSummary }) {
  const { locale, t } = useI18n();
  const seats = seatsInfo(g, t, locale);
  return (
    <span className="mt-2 flex flex-col gap-2">
      <span className="flex items-center gap-2">
        <Avatar name={g.teacher.displayName} size="xs" />
        <span className="min-w-0 flex-1 text-caption text-navy">
          <bdi>{g.centre.name}</bdi> • {g.schoolYear.shortName}
        </span>
        {g.teacher.rating ? (
          <Rating
            value={formatNumber(Number(g.teacher.rating.avg), locale)}
            label={t('parent.rating.label', {
              avg: formatNumber(Number(g.teacher.rating.avg), locale),
              count: g.teacher.rating.count,
            })}
          />
        ) : null}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={seats.tone}>{seats.label}</StatusBadge>
        <span className="ms-auto text-label text-blueText">
          {t('parent.perMonth', { fee: money(g.monthlyFee, locale) })}
        </span>
      </span>
    </span>
  );
}
