import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fuApi, type Attendance, type RosterRow } from '@link/api-client';
import { Card, Chip, ListRow, StateView, StatusBadge, TextField, textStyle } from '@link/ui-native';
import { color, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { isNetworkError, track } from '@/net';
import { num } from '@/format';
import { Screen } from '@/ui/Screen';

type Filter = 'all' | 'attention' | 'notes';

/**
 * T10 / AR04 · Group roster (FUP-REC-09 AC2): search; All / Needs attention / Has notes; per
 * student the last 4 sessions (a letter AND a colour, never colour alone), latest score, notes, flags.
 */
export default function Roster() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale, t } = useLocale();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const q = useQuery({ queryKey: ['roster', id, locale], queryFn: () => track(fuApi.roster(id)) });
  const groups = useQuery({
    queryKey: ['teacher-groups', locale],
    queryFn: () => track(fuApi.teacherGroups()),
  });
  const g = groups.data?.find((x) => x.id === id);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter(
      (r) =>
        (!s || r.student.displayName.toLowerCase().includes(s)) &&
        (filter === 'all' || (filter === 'attention' ? r.flags.length > 0 : r.noteCount > 0)),
    );
  }, [q.data, search, filter]);
  const count = (f: Filter) =>
    (q.data ?? []).filter(
      (r) => f === 'all' || (f === 'attention' ? r.flags.length > 0 : r.noteCount > 0),
    ).length;

  return (
    <Screen
      title={g?.name ?? t('teacher.roster.title')}
      subtitle={
        g
          ? t('teacher.common.students', {
              count: g.followup?.studentCount ?? 0,
              n: num(g.followup?.studentCount ?? 0, locale),
            })
          : undefined
      }
      back
      testID="screen-t10"
    >
      <TextField
        locale={locale}
        testID="roster-search"
        label={t('teacher.roster.search')}
        placeholder={t('teacher.roster.searchPlaceholder')}
        value={search}
        onChangeText={setSearch}
      />
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[8] }}
      >
        {(['all', 'attention', 'notes'] as const).map((f) => (
          <Chip
            key={f}
            locale={locale}
            testID={`filter-${f}`}
            selected={filter === f}
            onPress={() => setFilter(f)}
            label={`${f === 'all' ? t('teacher.roster.all') : f === 'attention' ? t('teacher.roster.attention') : t('teacher.roster.hasNotes')} ${num(count(f), locale)}`}
          />
        ))}
      </View>
      <Legend />
      {q.isPending ? (
        <StateView locale={locale} kind="loading" title={t('states.loading.label')} />
      ) : q.isError ? (
        <StateView
          locale={locale}
          kind={isNetworkError(q.error) ? 'offline' : 'error'}
          title={isNetworkError(q.error) ? t('states.offline.title') : t('states.error.title')}
          actionLabel={t('common.retry')}
          onAction={() => q.refetch()}
        />
      ) : !rows.length ? (
        <StateView locale={locale} kind="empty" title={t('teacher.roster.noMatch')} />
      ) : (
        <Card>
          {rows.map((r) => (
            <Row
              key={r.student.id}
              r={r}
              onPress={() =>
                router.push({
                  pathname: '/student/[id]',
                  params: { id: r.student.id, groupId: id },
                })
              }
            />
          ))}
        </Card>
      )}
      <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
        {t('states.missingData')}
      </Text>
    </Screen>
  );
}

const MARK: Record<Attendance | 'none', { letter: { en: string; ar: string }; fg: string }> = {
  present: { letter: { en: 'P', ar: 'ح' }, fg: color.green },
  late: { letter: { en: 'L', ar: 'م' }, fg: color.amber },
  absent: { letter: { en: 'A', ar: 'غ' }, fg: color.red },
  not_recorded: { letter: { en: '–', ar: '–' }, fg: color.muted },
  none: { letter: { en: '–', ar: '–' }, fg: color.muted },
};

function Strip({ values }: { values: (Attendance | 'none')[] }) {
  const { locale, t } = useLocale();
  const name = (v: Attendance | 'none') =>
    v === 'present'
      ? t('teacher.attendance.present')
      : v === 'late'
        ? t('teacher.attendance.late')
        : v === 'absent'
          ? t('teacher.attendance.absent')
          : t('teacher.attendance.not_recorded');
  return (
    <View
      accessible
      accessibilityLabel={t('teacher.roster.lastFour', { list: values.map(name).join('، ') })}
      style={{ flexDirection: 'row', gap: 4 }}
    >
      {values.map((v, i) => (
        <Text
          key={i}
          style={[
            textStyle(locale, 'caption'),
            { color: MARK[v].fg, fontWeight: '700', minWidth: 12, textAlign: 'center' },
          ]}
        >
          {MARK[v].letter[locale]}
        </Text>
      ))}
    </View>
  );
}

function Legend() {
  const { locale, t } = useLocale();
  return (
    <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
      {t('teacher.roster.legend')}
    </Text>
  );
}

function Row({ r, onPress }: { r: RosterRow; onPress: () => void }) {
  const { locale, t } = useLocale();
  const subtitle = [
    r.latestScore
      ? t('teacher.roster.latestScore', {
          score: num(r.latestScore.score, locale),
          max: num(r.latestScore.maxScore, locale),
        })
      : null,
    r.noteCount
      ? t('teacher.roster.notes', { count: r.noteCount, n: num(r.noteCount, locale) })
      : null,
  ]
    .filter(Boolean)
    .join(' • ');
  return (
    <View style={{ gap: space[4] }}>
      <ListRow
        locale={locale}
        testID={`student-${r.student.id}`}
        name={r.student.displayName}
        subtitle={subtitle || undefined}
        onPress={onPress}
        trailing={<Strip values={r.lastSessions} />}
      />
      {r.flags.map((f) => (
        <StatusBadge key={f.id} locale={locale} tone="warning" label={f.explanation} />
      ))}
    </View>
  );
}
