import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  fuApi,
  marketApi,
  type TeacherBooking,
  type TeacherGroup,
} from '@link/api-client';
import { formatClock, formatDate, formatMoney, formatTime, formatWeekdays } from '@link/i18n';
import {
  Avatar,
  Button,
  Callout,
  Card,
  StateView,
  StatusBadge,
  TextField,
  textStyle,
} from '@link/ui-native';
import { color, radius, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { useFollowup, useMarketplace } from '@/flags';
import { isNetworkError, track } from '@/net';
import { dayMonth, num, todayYmd } from '@/format';
import { slotsText } from '@/market/text';
import { Screen } from '@/ui/Screen';
import { Toggle } from '@/ui/Toggle';

/** Latin digits from what was typed (Arabic-Indic digits too). */
const digits = (v: string) =>
  v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, '');

/**
 * T09 merged with J05 · My groups (CF-30), the teacher's home. Marketplace parts: fees per group,
 * monthly and per session (CF-05), seats filled per session and a seat cap ≤ the hall, "Open a
 * group" in a slot the centre approved, and links to New enrolments (J06) and My profile (J04).
 * Follow-up parts (records complete, open follow-ups, roster, history) only with the Follow-up
 * extra (OD-58), and render nothing without it.
 */
export default function Groups() {
  const { locale, t } = useLocale();
  const router = useRouter();
  const phase2 = useFollowup() === true;
  const marketplace = useMarketplace() !== false;
  const q = useQuery({
    queryKey: ['teacher-groups', locale],
    queryFn: () => track(fuApi.teacherGroups()),
  });
  const bookings = useQuery({
    queryKey: ['teacher-bookings', locale],
    queryFn: () => track(marketApi.myBookings()),
    enabled: marketplace,
  });
  const bookingOf = (groupId: string) => bookings.data?.find((b) => b.groupId === groupId);
  const unopened = (bookings.data ?? []).filter((b) => !b.groupId);

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
      {marketplace ? (
        <View style={{ flexDirection: 'row', gap: space[8], flexWrap: 'wrap' }}>
          <Button
            locale={locale}
            variant="secondary"
            label={t('teacher.groups.newEnrolments')}
            onPress={() => router.push('/enrolments')}
            testID="open-enrolments"
          />
          <Button
            locale={locale}
            variant="secondary"
            label={t('teacher.groups.myProfile')}
            onPress={() => router.push('/profile')}
            testID="open-profile"
          />
        </View>
      ) : null}
      {unopened.map((b) => (
        <NewGroupCard key={b.id} b={b} />
      ))}
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
              booking={bookingOf(g.id)}
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
  booking,
  phase2,
  marketplace,
  onRoster,
  onHistory,
}: {
  g: TeacherGroup;
  /** The hall slot the group is in (its capacity caps the seats; a future start shows). */
  booking: TeacherBooking | undefined;
  phase2: boolean;
  /** Seats and fees are marketplace data: hidden in the follow-up-only pilot (CF-29). */
  marketplace: boolean;
  onRoster: () => void;
  onHistory: () => void;
}) {
  const { locale, t } = useLocale();
  const [editing, setEditing] = useState(false);
  const starts = booking && booking.startsOn > todayYmd() ? booking.startsOn : null;
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
      {marketplace ? (
        <StatusBadge
          locale={locale}
          tone={starts ? 'warning' : 'success'}
          label={
            starts
              ? t('teacher.groups.startsOn', { date: dayMonth(starts, locale) })
              : t('teacher.groups.listed')
          }
        />
      ) : null}
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
      {marketplace ? (
        editing ? (
          <FeeEditor g={g} hallCap={booking?.hall.capacity} onDone={() => setEditing(false)} />
        ) : (
          <Button
            locale={locale}
            variant="quiet"
            label={t('teacher.groups.editFees')}
            onPress={() => setEditing(true)}
            testID={`edit-fees-${g.id}`}
          />
        )
      ) : null}
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

/** Fees per month and per session, seats and the monthly card plan — shared by both forms. */
function FeeFields({
  v,
  set,
  hallCap,
  idPrefix,
}: {
  v: { month: string; session: string; seats: string; plan: boolean };
  set: (p: Partial<{ month: string; session: string; seats: string; plan: boolean }>) => void;
  hallCap: number | undefined;
  idPrefix: string;
}) {
  const { locale, t } = useLocale();
  return (
    <>
      <View style={{ flexDirection: 'row', gap: space[8] }}>
        <View style={{ flex: 1 }}>
          <TextField
            locale={locale}
            label={t('teacher.groups.perMonth')}
            value={v.month}
            onChangeText={(x) => set({ month: digits(x) })}
            keyboardType="number-pad"
            ltr
            testID={`${idPrefix}-month`}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            locale={locale}
            label={t('teacher.groups.perSession')}
            value={v.session}
            onChangeText={(x) => set({ session: digits(x) })}
            keyboardType="number-pad"
            ltr
            testID={`${idPrefix}-session`}
          />
        </View>
      </View>
      <TextField
        locale={locale}
        label={t('teacher.groups.seatCap')}
        help={hallCap ? t('teacher.groups.seatCapHelp', { n: num(hallCap, locale) }) : undefined}
        value={v.seats}
        onChangeText={(x) => set({ seats: digits(x) })}
        keyboardType="number-pad"
        ltr
        testID={`${idPrefix}-seats`}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[12] }}>
        <View style={{ flex: 1 }}>
          <Text style={textStyle(locale, 'label')}>{t('teacher.groups.monthlyPlan')}</Text>
          <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
            {t('teacher.groups.monthlyPlanBody')}
          </Text>
        </View>
        <Toggle
          value={v.plan}
          onValueChange={(plan) => set({ plan })}
          label={t('teacher.groups.monthlyPlan')}
          testID={`${idPrefix}-plan`}
        />
      </View>
    </>
  );
}

