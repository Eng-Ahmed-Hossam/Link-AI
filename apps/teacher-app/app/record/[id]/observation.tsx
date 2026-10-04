import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, StateView, StatusBadge, TextField, textStyle } from '@link/ui-native';
import { color, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { useDraft } from '@/record/drafts';
import { useVoiceQueue } from '@/offline/voiceQueue';
import { dayMonth, num } from '@/format';
import { Screen } from '@/ui/Screen';

/**
 * T04 · Observation by voice or text (FUP-REC-04, FUP-VOI-01), step 3 of 4. The typed note is the
 * group's "next time" note. Internal: never shared with parents automatically (BR-APR-13).
 */
export default function Observation() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const { locale, t } = useLocale();
  const router = useRouter();
  const { draft, update } = useDraft(id);
  const queue = useVoiceQueue().filter((n) => n.recordId === id);

  if (!draft)
    return (
      <Screen title={t('teacher.observation.title')} back>
        <StateView
          locale={locale}
          kind={draft === undefined ? 'loading' : 'empty'}
          title={draft === undefined ? t('states.loading.label') : t('teacher.record.noDraft')}
        />
      </Screen>
    );

  const applied = new Set(draft.voice.map((v) => v.voiceNoteId));

  return (
    <Screen
      title={t('teacher.observation.title')}
      subtitle={`${draft.groupName} • ${dayMonth(draft.sessionDate, locale)}`}
      step={{ index: 3, total: 4, optional: true }}
      back
      showStorageNote
      testID="screen-t04"
      footer={
        <>
          <Button
            locale={locale}
            testID="to-review"
            label={t('teacher.observation.review')}
            onPress={() => router.push(`/record/${id}/review`)}
          />
          <Button
            locale={locale}
            variant="secondary"
            label={t('teacher.observation.none')}
            onPress={() => {
              update((d) => ({ ...d, groupObservation: null }));
              router.push(`/record/${id}/review`);
            }}
          />
          <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
            {t('teacher.observation.internal')}
          </Text>
        </>
      }
    >
      <Card tone="dark">
        <Text style={[textStyle(locale, 'heading'), { color: color.white }]}>
          {t('teacher.observation.speakTitle')}
        </Text>
        <Text style={[textStyle(locale, 'body'), { color: color.white }]}>
          {t('teacher.observation.speakBody')}
        </Text>
        <Button
          locale={locale}
          testID="record-voice"
          variant="secondary"
          label={t('teacher.observation.recordVoice')}
          onPress={() => router.push(`/record/${id}/voice`)}
        />
      </Card>

      {queue.map((n) => {
        const ready = n.status === 'uploaded' && n.voiceNoteId;
        return (
          <Card key={n.localId} testID={`queued-${n.localId}`}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[8],
                flexWrap: 'wrap',
              }}
            >
              <Text style={textStyle(locale, 'label')}>
                {t('teacher.observation.voiceNote', { seconds: num(n.durationS, locale) })}
              </Text>
              <StatusBadge
                locale={locale}
                tone={applied.has(n.voiceNoteId ?? '') ? 'success' : ready ? 'info' : 'warning'}
                label={
                  applied.has(n.voiceNoteId ?? '')
                    ? t('teacher.observation.voiceApplied')
                    : ready
                      ? t('teacher.observation.voiceUploaded')
                      : t('teacher.observation.voiceQueued')
                }
              />
            </View>
            {ready && !applied.has(n.voiceNoteId!) ? (
              <Button
                locale={locale}
                variant="secondary"
                label={t('teacher.observation.reviewVoice')}
                onPress={() =>
                  router.push({
                    pathname: '/record/[id]/understood',
                    params: { id, voice: n.voiceNoteId!, local: n.localId },
                  })
                }
              />
            ) : !ready ? (
              <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
                {t('teacher.observation.voiceQueuedBody')}
              </Text>
            ) : null}
          </Card>
        );
      })}

      <TextField
        locale={locale}
        testID="typed-note"
        label={t('teacher.observation.writeLabel')}
        placeholder={t('teacher.observation.writePlaceholder')}
        multiline
        autoFocus={focus === 'text'}
        maxLength={500}
        value={draft.groupObservation ?? ''}
        onChangeText={(v) => update((d) => ({ ...d, groupObservation: v.trim() ? v : null }))}
        help={t('common.counter', { n: [...(draft.groupObservation ?? '')].length, max: 500 })}
      />
    </Screen>
  );
}
