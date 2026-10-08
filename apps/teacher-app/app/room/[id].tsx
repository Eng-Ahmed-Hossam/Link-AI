import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, marketApi, type WeeklySlot } from '@link/api-client';
import { formatClock, formatWeekday } from '@link/i18n';
import { Button, Callout, Card, Chip, TextField, textStyle } from '@link/ui-native';
import { color, radius, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { track } from '@/net';
import { dayMonth, num, todayYmd } from '@/format';
import { egp, facilities, ruleText, slotsText } from '@/market/text';
import { QueryView } from '@/ui/QueryView';
import { Screen } from '@/ui/Screen';

const DAYS = [6, 7, 1, 2, 3, 4];
const isoWeekday = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};
const addDays = (ymd: string, n: number) =>
  new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** The first session: the next selected weekday at least 3 days from today (time to tell parents). */
function firstDate(weekdays: number[]): string {
  for (let i = 3; i < 10; i++) {
    const d = addDays(todayYmd(), i);
    if (weekdays.includes(isoWeekday(d))) return d;
  }
  return addDays(todayYmd(), 3);
}

/**
 * J02 · Request a slot (MKT-HAL-02): for which group, which free slots (same time of day), and a
 * rent estimate with each deduction on its own line — the centre's rent and Link's commission
 * (OD-02, rate from the server) — so "you keep" is computed, never typed (CF-13).
 */