/** J05: edit one group's fees (CF-05) and seats (≤ the hall, ≥ seats taken — checked by the server). */
function FeeEditor({
  g,
  hallCap,
  onDone,
}: {
  g: TeacherGroup;
  hallCap: number | undefined;
  onDone: () => void;
}) {
  const { locale, t } = useLocale();
  const qc = useQueryClient();
  const [v, setV] = useState({
    month: String(g.monthlyFee.amountPt / 100),
    session: String(g.sessionFee.amountPt / 100),
    seats: String(g.seatCap),
    plan: g.offersMonthlyRecurring,
  });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      track(
        marketApi.updateGroup(g.id, {
          monthlyFeePt: Math.round(Number(v.month) * 100),
          sessionFeePt: Math.round(Number(v.session) * 100),
          seatCap: Number(v.seats),
          offersMonthlyRecurring: v.plan,
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['teacher-groups'] });
      onDone();
    },
    onError: (e) =>
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : t('states.error.body')),
  });
  return (
    <View style={{ gap: space[12] }} testID={`fees-${g.id}`}>
      <FeeFields
        v={v}
        set={(p) => setV((x) => ({ ...x, ...p }))}
        hallCap={hallCap}
        idPrefix="fee"
      />
      {error ? <Callout locale={locale} tone="error" role="alert" body={error} /> : null}
      <View style={{ flexDirection: 'row', gap: space[8] }}>
        <Button
          locale={locale}
          label={t('teacher.groups.saveFees')}
          onPress={() => save.mutate()}
          disabled={save.isPending || !v.month || !v.session || !v.seats}
          testID={`save-fees-${g.id}`}
        />
        <Button locale={locale} variant="quiet" label={t('common.cancel')} onPress={onDone} />
      </View>
    </View>
  );
}

/** J05 "Open a group" in a slot the centre approved (from the room request: subject and year). */
function NewGroupCard({ b }: { b: TeacherBooking }) {
  const { locale, t } = useLocale();
  const qc = useQueryClient();
  const [v, setV] = useState({
    month: '',
    session: '',
    seats: String(b.hall.capacity),
    plan: true,
  });
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      track(
        marketApi.createGroup({
          bookingId: b.id,
          subjectId: b.subjectId!,
          schoolYearId: b.schoolYearId!,
          monthlyFeePt: Math.round(Number(v.month) * 100),
          sessionFeePt: Math.round(Number(v.session) * 100),
          seatCap: Number(v.seats),
          offersMonthlyRecurring: v.plan,
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['teacher-groups'] });
      void qc.invalidateQueries({ queryKey: ['teacher-bookings'] });
      void qc.invalidateQueries({ queryKey: ['teacher-self'] });
    },
    onError: (e) =>
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : t('states.error.body')),
  });
  if (!b.subjectId || !b.schoolYearId) return null;
  return (
    <Card tone="info" testID={`new-group-${b.id}`}>
      <Text style={textStyle(locale, 'heading')}>
        {t('teacher.groups.openGroup', { label: b.label ?? '' })}
      </Text>
      <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
        {t('teacher.groups.bookedLine', {
          centre: b.centre.name,
          room: b.hall.name,
          when: slotsText(
            b.weekdays.map((w) => ({ weekday: w, start: b.start, end: b.end })),
            locale,
          ),
          date: dayMonth(b.startsOn, locale),
        })}
      </Text>
      <FeeFields
        v={v}
        set={(p) => setV((x) => ({ ...x, ...p }))}
        hallCap={b.hall.capacity}
        idPrefix="new-fee"
      />
      {error ? <Callout locale={locale} tone="error" role="alert" body={error} /> : null}
      <Button
        locale={locale}
        label={t('teacher.groups.create')}
        onPress={() => create.mutate()}
        disabled={create.isPending || !v.month || !v.session || !v.seats}
        testID={`create-group-${b.id}`}
      />
    </Card>
  );
}
