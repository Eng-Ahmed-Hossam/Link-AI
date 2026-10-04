import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fuApi, type TeacherGroup } from '@link/api-client';
import { formatClock, formatDate, formatMoney, formatTime, formatWeekdays } from '@link/i18n';
import { Avatar, Button, Callout, Card, StateView, StatusBadge, textStyle } from '@link/ui-native';
import { color, radius, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { useMarketplace, usePhase2 } from '@/flags';
import { isNetworkError, track } from '@/net';
import { num } from '@/format';
import { Screen } from '@/ui/Screen';

/**
 * T09 merged with J05 · My groups (CF-30). Marketplace parts (fees, seats, schedule) are always
 * shown; the follow-up parts (records complete, open follow-ups, roster, history) only with the
 * Phase 2 flag, and render nothing without it.
 */
export default function Groups() {
  const { locale, t } = useLocale();
  const router = useRouter();
  const phase2 = usePhase2() === true;
  const marketplace = useMarketplace() !== false;
  const q = useQuery({
    queryKey: ['teacher-groups', locale],
    queryFn: () => track(fuApi.teacherGroups()),
  });

  return (
    <Screen
      title={t('teacher.groups.title')}
      subtitle={
        q.data
          ? t('teacher.groups.count', { count: q.data.length, n: num(q.data.length, locale) })
          : undefined
      }
      testID="screen-t09"
    >
      {q.isPending ? (
        <StateView locale={locale} kind="loading" title={t('states.loading.label')} />
      ) : q.isError ? (
        <StateView
          locale={locale}
          kind={isNetworkError(q.error) ? 'offline' : 'error'}
          title={isNetworkError(q.error) ? t('states.offline.title') : t('states.error.title')}
          body={isNetworkError(q.error) ? t('states.offline.body') : t('states.error.body')}
          actionLabel={t('common.retry')}
          onAction={() => q.refetch()}
        />
      ) : !q.data.length ? (
        <StateView
          locale={locale}
          kind="empty"
          title={t('teacher.groups.emptyTitle')}
          body={t('teacher.groups.emptyBody')}
        />
      ) : (
        <>
          {q.data.map((g) => (
            <GroupCard
              key={g.id}
              g={g}
              phase2={phase2}
              marketplace={marketplace}
              onRoster={() => router.push(`/group/${g.id}`)}
              onHistory={() => router.push(`/group/${g.id}/history`)}
            />
          ))}
          {phase2 ? <Callout locale={locale} tone="info" body={t('teacher.groups.hint')} /> : null}
        </>
      )}
    </Screen>
  );
}

function GroupCard({
  g,
  phase2,
  marketplace,
  onRoster,
  onHistory,
}: {
  g: TeacherGroup;
  phase2: boolean;
  /** Seats and fees are marketplace data: hidden in the follow-up-only pilot (CF-29). */
  marketplace: boolean;
  onRoster: () => void;
  onHistory: () => void;
}) {
  const { locale, t } = useLocale();
  const f = phase2 ? g.followup : null;
  const complete = f && f.recordsComplete.confirmed === f.recordsComplete.eligible;
  const stat = (label: string, value: string) => (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>{label}</Text>
      <Text style={textStyle(locale, 'label')}>{value}</Text>
    </View>
  );
  return (
    <Card testID={`group-${g.id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[12] }}>
        <Avatar locale={locale} name={g.name} mode="place" tone="blue" />
        <View style={{ flex: 1 }}>
          <Text style={textStyle(locale, 'label')}>{g.name}</Text>
          <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
            {g.centre.displayName} • {g.room} • {formatWeekdays(g.weekdays, locale)},{' '}
            {formatClock(g.startTime, locale)}
          </Text>
        </View>
      </View>
      {f ? (
        <StatusBadge
          locale={locale}
          tone={complete ? 'success' : 'warning'}
          label={
            complete
              ? t('teacher.groups.allConfirmed')
              : t('teacher.groups.recordsMissing', {
                  count: f.recordsComplete.eligible - f.recordsComplete.confirmed,
                  n: num(f.recordsComplete.eligible - f.recordsComplete.confirmed, locale),
                })
          }
        />
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          gap: space[8],
          backgroundColor: color.soft,
          borderRadius: radius[12],
          padding: space[12],
        }}
      >
        {stat(
          t('teacher.groups.nextSession'),
          g.nextSession
            ? `${formatDate(g.nextSession.startsAt, locale, { weekday: 'short' })} ${formatTime(g.nextSession.startsAt, locale)}`
            : '—',
        )}
        {marketplace
          ? stat(
              t('teacher.groups.seats'),
              t('teacher.groups.seatsValue', {
                filled: num(g.seatsFilled, locale),
                cap: num(g.seatCap, locale),
              }),
            )
          : null}
        {marketplace
          ? stat(
              t('teacher.groups.fees'),
              `${formatMoney(g.sessionFee.amountPt, locale)} / ${formatMoney(g.monthlyFee.amountPt, locale)}`,
            )
          : null}
      </View>
      {f ? (
        <View
          style={{
            flexDirection: 'row',
            gap: space[8],
            backgroundColor: color.soft,
            borderRadius: radius[12],
            padding: space[12],
          }}
        >
          {stat(
            t('teacher.groups.records'),
            `${num(f.recordsComplete.confirmed, locale)} / ${num(f.recordsComplete.eligible, locale)}`,
          )}
          {stat(
            t('teacher.groups.followUps'),
            f.openFollowUps
              ? t('teacher.groups.open', {
                  count: f.openFollowUps,
                  n: num(f.openFollowUps, locale),
                })
              : t('teacher.groups.none'),
          )}
          {stat(t('teacher.groups.students'), num(f.studentCount, locale))}
        </View>
      ) : null}
      {f ? (
        <View style={{ flexDirection: 'row', gap: space[8], flexWrap: 'wrap' }}>
          <Button
            locale={locale}
            variant="secondary"
            testID={`roster-${g.id}`}
            label={t('teacher.groups.roster')}
            onPress={onRoster}
          />
          <Button
            locale={locale}
            variant="secondary"
            testID={`history-${g.id}`}
            label={t('teacher.groups.history')}
            onPress={onHistory}
          />
        </View>
      ) : null}
    </Card>
  );
}
