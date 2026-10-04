import { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Callout, Card, StateView, StatusBadge, textStyle } from '@link/ui-native';
import { color, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { useDraft, saveDraftRemote } from '@/record/drafts';
import { confirmDraft } from '@/record/confirm';
import {
  attendanceOf,
  canConfirm,
  checkScore,
  openIdentities,
  scoreProblems,
  summary,
} from '@/record/logic';
import { dayMonth, num } from '@/format';
import { Screen } from '@/ui/Screen';

/**
 * T05 / AR02 · Review before saving (FUP-REC-05), step 4 of 4. Confirm is approval 1 and carries
 * the draft's Idempotency-Key. It stays disabled while any identity item is open (FUP-VOI-04).
 */
export default function Review() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale, t } = useLocale();
  const router = useRouter();
  const { draft } = useDraft(id);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<null | 'server' | 'device'>(null);

  if (!draft)
    return (
      <Screen title={t('teacher.review.title')} back>
        <StateView
          locale={locale}
          kind={draft === undefined ? 'loading' : 'empty'}
          title={draft === undefined ? t('states.loading.label') : t('teacher.record.noDraft')}
        />
      </Screen>
    );

  const c = summary(draft);
  const exceptions = draft.roster.filter((s) =>
    ['absent', 'late'].includes(attendanceOf(draft, s.id)),
  );
  const scored = draft.assessment
    ? draft.roster
        .map((s) => ({
          s,
          c: checkScore(draft.scores[s.id], draft.assessment!.maxScore, attendanceOf(draft, s.id)),
        }))
        .filter((x) => x.c.ok && x.c.value != null)
    : [];
  const observations = draft.roster.filter((s) => draft.observations[s.id]);
  const open = openIdentities(draft);
  const ok = canConfirm(draft);
  const label = (a: string) =>
    a === 'absent'
      ? t('teacher.attendance.absent')
      : a === 'late'
        ? t('teacher.attendance.late')
        : a;

  async function confirm() {
    setBusy(true);
    setProblem(null);
    const r = await confirmDraft(draft!);
    setBusy(false);
    if (r.ok) router.replace(`/record/${id}/saved`);
    else if (r.kind === 'network' || r.kind === 'server') router.push(`/record/${id}/failed`);
    else setProblem(r.kind === 'identity' ? t('teacher.review.identityOpen') : r.detail);
  }

  return (
    <Screen
      title={t('teacher.review.title')}
      subtitle={`${draft.groupName} • ${dayMonth(draft.sessionDate, locale)}`}
      step={{ index: 4, total: 4 }}
      back
      showStorageNote
      testID="screen-t05"
      footer={
        <>
          <Button
            locale={locale}
            testID="confirm-record"
            label={busy ? t('common.loading') : t('teacher.review.confirm')}
            disabled={!ok || busy}
            onPress={confirm}
          />
          {!ok ? (
            <Text
              testID="confirm-blocked"
              accessibilityRole="alert"
              style={[textStyle(locale, 'caption'), { color: color.red }]}
            >
              {open.length
                ? t('teacher.review.identityOpen')
                : t('teacher.scores.fixFirst', {
                    count: scoreProblems(draft).length,
                    n: num(scoreProblems(draft).length, locale),
                  })}
            </Text>
          ) : null}
          {problem ? <Callout locale={locale} tone="error" role="alert" body={problem} /> : null}
          <Button
            locale={locale}
            variant="secondary"
            label={t('teacher.review.backToEdit')}
            onPress={() => router.push(`/record/${id}/attendance`)}
          />
          <Button
            locale={locale}
            variant="quiet"
            testID="save-draft"
            label={t('teacher.record.saveDraft')}
            onPress={async () => setSaved(await saveDraftRemote(draft))}
          />
          {saved ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[textStyle(locale, 'caption'), { color: color.muted }]}
            >
              {saved === 'server'
                ? t('teacher.record.savedDraft')
                : t('teacher.record.savedOnDevice')}
            </Text>
          ) : null}
          <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
            {t('teacher.review.onlyConfirmed')}
          </Text>
        </>
      }
    >
      <Card testID="review-attendance">
        <Text style={textStyle(locale, 'heading')}>{t('teacher.review.attendance')}</Text>
        <Text style={textStyle(locale, 'body')}>
          {t('teacher.review.counts', {
            present: num(c.present, locale),
            absent: num(c.absent, locale),
            late: num(c.late, locale),
            notRecorded: num(c.not_recorded, locale),
          })}
        </Text>
        {exceptions.length ? (
          <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
            {exceptions
              .map((s) => `${s.displayName}: ${label(attendanceOf(draft, s.id))}`)
              .join(' • ')}
          </Text>
        ) : null}
        {c.not_recorded ? (
          <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
            {t('states.missingData')}
          </Text>
        ) : null}
      </Card>

      {draft.assessment ? (
        <Card testID="review-scores">
          <Text style={textStyle(locale, 'label')}>
            {t('teacher.review.scoresTitle', {
              title: draft.assessment.title,
              max: num(draft.assessment.maxScore, locale),
            })}
          </Text>
          {scored.map(({ s, c: sc }) => (
            <Text key={s.id} style={textStyle(locale, 'body')}>
              {s.displayName}: {num((sc as { value: number }).value, locale)} /{' '}
              {num(draft.assessment!.maxScore, locale)}
            </Text>
          ))}
          <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
            {t('teacher.review.otherScores')}
          </Text>
        </Card>
      ) : null}

      {observations.map((s) => (
        <Card key={s.id}>
          <Text style={textStyle(locale, 'label')}>{s.displayName}</Text>
          <Text style={textStyle(locale, 'body')}>{draft.observations[s.id]!.text}</Text>
          <StatusBadge locale={locale} tone="neutral" label={t('teacher.review.internalOnly')} />
        </Card>
      ))}
      {draft.groupObservation ? (
        <Card>
          <Text style={textStyle(locale, 'label')}>{t('teacher.review.groupNote')}</Text>
          <Text style={textStyle(locale, 'body')}>{draft.groupObservation}</Text>
          <StatusBadge locale={locale} tone="neutral" label={t('teacher.review.internalOnly')} />
        </Card>
      ) : null}

      {draft.voice.flatMap((v) =>
        v.openIdentityItemIds.map((itemId) => (
          <Card key={itemId} tone="warning" testID={`open-identity-${itemId}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[8] }}>
              <Text style={[textStyle(locale, 'label'), { flex: 1, color: color.amber }]}>
                {t('teacher.review.identityItem')}
              </Text>
              <StatusBadge
                locale={locale}
                tone="warning"
                label={t('teacher.understood.confirmIdentity')}
              />
            </View>
            <Button
              locale={locale}
              variant="secondary"
              label={t('teacher.understood.chooseStudent')}
              onPress={() =>
                router.push({
                  pathname: '/record/[id]/identity',
                  params: { id, extraction: v.extractionId, item: itemId, voice: v.voiceNoteId },
                })
              }
            />
          </Card>
        )),
      )}
    </Screen>
  );
}
