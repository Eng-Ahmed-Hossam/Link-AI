import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { marketApi, type RoomSearchResult } from '@link/api-client';
import { formatWeekday } from '@link/i18n';
import { Button, Card, Chip, StatusBadge, textStyle } from '@link/ui-native';
import { color, radius, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { track } from '@/net';
import { num } from '@/format';
import { egp, facilities, ruleText, slotsText } from '@/market/text';
import { QueryView } from '@/ui/QueryView';
import { Screen } from '@/ui/Screen';

const SIZES = [15, 25, 35];
const DISTANCES = [3, 8] as const;
const DAYS = [6, 7, 1, 2, 3, 4];

/**
 * J01 · Rooms near you (MKT-HAL-01): centres with free slots that fit the teacher's groups, nearest
 * first. The rent is the centre's rule, as the centre set it (C05). Tap a room to request slots (J02).
 */
export default function Rooms() {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [students, setStudents] = useState(25);
  const [maxKm, setMaxKm] = useState<number | undefined>(8);
  const [days, setDays] = useState<number[]>([]);
  const q = useQuery({
    queryKey: ['room-search', students, maxKm, days.join(','), locale],
    queryFn: () =>
      track(
        marketApi.searchRooms({
          minCapacity: students,
          radiusKm: maxKm,
          ...(days.length ? { weekday: days.join(',') } : {}),
        }),
      ),
  });

  return (
    <Screen title={t('teacher.rooms.title')} subtitle={t('teacher.rooms.lead')} testID="screen-j01">
      <Button
        locale={locale}
        variant="secondary"
        label={t('teacher.rooms.myRequests')}
        onPress={() => router.push('/room-requests')}
        testID="my-requests"
      />
      <View style={styles.wrap} accessibilityLabel={t('teacher.rooms.groupSize')}>
        {SIZES.map((n) => (
          <Chip
            key={n}
            locale={locale}
            label={t('teacher.rooms.students', { n: num(n, locale) })}
            selected={students === n}
            onPress={() => setStudents(n)}
            testID={`size-${n}`}
          />
        ))}
      </View>
      <View style={styles.wrap} accessibilityLabel={t('teacher.rooms.distance')}>
        {DISTANCES.map((km) => (
          <Chip
            key={km}
            locale={locale}
            label={t('teacher.rooms.withinKm', { km: num(km, locale) })}
            selected={maxKm === km}
            onPress={() => setMaxKm(km)}
          />
        ))}
        <Chip
          locale={locale}
          label={t('teacher.rooms.anyDistance')}
          selected={maxKm === undefined}
          onPress={() => setMaxKm(undefined)}
        />
      </View>
      <View style={styles.wrap} accessibilityLabel={t('teacher.rooms.days')}>
        {DAYS.map((d) => (
          <Chip
            key={d}
            locale={locale}
            label={formatWeekday(d, locale)}
            selected={days.includes(d)}
            onPress={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}
          />
        ))}
      </View>
      <QueryView
        query={q}
        isEmpty={(d) => !d.length}
        empty={{ title: t('teacher.rooms.emptyTitle'), body: t('teacher.rooms.emptyBody') }}
      >
        {(rooms) => (
          <>
            <MapPins rooms={rooms} />
            {rooms.map((r) => (
              <RoomCard
                key={r.hall.id}
                r={r}
                students={students}
                onPress={() =>
                  router.push({
                    pathname: '/room/[id]',
                    params: { id: r.hall.id, students: String(students) },
                  })
                }
              />
            ))}
          </>
        )}
      </QueryView>
    </Screen>
  );
}

/** A small drawn map with one pin per centre (no map provider in the demo). */
function MapPins({ rooms }: { rooms: RoomSearchResult[] }) {
  const { locale, t } = useLocale();
  const centres = [...new Map(rooms.map((r) => [r.centre.id, r.centre])).values()];
  const count = (id: string) => rooms.filter((r) => r.centre.id === id).length;
  return (
    <View style={styles.map} accessibilityLabel={t('teacher.rooms.map')}>
      <View style={[styles.road, { top: '45%', start: 0, end: 0, height: 10 }]} />
      <View style={[styles.road, { top: 0, bottom: 0, start: '30%', width: 10 }]} />
      <View style={styles.river} />
      <View style={styles.me} />
      {centres.slice(0, 4).map((c, i) => (
        <View
          key={c.id}
          style={[
            styles.pin,
            { top: `${[12, 30, 62, 80][i]}%`, start: `${[48, 8, 40, 12][i]}%` },
            i === 0 ? { backgroundColor: color.navy } : null,
          ]}
        >
          <View style={styles.pinDot} />
          <Text
            style={[textStyle(locale, 'caption'), { color: i === 0 ? color.white : color.navy }]}
          >
            {t('teacher.rooms.pin', {
              centre: c.name,
              count: count(c.id),
              n: num(count(c.id), locale),
            })}
          </Text>
        </View>
      ))}
    </View>
  );
}

function RoomCard({
  r,
  students,
  onPress,
}: {
  r: RoomSearchResult;
  students: number;
  onPress: () => void;
}) {
  const { locale, t } = useLocale();
  // The first free time of day, and every free day at that time ("Sun & Tue 5 PM free").
  const first = r.freeSlots[0];
  const sameTime = first ? r.freeSlots.filter((s) => s.start === first.start) : [];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('teacher.rooms.open', { room: r.hall.name, centre: r.centre.name })}
      testID={`room-${r.hall.id}`}
    >
      <Card>
        <View style={{ flexDirection: 'row', gap: space[12] }}>
          <View style={styles.thumb} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={textStyle(locale, 'label')}>
              {t('teacher.rooms.roomLine', {
                room: r.hall.name,
                seats: num(r.hall.capacity, locale),
                facilities: facilities(r.hall.facilities, t),
              })}
            </Text>
            <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
              {t('teacher.rooms.centreLine', {
                centre: r.centre.name,
                area: r.centre.area,
                km: num(r.centre.distanceKm, locale),
              })}
            </Text>
          </View>
        </View>
        <View style={styles.between}>
          <Text style={[textStyle(locale, 'caption'), { color: color.green }]}>
            {t('teacher.rooms.freeAt', { when: slotsText(sameTime, locale) })}
          </Text>
          <StatusBadge
            locale={locale}
            tone={r.fits ? 'success' : 'warning'}
            label={
              r.fits
                ? t('teacher.rooms.fits')
                : t('teacher.rooms.tooSmall', { n: num(students, locale) })
            }
          />
        </View>
        <Text style={[textStyle(locale, 'heading'), { color: color.blueText }]}>
          {ruleText(r.rentRule, t, locale)}
        </Text>
        {r.rentRule.basis === 'per_student_per_session' && r.rentRule.amount ? (
          <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
            {t('teacher.rooms.perMonth', {
              amount: egp(r.rentRule.amount.amountPt * students * sameTime.length * 4, locale),
              n: num(students, locale),
            })}
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  between: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[8],
  },
  thumb: { width: 56, height: 56, borderRadius: radius[12], backgroundColor: color.blue },
  map: {
    height: 220,
    borderRadius: radius[16],
    backgroundColor: color.soft,
    overflow: 'hidden',
  },
  road: { position: 'absolute', backgroundColor: color.white },
  river: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    end: '18%',
    width: 44,
    backgroundColor: color.blueSoft,
    transform: [{ skewX: '-12deg' }],
  },
  me: {
    position: 'absolute',
    top: '52%',
    start: '38%',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: color.white,
    backgroundColor: color.blue,
  },
  pin: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    paddingHorizontal: space[12],
    paddingVertical: space[4],
    borderRadius: 999,
    backgroundColor: color.white,
  },
  pinDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.green },
});
