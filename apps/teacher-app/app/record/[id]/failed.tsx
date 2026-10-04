import { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Callout, Card, StateView, textStyle } from '@link/ui-native';
import { color } from '@link/tokens';
import { useLocale } from '@/locale';
import { useDraft } from '@/record/drafts';
import { confirmDraft } from '@/record/confirm';
import { attendanceOf, summary } from '@/record/logic';
import { dayMonth, num } from '@/format';
import { Screen } from '@/ui/Screen';

/**
 * T08 · Save failed (FUP-REC-07). The draft stays on screen and in the offline store; nothing was
 * confirmed and nothing was triggered. Retry reuses the draft's Idempotency-Key, so it can never
 * create a second record.
 */
export default function Failed() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale, t } = useLocale();
  const router = useRouter();
  const { draft } = useDraft(id);
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(false);

  if (!draft)
    return (
      <Screen title={t('teacher.failed.title')} back>
        <StateView
          locale={locale}
          kind={draft === undefined ? 'loading' : 'empty'}
          title={draft === undefined ? t('states.loading.label') : t('teacher.record.noDraft')}
        />
      </Screen>
    );

  const c = summary(draft);
  async function retry() {
    setBusy(true);
    const r = await confirmDraft(draft!);
    setBusy(false);
    if (r.ok) router.replace(`/record/${id}/saved`);
    else setAgain(true);
  }

  return (
    <Screen
      title={t('teacher.failed.title')}
      subtitle={t('teacher.failed.subtitle')}
      showStorageNote
      testID="screen-t08"
    >
      <Callout
        locale={locale}
        tone="error"
        role="alert"
        title={t('teacher.failed.connection')}
        body={t('teacher.failed.notConfirmed')}
      />
      {again ? (
        <Callout
          locale={locale}
          tone="warning"
          role="alert"
          body={t('teacher.failed.stillFailing')}
        />
      ) : null}
      <Card testID="draft-kept">
        <Text style={textStyle(locale, 'label')}>
          {draft.groupName} • {dayMonth(draft.sessionDate, locale)}
        </Text>
        <Text style={textStyle(locale, 'body')}>
          {t('teacher.review.counts', {
            present: num(c.present, locale),
            absent: num(c.absent, locale),
            late: num(c.late, locale),
            notRecorded: num(c.not_recorded, locale),
          })}
        </Text>
        <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
          {draft.roster
            .filter((s) => attendanceOf(draft, s.id) === 'absent')
            .map((s) => s.displayName)
            .join(' • ')}
        </Text>
      </Card>
      <Button
        locale={locale}
        testID="retry-save"
        label={busy ? t('common.loading') : t('teacher.failed.retry')}
        disabled={busy}
        onPress={retry}
      />
      <Button
        locale={locale}
        variant="secondary"
        label={t('teacher.failed.backToReview')}
        onPress={() => router.replace(`/record/${id}/review`)}
      />
    </Screen>
  );
}
