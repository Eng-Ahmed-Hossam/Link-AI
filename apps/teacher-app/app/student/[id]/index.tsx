import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fuApi } from '@link/api-client';
import { Avatar, Button, Callout, Card, StateView, StatusBadge, textStyle } from '@link/ui-native';
import { color, radius, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { isNetworkError, track } from '@/net';
import { dayMonth, num } from '@/format';
import { Screen } from '@/ui/Screen';
import { useTopicLabel } from '@/topics';

/**
 * T12 · Student detail for the teacher (FUP-REC-11). Trends use ONLY results from the same
 * assessment series; each series is its own chart. Notes show topic, date, author and visibility.
 */
export default function Student() {
  const { id, groupId } = useLocalSearchParams<{ id: string; groupId?: string }>();
  const { locale, t } = useLocale();
  const router = useRouter();
  const topic = useTopicLabel();
  const q = useQuery({
    queryKey: ['student', id, locale],
    queryFn: () => track(fuApi.student(id)),
  });
  const d = q.data;

  if (!d)
    return (
      <Screen title={t('teacher.student.title')} back>
        <StateView
          locale={locale}
          kind={q.isError ? (isNetworkError(q.error) ? 'offline' : 'error') : 'loading'}
          title={q.isError ? t('states.error.title') : t('states.loading.label')}
          actionLabel={q.isError ? t('common.retry') : undefined}
          onAction={() => q.refetch()}
        />
      </Screen>
    );

  const tile = (value: string, label: string, sub: string) => (
    <Card style={{ flex: 1, padding: space[12] }}>
      <Text style={textStyle(locale, 'heading')}>{value}</Text>
      <Text style={textStyle(locale, 'label')}>{label}</Text>
      <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>{sub}</Text>
    </Card>
  );
  const recent = d.attendance.slice(-6);

  return (
    <Screen title={d.student.displayName} subtitle={d.group.name} back testID="screen-t12">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[12] }}>
        <Avatar locale={locale} name={d.student.displayName} size={56} />
        <View style={{ flex: 1, gap: space[4] }}>
          {d.flags.map((f) => (
            <StatusBadge key={f.id} locale={locale} tone="warning" label={f.explanation} />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space[8] }}>
        {tile(
          `${num(d.attended.present, locale)} / ${num(d.attended.of, locale)}`,
          t('teacher.student.attended'),
          t('teacher.student.recordedSessions'),
        )}
        {tile(
          d.latestScore
            ? `${num(d.latestScore.score, locale)}/${num(d.latestScore.maxScore, locale)}`
            : '—',
          t('teacher.student.latestScore'),
          d.latestScore?.title ?? t('teacher.scores.notEntered'),
        )}
        {tile(
          num(d.notesThisMonth, locale),
          t('teacher.student.notes'),
          t('teacher.student.thisMonth'),
        )}
      </View>

      <Card>
        <Text style={textStyle(locale, 'heading')}>{t('teacher.student.attendance')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[8] }}>
          {recent.map((a) => {
            const v = a.value;
            const tone =
              v === 'present'
                ? 'success'
                : v === 'absent'
                  ? 'error'
                  : v === 'late'
                    ? 'warning'
                    : 'neutral';
            const label =
              v === 'present'
                ? t('teacher.attendance.present')
                : v === 'absent'
                  ? t('teacher.attendance.absent')
                  : v === 'late'
                    ? t('teacher.attendance.late')
                    : t('teacher.attendance.not_recorded');
            return (
              <View key={a.sessionDate} style={{ gap: 2, alignItems: 'flex-start' }}>
                <StatusBadge locale={locale} tone={tone} label={label} />
                <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
                  {dayMonth(a.sessionDate, locale)}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
          {t('states.missingData')}
        </Text>
      </Card>

      {d.trends.length ? (
        d.trends.map((tr) => {
          const max = tr.points[0]?.maxScore ?? 1;
          return (
            <Card key={tr.series} testID={`trend-${tr.series}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[8] }}>
                <Text style={[textStyle(locale, 'label'), { flex: 1 }]}>
                  {tr.points.at(-1)?.title ?? tr.series}
                </Text>
                <StatusBadge
                  locale={locale}
                  tone="success"
                  label={t('teacher.student.comparable')}
                />
              </View>
              {/* Text summary first (screen readers), then the bars. */}
              <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
                {tr.points
                  .map(
                    (p) =>
                      `${dayMonth(p.sessionDate, locale)}: ${num(p.score, locale)}/${num(p.maxScore, locale)}`,
                  )
                  .join(' • ')}
              </Text>
              <View
                importantForAccessibility="no-hide-descendants"
                accessibilityElementsHidden
                style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[16], height: 90 }}
              >
                {tr.points.map((p, i) => (
                  <View key={p.sessionDate} style={{ alignItems: 'center', gap: 4 }}>
                    <Text style={textStyle(locale, 'caption')}>{num(p.score, locale)}</Text>
                    <View
                      style={{
                        width: 36,
                        height: Math.max(4, (p.score / max) * 56),
                        borderRadius: radius[8],
                        backgroundColor: i === tr.points.length - 1 ? color.blue : color.blueSoft,
                      }}
                    />
                  </View>
                ))}
              </View>
              <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
                {t('teacher.student.sameSeries')}
              </Text>
            </Card>
          );
        })
      ) : (
        <Callout locale={locale} tone="info" body={t('teacher.student.moreResults')} />
      )}

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[textStyle(locale, 'heading'), { flex: 1 }]}>
            {t('teacher.student.notesTitle')}
          </Text>
          <Button
            locale={locale}
            variant="secondary"
            testID="add-note"
            label={t('teacher.student.addNote')}
            onPress={() =>
              router.push({
                pathname: '/student/[id]/note',
                params: { id, groupId: groupId ?? d.group.id },
              })
            }
          />
        </View>
        {d.notes.length ? (
          d.notes.map((n) => (
            <View
              key={n.id}
              testID={`note-${n.id}`}
              style={{ gap: space[4], paddingVertical: space[4] }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[8],
                  flexWrap: 'wrap',
                }}
              >
                <StatusBadge locale={locale} tone="info" label={topic(n.tag)} />
                <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
                  {dayMonth(n.at.slice(0, 10), locale)} • {n.author.displayName}
                </Text>
              </View>
              <Text style={textStyle(locale, 'body')}>{n.body}</Text>
              <Text
                style={[
                  textStyle(locale, 'caption'),
                  { color: n.visibility === 'suggested_for_parent' ? color.amber : color.muted },
                ]}
              >
                {n.visibility === 'suggested_for_parent'
                  ? t('teacher.note.suggestedStatus')
                  : t('teacher.note.visibilityInternal')}
              </Text>
            </View>
          ))
        ) : (
          <Text style={[textStyle(locale, 'body'), { color: color.muted }]}>
            {t('teacher.student.noNotes')}
          </Text>
        )}
      </Card>
    </Screen>
  );
}
