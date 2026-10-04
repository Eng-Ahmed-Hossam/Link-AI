import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fuApi, isExtractionReady } from '@link/api-client';
import { Button, Callout, StateView, textStyle } from '@link/ui-native';
import { color, radius, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { isNetworkError, track } from '@/net';
import { useDraft } from '@/record/drafts';
import { Screen } from '@/ui/Screen';
import { isolate } from '@/format';

/**
 * T07 · Check the student (FUP-VOI-04). The roster has two or more close matches: show them, say
 * "Nothing has been saved", and make the teacher pick. No candidate is pre-selected; Link never guesses.
 */
export default function Identity() {
  const { id, extraction, item, voice } = useLocalSearchParams<{
    id: string;
    extraction: string;
    item: string;
    voice: string;
  }>();
  const { locale, t } = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const { draft, update } = useDraft(id);
  const q = useQuery({
    queryKey: ['extraction', voice, locale],
    queryFn: () => track(fuApi.extraction(voice)),
  });
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const x = q.data && isExtractionReady(q.data) ? q.data : null;
  const it = x?.items.find((i) => i.id === item);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['extraction', voice] });
      router.back();
    } catch (e) {
      setError(isNetworkError(e) ? t('states.offline.body') : t('states.error.body'));
    } finally {
      setBusy(false);
    }
  }
  // Once resolved, the open identity on the draft (if the item was already applied) is closed too.
  const closeOnDraft = () =>
    draft &&
    update((d) => ({
      ...d,
      voice: d.voice.map((v) =>
        v.extractionId === extraction
          ? { ...v, openIdentityItemIds: v.openIdentityItemIds.filter((i) => i !== item) }
          : v,
      ),
    }));

  // If the item was already accepted on the draft (T05 path), its value now goes to the chosen student.
  const applyResolved = (value: string | number | null, studentId: string) => {
    const wasOpen = draft?.voice.some(
      (v) => v.extractionId === extraction && v.openIdentityItemIds.includes(item),
    );
    closeOnDraft();
    if (!wasOpen || value == null || !it) return;
    update((d) => ({
      ...d,
      sources: { ...d.sources, [studentId]: 'voice' },
      scores: it.field === 'score' ? { ...d.scores, [studentId]: String(value) } : d.scores,
      assessment:
        it.field === 'score' && !d.assessment && x?.assessment
          ? { title: x.assessment.title, series: null, maxScore: x.assessment.maxScore }
          : d.assessment,
      attendance:
        it.field === 'attendance'
          ? { ...d.attendance, [studentId]: value as 'present' | 'absent' | 'late' }
          : d.attendance,
      observations:
        it.field === 'observation'
          ? { ...d.observations, [studentId]: { text: String(value), tag: null, source: 'voice' } }
          : d.observations,
    }));
  };
  const chosen = it?.candidates.find((c) => c.id === choice);

  return (
    <Screen
      title={t('teacher.identity.title')}
      subtitle={
        it
          ? t('teacher.identity.subtitle', {
              mention: isolate(it.mention ?? ''),
              count: it.candidates.length,
            })
          : undefined
      }
      back
      testID="screen-t07"
      footer={
        it ? (
          <>
            <Button
              locale={locale}
              testID="use-candidate"
              disabled={!chosen || busy}
              label={
                chosen
                  ? t('teacher.identity.use', { name: chosen.displayName })
                  : t('teacher.identity.pickFirst')
              }
              onPress={() =>
                run(async () => {
                  await track(fuApi.resolveIdentity(extraction, item, chosen!.id));
                  const accepted = draft?.voice.find((v) => v.extractionId === extraction)
                    ?.pendingValues?.[item];
                  applyResolved(accepted ?? null, chosen!.id);
                })
              }
            />
            <Button
              locale={locale}
              variant="secondary"
              testID="skip-item"
              disabled={busy}
              label={t('teacher.identity.skip')}
              onPress={() =>
                run(async () => {
                  await track(fuApi.discardItem(extraction, item));
                  closeOnDraft();
                })
              }
            />
            <Button
              locale={locale}
              variant="quiet"
              label={t('teacher.identity.back')}
              onPress={() => router.back()}
            />
          </>
        ) : null
      }
    >
      <Callout
        locale={locale}
        tone="warning"
        title={t('teacher.identity.nothingSaved')}
        body={t('teacher.identity.nothingSavedBody')}
      />
      {!x ? (
        <StateView
          locale={locale}
          kind={q.isError ? 'error' : 'loading'}
          title={q.isError ? t('states.error.title') : t('states.loading.label')}
          actionLabel={q.isError ? t('common.retry') : undefined}
          onAction={() => q.refetch()}
        />
      ) : it ? (
        <>
          <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
            {t('teacher.identity.from')} «{isolate(it.sourceText)}»
          </Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t('teacher.identity.title')}
            style={{ gap: space[12] }}
          >
            {it.candidates.map((c, i) => {
              const on = c.id === choice;
              return (
                <View key={c.id} style={{ gap: space[4] }}>
                  <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
                    {t('teacher.identity.option', { n: i + 1 })}
                  </Text>
                  <Pressable
                    testID={`candidate-${c.id}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setChoice(c.id)}
                    style={{
                      minHeight: 52,
                      justifyContent: 'center',
                      paddingHorizontal: space[16],
                      borderRadius: radius[12],
                      borderWidth: on ? 2 : 1,
                      borderColor: on ? color.blue : color.border,
                      backgroundColor: on ? color.blueSoft : color.white,
                    }}
                  >
                    <Text style={textStyle(locale, 'body')}>
                      {on ? '✓ ' : ''}
                      {c.displayName} • {draft?.groupName ?? ''}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </>
      ) : (
        <Callout locale={locale} tone="success" body={t('teacher.identity.alreadyDone')} />
      )}
      {error ? <Callout locale={locale} tone="error" role="alert" body={error} /> : null}
    </Screen>
  );
}