export default function RequestRoom() {
  const { id, students: s } = useLocalSearchParams<{ id: string; students?: string }>();
  const { locale, t } = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const room = useQuery({
    queryKey: ['room', id, locale],
    queryFn: async () => (await track(marketApi.searchRooms({}))).find((r) => r.hall.id === id),
  });
  const self = useQuery({
    queryKey: ['teacher-self', locale],
    queryFn: () => track(marketApi.teacherSelf()),
  });
  const subjects = useQuery({
    queryKey: ['ref', 'subjects', locale],
    queryFn: () => api.subjects(),
  });
  const curricula = useQuery({ queryKey: ['ref', 'curricula', locale], queryFn: api.curricula });

  const [pick, setPick] = useState<number | 'new'>(0);
  const [time, setTime] = useState<string | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [newGroup, setNewGroup] = useState({
    subjectId: '',
    schoolYearId: '',
    students: String(Number(s) || 20),
    fee: '',
  });
  const [error, setError] = useState<string | null>(null);

  const teaches = self.data?.teaches ?? [];
  const chosen = pick === 'new' ? null : teaches[pick];
  const studentsN = chosen ? chosen.students : Math.max(0, Number(newGroup.students) || 0);
  const feePt = chosen ? chosen.monthlyFee.amountPt : Math.round((Number(newGroup.fee) || 0) * 100);
  const free = room.data?.freeSlots ?? [];
  const times = [...new Set(free.map((x) => x.start))].sort();
  const at = time ?? times[0] ?? null;
  const slots: WeeklySlot[] = free.filter((x) => x.start === at && days.includes(x.weekday));

  const estimate = useQuery({
    queryKey: ['rent-estimate', id, at, days.join(','), studentsN, feePt],
    queryFn: () =>
      track(
        marketApi.rentEstimate({ hallId: id!, slots, students: studentsN, monthlyFeePt: feePt }),
      ),
    enabled: !!room.data && slots.length > 0 && studentsN > 0 && feePt > 0,
  });
  const startsOn = useMemo(() => firstDate(days), [days]);

  const send = useMutation({
    mutationFn: () =>
      track(
        marketApi.requestRoom({
          hallId: id!,
          slots,
          groupId: chosen?.groupId ?? null,
          subjectId: chosen?.subjectId ?? newGroup.subjectId,
          schoolYearId: chosen?.schoolYearId ?? newGroup.schoolYearId,
          expectedStudents: studentsN,
          startsOn,
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-room-requests'] });
      void qc.invalidateQueries({ queryKey: ['room-search'] });
      router.replace('/room-requests');
    },
    onError: (e) =>
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : t('states.error.body')),
  });
  const ready =
    slots.length > 0 &&
    studentsN > 0 &&
    feePt > 0 &&
    (pick !== 'new' || (!!newGroup.subjectId && !!newGroup.schoolYearId));

  return (
    <Screen
      title={t('teacher.request.title', { room: room.data?.hall.name ?? '' })}
      back
      testID="screen-j02"
    >
      <QueryView query={room}>
        {(r) =>
          !r ? (
            <Callout locale={locale} tone="warning" body={t('teacher.request.gone')} />
          ) : (
            <>
              <Text style={[textStyle(locale, 'body'), { color: color.muted }]}>
                {t('teacher.request.context', {
                  centre: r.centre.name,
                  area: r.centre.area,
                  seats: num(r.hall.capacity, locale),
                  facilities: facilities(r.hall.facilities, t),
                })}
              </Text>

              <Card>
                <Text accessibilityRole="header" style={textStyle(locale, 'heading')}>
                  {t('teacher.request.forWhich')}
                </Text>
                {teaches.map((g, i) => (
                  <Option
                    key={g.groupId}
                    on={pick === i}
                    onPress={() => setPick(i)}
                    title={g.label}
                    body={`${g.where}
${t('teacher.request.groupLine', {
  n: num(g.students, locale),
  fee: egp(g.monthlyFee, locale),
})}`}
                    testID={`for-${g.groupId}`}
                  />
                ))}
                <Option
                  on={pick === 'new'}
                  onPress={() => setPick('new')}
                  title={t('teacher.request.newGroup')}
                  body={t('teacher.request.newGroupBody')}
                  testID="for-new"
                />
                {pick === 'new' ? (
                  <View style={{ gap: space[12] }}>
                    <View style={styles.wrap}>
                      {(subjects.data ?? []).map((x) => (
                        <Chip
                          key={x.id}
                          locale={locale}
                          label={x.name}
                          selected={newGroup.subjectId === x.id}
                          onPress={() => setNewGroup((v) => ({ ...v, subjectId: x.id }))}
                        />
                      ))}
                    </View>
                    <View style={styles.wrap}>
                      {(curricula.data?.[0]?.schoolYears ?? []).map((y) => (
                        <Chip
                          key={y.id}
                          locale={locale}
                          label={y.name}
                          selected={newGroup.schoolYearId === y.id}
                          onPress={() => setNewGroup((v) => ({ ...v, schoolYearId: y.id }))}
                        />
                      ))}
                    </View>
                    <TextField
                      locale={locale}
                      label={t('teacher.request.expected')}
                      value={newGroup.students}
                      onChangeText={(v) =>
                        setNewGroup((x) => ({ ...x, students: v.replace(/\D/g, '') }))
                      }
                      keyboardType="number-pad"
                      ltr
                    />
                    <TextField
                      locale={locale}
                      label={t('teacher.request.plannedFee')}
                      value={newGroup.fee}
                      onChangeText={(v) =>
                        setNewGroup((x) => ({ ...x, fee: v.replace(/\D/g, '') }))
                      }
                      keyboardType="number-pad"
                      ltr
                    />
                  </View>
                ) : null}
              </Card>

              <Card>
                <Text accessibilityRole="header" style={textStyle(locale, 'heading')}>
                  {t('teacher.request.pickSlots')}
                </Text>
                {times.length > 1 ? (
                  <View style={styles.wrap}>
                    {times.map((x) => (
                      <Chip
                        key={x}
                        locale={locale}
                        label={formatClock(x, locale)}
                        selected={at === x}
                        onPress={() => {
                          setTime(x);
                          setDays([]);
                        }}
                        testID={`time-${x}`}
                      />
                    ))}
                  </View>
                ) : null}
                <View style={styles.days}>
                  {DAYS.map((d) => {
                    const isFree = free.some((x) => x.start === at && x.weekday === d);
                    const on = days.includes(d);
                    return (
                      <View key={d} style={{ flex: 1, gap: space[4], alignItems: 'center' }}>
                        <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
                          {formatWeekday(d, locale)}
                        </Text>
                        <Pressable
                          disabled={!isFree}
                          onPress={() =>
                            setDays((x) => (on ? x.filter((y) => y !== d) : [...x, d]))
                          }
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on, disabled: !isFree }}
                          aria-checked={on}
                          accessibilityLabel={`${formatWeekday(d, locale, 'long')} ${at ? formatClock(at, locale) : ''}`}
                          testID={`slot-${d}`}
                          style={[
                            styles.slot,
                            on ? styles.slotOn : isFree ? styles.slotFree : styles.slotTaken,
                          ]}
                        >
                          <Text
                            style={[
                              textStyle(locale, 'caption'),
                              { color: on ? color.navy : isFree ? color.green : color.muted },
                            ]}
                          >
                            {isFree && at ? formatClock(at, locale) : t('teacher.request.taken')}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
                {slots.length ? (
                  <Text style={[textStyle(locale, 'caption'), { color: color.blueText }]}>
                    {t('teacher.request.slotsLine', {
                      when: slotsText(slots, locale),
                      date: dayMonth(startsOn, locale),
                    })}
                  </Text>
                ) : null}
              </Card>

              {estimate.data ? (
                <Card tone="dark" testID="rent-estimate">
                  <Text style={[textStyle(locale, 'heading'), { color: color.white }]}>
                    {t('teacher.request.estimate')}
                  </Text>
                  <Line
                    label={t('teacher.request.yourFees', {
                      n: num(studentsN, locale),
                      fee: egp(feePt, locale),
                    })}
                    value={t('teacher.request.perMonth', {
                      amount: egp(estimate.data.fees, locale),
                    })}
                  />
                  <Line
                    label={t('teacher.request.centreRent', {
                      rule: ruleText(r.rentRule, t, locale),
                    })}
                    value={`−${egp(estimate.data.rent, locale)}`}
                  />
                  <Line
                    label={t('teacher.request.commission', {
                      pct: estimate.data.commissionPercent,
                    })}
                    value={`−${egp(estimate.data.commission, locale)}`}
                  />
                  <View style={styles.between}>
                    <Text style={[textStyle(locale, 'label'), { color: color.white }]}>
                      {t('teacher.request.youKeep')}
                    </Text>
                    <Text
                      style={[textStyle(locale, 'title'), { color: color.blue }]}
                      testID="estimate-keep"
                    >
                      {egp(estimate.data.keep, locale)}
                    </Text>
                  </View>
                </Card>
              ) : null}
              <Callout
                locale={locale}
                tone="info"
                title={t('teacher.request.paidThrough')}
                body={t('teacher.request.paidThroughBody', { centre: r.centre.name })}
              />
              {estimate.data ? (
                <Callout
                  locale={locale}
                  tone={
                    estimate.data.autoApprove.enabled && estimate.data.autoApprove.meets
                      ? 'success'
                      : 'info'
                  }
                  body={
                    estimate.data.autoApprove.enabled && estimate.data.autoApprove.meets
                      ? t('teacher.request.instant', { centre: r.centre.name })
                      : t('teacher.request.review', { centre: r.centre.name })
                  }
                />
              ) : null}
              {error ? <Callout locale={locale} tone="error" role="alert" body={error} /> : null}
              <Button
                locale={locale}
                label={t('teacher.request.send')}
                disabled={!ready || send.isPending}
                onPress={() => send.mutate()}
                testID="send-request"
              />
            </>
          )
        }
      </QueryView>
    </Screen>
  );
}

function Option({
  on,
  onPress,
  title,
  body,
  testID,
}: {
  on: boolean;
  onPress: () => void;
  title: string;
  body: string;
  testID?: string;
}) {
  const { locale } = useLocale();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      testID={testID}
      style={[styles.option, on ? styles.optionOn : null]}
    >
      <View style={[styles.radio, on ? styles.radioOn : null]} />
      <View style={{ flex: 1 }}>
        <Text style={textStyle(locale, 'label')}>{title}</Text>
        <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>{body}</Text>
      </View>
    </Pressable>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const { locale } = useLocale();
  return (
    <View style={styles.between}>
      <Text style={[textStyle(locale, 'caption'), { color: color.white, flex: 1 }]}>{label}</Text>
      <Text style={[textStyle(locale, 'caption'), { color: color.white }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  days: { flexDirection: 'row', gap: space[4] },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[8],
  },
  slot: {
    minHeight: 44,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius[8],
  },
  slotFree: { backgroundColor: color.greenSoft },
  slotOn: { backgroundColor: color.blue },
  slotTaken: { backgroundColor: color.soft },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    minHeight: 56,
    padding: space[12],
    borderRadius: radius[12],
    borderWidth: 1,
    borderColor: color.border,
  },
  optionOn: { borderColor: color.blue, backgroundColor: color.blueSoft },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: color.border },
  radioOn: { borderColor: color.blue, borderWidth: 6 },
});
