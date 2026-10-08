import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { marketApi, type RoomRequest } from '@link/api-client';
import { formatTime } from '@link/i18n';
import { Button, Card, StatusBadge, textStyle } from '@link/ui-native';
import { color, radius, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { track } from '@/net';
import { dayMonth, num } from '@/format';
import { ruleText, slotsText } from '@/market/text';
import { QueryView } from '@/ui/QueryView';
import { Screen } from '@/ui/Screen';

const STEPS = ['requested', 'phone_call', 'meeting', 'decision'] as const;
const reached = (r: RoomRequest) =>
  r.stage === 'approved' || r.stage === 'declined'
    ? 4
    : r.stage === 'meeting'
      ? 3
      : r.stage === 'phone_call'
        ? 2
        : r.stage === 'withdrawn'
          ? 0
          : 1;

/**
 * J03 · My room requests (MKT-HAL-03): where each request is in the centre's pipeline (Requested →
 * Phone call → Meeting → Decision), the booked call or meeting, and approved rooms on top. An
 * approval books the slot; the teacher can withdraw a request that is still open.
 */
export default function MyRoomRequests() {
  const { locale, t } = useLocale();
  const q = useQuery({
    queryKey: ['my-room-requests', locale],
    queryFn: () => track(marketApi.myRoomRequests()),
  });
  return (
    <Screen
      title={t('teacher.requests.title')}
      subtitle={
        q.data
          ? t('teacher.requests.count', {
              count: q.data.length,
              n: num(q.data.length, locale),
              approved: num(q.data.filter((r) => r.stage === 'approved').length, locale),
            })
          : undefined
      }
      back
      testID="screen-j03"
    >
      <QueryView
        query={q}
        isEmpty={(d) => !d.length}
        empty={{ title: t('teacher.requests.emptyTitle'), body: t('teacher.requests.emptyBody') }}
      >
        {(all) => (
          <>
            {all
              .filter((r) => r.stage === 'approved')
              .map((r) => (
                <Card key={r.id} tone="dark" testID={`request-${r.id}`}>
                  <Text style={[textStyle(locale, 'heading'), { color: color.white }]}>
                    {t('teacher.requests.approvedAt', { centre: r.centre.name })}
                  </Text>
                  <Text style={[textStyle(locale, 'caption'), { color: color.white }]}>
                    {t('teacher.requests.approvedLine', {
                      room: r.hall.name,
                      seats: num(r.hall.capacity, locale),
                      when: slotsText(
                        r.weekdays.map((w) => ({ weekday: w, start: r.start, end: r.end })),
                        locale,
                      ),
                      rule: ruleText(r.rentRule, t, locale),
                      date: dayMonth(r.startsOn, locale),
                    })}
                  </Text>
                  <Text style={[textStyle(locale, 'caption'), { color: color.blue }]}>
                    {t('teacher.requests.nextStep')}
                  </Text>
                </Card>
              ))}
            {all
              .filter((r) => r.stage !== 'approved')
              .map((r) => (
                <RequestCard key={r.id} r={r} />
              ))}
          </>
        )}
      </QueryView>
    </Screen>
  );
}

function RequestCard({ r }: { r: RoomRequest }) {
  const { locale, t } = useLocale();
  const qc = useQueryClient();
  const withdraw = useMutation({
    mutationFn: () => track(marketApi.withdrawRequest(r.id)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['my-room-requests'] }),
  });
  const n = reached(r);
  const open = r.stage === 'requested' || r.stage === 'phone_call' || r.stage === 'meeting';
  const note =
    r.stage === 'phone_call' && r.stageAt
      ? t('teacher.requests.willCall', {
          centre: r.centre.name,
          when: `${dayMonth(r.stageAt.slice(0, 10), locale)} ${formatTime(r.stageAt, locale)}`,
        })
      : r.stage === 'meeting' && r.stageAt
        ? t('teacher.requests.meetingAt', {
            centre: r.centre.name,
            when: `${dayMonth(r.stageAt.slice(0, 10), locale)} ${formatTime(r.stageAt, locale)}`,
          })
        : r.stage === 'declined'
          ? t('teacher.requests.declined', { reason: r.declinedReason ?? '' })
          : r.stage === 'withdrawn'
            ? t('teacher.requests.withdrawn')
            : t('teacher.requests.waiting', { centre: r.centre.name });
  return (
    <Card testID={`request-${r.id}`}>
      <Text style={textStyle(locale, 'heading')}>{r.centre.name}</Text>
      <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
        {r.hall.name} •{' '}
        {slotsText(
          r.weekdays.map((w) => ({ weekday: w, start: r.start, end: r.end })),
          locale,
        )}{' '}
        • {r.subject} {r.schoolYear}
      </Text>
      <View
        style={styles.steps}
        accessibilityLabel={t(`teacher.requests.step.${STEPS[Math.max(0, n - 1)]}`)}
      >
        {STEPS.map((s, i) => (
          <View key={s} style={{ flex: 1, gap: space[4] }}>
            <View
              style={[
                styles.bar,
                {
                  backgroundColor:
                    r.stage === 'declined' ? color.muted : i < n ? color.blue : color.border,
                },
              ]}
            />
            <Text
              style={[
                textStyle(locale, 'caption'),
                { color: i === n - 1 ? color.navy : color.muted, textAlign: 'center' },
              ]}
            >
              {t(`teacher.requests.step.${s}`)}
            </Text>
          </View>
        ))}
      </View>
      <StatusBadge
        locale={locale}
        tone={r.stage === 'phone_call' || r.stage === 'meeting' ? 'info' : 'neutral'}
        label={note}
      />
      {open ? (
        <Button
          locale={locale}
          variant="quiet"
          label={t('teacher.requests.withdraw')}
          onPress={() => withdraw.mutate()}
          disabled={withdraw.isPending}
          testID={`withdraw-${r.id}`}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: 'row', gap: space[4] },
  bar: { height: 4, borderRadius: radius[8] },
});
