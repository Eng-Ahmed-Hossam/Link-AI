import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fuApi } from '@link/api-client';
import { formatTime } from '@link/i18n';
import { Button, Callout, Card, StateView, textStyle } from '@link/ui-native';
import { color } from '@link/tokens';
import { useLocale } from '@/locale';
import { track } from '@/net';
import { lastConfirmed } from '@/record/confirm';
import { dayMonth, num } from '@/format';
import { Screen } from '@/ui/Screen';

/** T06 / AR03 · Record saved (FUP-REC-06): who confirmed, what was saved, the receipt, how to correct. */
export default function Saved() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale, t } = useLocale();
  const router = useRouter();
  const q = useQuery({
    queryKey: ['record', id, locale],
    queryFn: () => track(fuApi.record(id)),
    initialData: lastConfirmed?.id === id ? lastConfirmed : undefined,
  });
  const r = q.data;
  if (!r)
    return (
      <Screen title={t('teacher.saved.title')}>
        <StateView
          locale={locale}
          kind={q.isError ? 'error' : 'loading'}
          title={q.isError ? t('states.error.title') : t('states.loading.label')}
        />
      </Screen>
    );

  const scores = r.entries.filter((e) => e.score != null).length;
  const observations = r.entries.filter((e) => e.observation).length + (r.groupObservation ? 1 : 0);
  const revisit = r.entries.filter(
    (e) => e.observationTag === 'needs_revisit' || (e.source === 'voice' && e.observation),
  );
  const raised = r.signals.filter((s) => s.status === 'open' || s.status === 'case_opened');

  return (
    <Screen
      title={t('teacher.saved.title')}
      subtitle={`${dayMonth(r.sessionDate, locale)}`}
      testID="screen-t06"
    >
      <Callout
        locale={locale}
        tone="success"
        title={t('teacher.saved.confirmedBy', { name: r.confirmedBy?.displayName ?? '' })}
        body={t('teacher.saved.what', {
          scores,
          observations,
          s: num(scores, locale),
          o: num(observations, locale),
        })}
      />
      {raised.length ? (
        <Callout locale={locale} tone="info" title={t('teacher.saved.flagsTitle')}>
          {raised.map((s) => (
            <Text
              key={s.id}
              testID="raised-flag"
              style={[textStyle(locale, 'body'), { color: color.blueText }]}
            >
              {s.student.displayName}: {s.explanation}
            </Text>
          ))}
          <Text style={[textStyle(locale, 'caption'), { color: color.blueText }]}>
            {t('teacher.saved.flagsBody')}
          </Text>
        </Callout>
      ) : null}
      {revisit.length || r.groupObservation ? (
        <Card tone="info">
          <Text style={textStyle(locale, 'heading')}>{t('teacher.saved.nextTime')}</Text>
          <Text style={textStyle(locale, 'body')}>{t('teacher.saved.nextTimeBody')}</Text>
        </Card>
      ) : null}
      <Card testID="receipt">
        <Text style={textStyle(locale, 'label')}>{t('teacher.saved.receipt')}</Text>
        <Text style={[textStyle(locale, 'body'), { color: color.muted }]}>
          {dayMonth(r.sessionDate, locale)} •{' '}
          {r.confirmedAt ? formatTime(r.confirmedAt, locale) : ''} •{' '}
          {t('teacher.saved.teacherConfirmed')}
        </Text>
        <Text style={textStyle(locale, 'label')}>{t('teacher.saved.correctTitle')}</Text>
        <Text style={[textStyle(locale, 'body'), { color: color.muted }]}>
          {t('teacher.saved.correctBody')}
        </Text>
      </Card>
      <Button
        locale={locale}
        testID="back-today"
        label={t('teacher.saved.backToday')}
        onPress={() => router.replace('/today')}
      />
      <Button
        locale={locale}
        variant="secondary"
        label={t('teacher.saved.reviewRecord')}
        onPress={() =>
          router.push({ pathname: '/group/[id]/history', params: { id: r.groupId, record: r.id } })
        }
      />
    </Screen>
  );
}
