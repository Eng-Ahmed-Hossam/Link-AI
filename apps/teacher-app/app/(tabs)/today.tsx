import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fuApi } from '@link/api-client';
import { Button, Callout, Card, StateView, StatusBadge, textStyle } from '@link/ui-native';
import { color, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { usePhase2 } from '@/flags';
import { isNetworkError, track } from '@/net';
import { listDrafts, openDraft } from '@/record/drafts';
import type { Draft } from '@/record/logic';
import { useVoiceQueue } from '@/offline/voiceQueue';
import { dayMonth, longDay, num, timeRange, todayYmd } from '@/format';
import { Screen } from '@/ui/Screen';

/** T01 / AR01 · Today (FUP-REC-01). Phase 2 only. */
export default function Today() {
  const { locale, t } = useLocale();
  const phase2 = usePhase2();
  const router = useRouter();
  const q = useQuery({
    queryKey: ['teacher-today', locale],
    queryFn: () => track(fuApi.teacherToday()),
    enabled: phase2 === true,
  });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const queue = useVoiceQueue();

  useFocusEffect(
    useCallback(() => {
      void listDrafts().then(setDrafts);
      void q.refetch();
    }, []),
  );

  if (phase2 === false) return <Redirect href="/groups" />;

  async function open(groupId: string, groupName: string, sessionId: string) {
    setOpening(true);
    setOpenError(null);
    try {
      const d = await openDraft(groupId, groupName, sessionId);
      router.push(`/record/${d.recordId}/attendance`);
    } catch (e) {
      setOpenError(isNetworkError(e) ? t('teacher.today.openOffline') : t('states.error.body'));
    } finally {
      setOpening(false);
    }
  }

  const data = q.data;
  const due = data?.recordDue;
  const dueDraft = due?.recordId ? drafts.find((d) => d.recordId === due.recordId) : undefined;
  const otherDrafts = drafts.filter((d) => d.recordId !== due?.recordId);
  const waiting = queue.filter((n) => n.status !== 'uploaded');

  return (
    <Screen
      title={t('teacher.today.title')}
      subtitle={longDay(todayYmd(), locale)}
      showStorageNote
      testID="screen-today"
    >
      {q.isPending ? (
        <StateView locale={locale} kind="loading" title={t('states.loading.label')} />
      ) : q.isError ? (
        <StateView
          locale={locale}
          kind={isNetworkError(q.error) ? 'offline' : 'error'}
          title={isNetworkError(q.error) ? t('states.offline.title') : t('states.error.title')}
          body={isNetworkError(q.error) ? t('teacher.today.offlineBody') : t('states.error.body')}
          actionLabel={t('common.retry')}
          onAction={() => q.refetch()}
        />
      ) : data ? (
        <>
          {/* Before your next session: confirmed observations only, each with its source. */}
          <Card tone="info">
            <Text style={textStyle(locale, 'heading')}>{t('teacher.today.beforeNext')}</Text>
            {data.nextSession ? (
              <Text style={textStyle(locale, 'label')}>{data.nextSession.groupName}</Text>
            ) : null}
            {data.reminders.length ? (
              data.reminders.map((r, i) => (
                <View key={i} style={{ gap: space[4] }}>
                  <Text style={[textStyle(locale, 'body'), { color: color.muted }]}>
                    {r.student ? `${r.student.displayName}: ` : ''}
                    {r.text}
                  </Text>
                  <Text style={[textStyle(locale, 'caption'), { color: color.blueText }]}>
                    {t('teacher.today.source', { date: dayMonth(r.source.sessionDate, locale) })}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[textStyle(locale, 'body'), { color: color.muted }]}>
                {t('teacher.today.noReminders')}
              </Text>
            )}
          </Card>

          {due ? (
            <Card testID="record-due">
              <StatusBadge
                locale={locale}
                tone="warning"
                label={dueDraft ? t('teacher.today.draftSaved') : t('teacher.today.recordDue')}
              />
              <Text style={textStyle(locale, 'heading')}>{due.groupName}</Text>
              <Text style={[textStyle(locale, 'body'), { color: color.muted }]}>
                {longDay(due.sessionDate, locale)} • {timeRange(due.startsAt, due.endsAt, locale)} •{' '}
                {t('teacher.common.students', {
                  count: due.studentCount,
                  n: num(due.studentCount, locale),
                })}
              </Text>
              <Text style={[textStyle(locale, 'body'), { color: color.muted }]}>
                {t('teacher.today.recordWhat')}
              </Text>
            </Card>
          ) : (
            <Callout locale={locale} tone="success" body={t('teacher.today.allConfirmed')} />
          )}
          {due ? (
            <Button
              locale={locale}
              testID="complete-record"
              disabled={opening}
              label={
                dueDraft ? t('teacher.today.continueRecord') : t('teacher.today.completeRecord')
              }
              onPress={() => open(due.groupId, due.groupName, due.sessionId)}
            />
          ) : null}
          {openError ? (
            <Callout locale={locale} tone="error" role="alert" body={openError} />
          ) : null}

          {waiting.length ? (
            <Callout
              locale={locale}
              tone="info"
              title={t('teacher.today.voiceWaiting', {
                count: waiting.length,
                n: num(waiting.length, locale),
              })}
              body={t('teacher.today.voiceWaitingBody')}
            />
          ) : null}

          {(data.correctionRequests ?? []).map((r) => (
            // CF-34: the owner asks; only the teacher corrects a confirmed record.
            <Card key={r.id} tone="warning" testID={`correction-request-${r.id}`}>
              <Text style={[textStyle(locale, 'label'), { color: color.amber }]}>
                {t('teacher.pilot.correctionAsked', { name: r.requestedBy.displayName })}
              </Text>
              <Text style={[textStyle(locale, 'body'), { color: color.amber }]}>
                {r.groupName} • {dayMonth(r.sessionDate, locale)}
                {r.student ? ` • ${r.student.displayName}` : ''}
              </Text>
              <Text style={[textStyle(locale, 'body'), { color: color.navy }]}>{r.text}</Text>
              <Button
                locale={locale}
                variant="secondary"
                label={t('teacher.pilot.openHistory')}
                onPress={() => router.push(`/group/${r.groupId}/history`)}
              />
              <Button
                locale={locale}
                variant="quiet"
                label={t('teacher.pilot.markDone')}
                onPress={async () => {
                  await fuApi.closeCorrectionRequest(r.id).catch(() => undefined);
                  await q.refetch();
                }}
              />
            </Card>
          ))}

          {otherDrafts.length || data.needsYou.length ? (
            <>
              <Text
                style={[
                  textStyle(locale, 'caption'),
                  { color: color.muted, textTransform: 'uppercase' },
                ]}
              >
                {t('teacher.today.needsYou')}
              </Text>
              {otherDrafts.map((d) => (
                <Card key={d.recordId} tone="warning">
                  <Text style={[textStyle(locale, 'label'), { color: color.amber }]}>
                    {t('teacher.today.draftNeedsConfirm')}
                  </Text>
                  <Text style={[textStyle(locale, 'body'), { color: color.amber }]}>
                    {d.groupName} •{' '}
                    {t('teacher.today.draftLine', { date: dayMonth(d.sessionDate, locale) })}
                  </Text>
                  <Button
                    locale={locale}
                    variant="secondary"
                    label={t('teacher.today.openDraft')}
                    onPress={() => router.push(`/record/${d.recordId}/review`)}
                  />
                </Card>
              ))}
              {data.needsYou
                .filter((n) => !drafts.some((d) => d.sessionId === n.sessionId))
                .map((n) => (
                  <Card key={n.sessionId} tone="warning">
                    <Text style={[textStyle(locale, 'body'), { color: color.amber }]}>
                      {n.groupName} •{' '}
                      {n.kind === 'draft'
                        ? t('teacher.today.draftLine', { date: dayMonth(n.sessionDate, locale) })
                        : t('teacher.today.missingLine', { date: dayMonth(n.sessionDate, locale) })}
                    </Text>
                    <Button
                      locale={locale}
                      variant="secondary"
                      label={t('teacher.today.recordIt')}
                      disabled={opening}
                      onPress={() => open(n.groupId, n.groupName, n.sessionId)}
                    />
                  </Card>
                ))}
              <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
                {t('states.missingData')}
              </Text>
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
