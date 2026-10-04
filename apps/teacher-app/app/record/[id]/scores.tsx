import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fuApi } from '@link/api-client';
import { normalizeDigits } from '@link/i18n';
import { Button, Card, Chip, StateView, TextField, textStyle } from '@link/ui-native';
import { color, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { track } from '@/net';
import { useDraft } from '@/record/drafts';
import { attendanceOf, checkScore, scoreProblems } from '@/record/logic';
import { dayMonth, num } from '@/format';
import { Screen } from '@/ui/Screen';

/**
 * T03 · Scores, optional (FUP-REC-03), step 2 of 4. Name the assessment, its maximum and its series.
 * A blank score stays blank; an absent student never gets 0; a score above the maximum is BLOCKED
 * with the honest-state message and never capped (BR-APR-09).
 */
export default function Scores() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale, t } = useLocale();
  const router = useRouter();
  const { draft, update } = useDraft(id);
  const history = useQuery({
    queryKey: ['records', draft?.groupId, locale],
    queryFn: () => track(fuApi.records(draft!.groupId)),
    enabled: !!draft,
  });
  // Series the teacher already uses in this group, newest title first (FUP-REC-03 AC4).
  const series = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of history.data ?? [])
      if (r.assessment?.series && !m.has(r.assessment.series))
        m.set(r.assessment.series, r.assessment.title);
    return [...m];
  }, [history.data]);

  if (!draft)
    return (
      <Screen title={t('teacher.scores.title')} back>
        <StateView
          locale={locale}
          kind={draft === undefined ? 'loading' : 'empty'}
          title={draft === undefined ? t('states.loading.label') : t('teacher.record.noDraft')}
        />
      </Screen>
    );

  const a = draft.assessment ?? { title: '', series: null, maxScore: 0 };
  const max = draft.assessment && draft.assessment.maxScore > 0 ? draft.assessment.maxScore : null;
  const problems = scoreProblems(draft);
  const hasAnyScore = Object.values(draft.scores).some((v) => v.trim() !== '');
  const missingSetup = hasAnyScore && (!a.title.trim() || !max);
  const setAssessment = (patch: Partial<typeof a>) =>
    update((d) => ({
      ...d,
      noAssessment: false,
      assessment: { ...(d.assessment ?? a), ...patch },
    }));
  const error = (sid: string) => {
    const c = checkScore(draft.scores[sid], max, attendanceOf(draft, sid));
    if (c.ok) return undefined;
    if (c.reason === 'out_of_range' && c.max != null)
      return t('teacher.scores.overMax', { value: num(c.value!, locale), max: num(c.max, locale) });
    if (c.reason === 'out_of_range') return t('teacher.scores.needMax');
    if (c.reason === 'absent') return t('teacher.scores.absentNoScore');
    return t('teacher.scores.notANumber');
  };

  return (
    <Screen
      title={t('teacher.scores.title')}
      subtitle={`${draft.groupName} • ${dayMonth(draft.sessionDate, locale)}`}
      step={{ index: 2, total: 4, optional: true }}
      back
      showStorageNote
      testID="screen-t03"
      footer={
        <>
          <Button
            locale={locale}
            testID="to-observation"
            label={t('teacher.scores.continue')}
            disabled={problems.length > 0 || missingSetup}
            onPress={() => router.push(`/record/${id}/observation`)}
          />
          {problems.length > 0 || missingSetup ? (
            <Text
              accessibilityRole="alert"
              style={[textStyle(locale, 'caption'), { color: color.red }]}
            >
              {missingSetup
                ? t('teacher.scores.setupFirst')
                : t('teacher.scores.fixFirst', {
                    count: problems.length,
                    n: num(problems.length, locale),
                  })}
            </Text>
          ) : null}
          <Button
            locale={locale}
            variant="secondary"
            testID="no-assessment"
            label={t('teacher.scores.none')}
            onPress={() => {
              update((d) => ({ ...d, assessment: null, noAssessment: true, scores: {} }));
              router.push(`/record/${id}/observation`);
            }}
          />
        </>
      }
    >
      <TextField
        locale={locale}
        testID="assessment-title"
        label={t('teacher.scores.assessment')}
        placeholder={t('teacher.scores.assessmentPlaceholder')}
        value={a.title}
        onChangeText={(v) => setAssessment({ title: v })}
      />
      <TextField
        locale={locale}
        testID="assessment-max"
        label={t('teacher.scores.max')}
        keyboardType="number-pad"
        value={a.maxScore ? String(a.maxScore) : ''}
        onChangeText={(v) =>
          setAssessment({ maxScore: Number(normalizeDigits(v).replace(/[^\d.]/g, '')) || 0 })
        }
      />
      <View style={{ gap: space[8] }}>
        <Text style={textStyle(locale, 'label')}>{t('teacher.scores.series')}</Text>
        <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
          {t('teacher.scores.seriesHelp')}
        </Text>
        <View
          accessibilityRole="radiogroup"
          testID="series-picker"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[8] }}
        >
          {series.map(([code, title]) => (
            <Chip
              key={code}
              locale={locale}
              label={title}
              selected={a.series === code}
              onPress={() => setAssessment({ series: code })}
              testID={`series-${code}`}
            />
          ))}
          <Chip
            locale={locale}
            label={t('teacher.scores.newSeries')}
            selected={!!a.series && !series.some(([c]) => c === a.series)}
            onPress={() => setAssessment({ series: `series-${draft.sessionDate}` })}
            testID="series-new"
          />
          <Chip
            locale={locale}
            label={t('teacher.scores.noSeries')}
            selected={draft.assessment != null && a.series === null}
            onPress={() => setAssessment({ series: null })}
            testID="series-none"
          />
        </View>
      </View>
      <Card>
        {draft.roster.map((s) => {
          const att = attendanceOf(draft, s.id);
          return att === 'absent' ? (
            <View key={s.id} style={{ gap: 2 }}>
              <Text style={textStyle(locale, 'label')}>{s.displayName}</Text>
              <Text
                testID={`score-absent-${s.id}`}
                style={[textStyle(locale, 'caption'), { color: color.muted }]}
              >
                {t('teacher.scores.absent')}
              </Text>
            </View>
          ) : (
            <TextField
              key={s.id}
              locale={locale}
              testID={`score-${s.id}`}
              label={
                max
                  ? `${s.displayName} (${t('teacher.scores.outOf', { max: num(max, locale) })})`
                  : s.displayName
              }
              placeholder={t('teacher.scores.notEntered')}
              keyboardType="decimal-pad"
              value={draft.scores[s.id] ?? ''}
              error={error(s.id)}
              onChangeText={(v) => update((d) => ({ ...d, scores: { ...d.scores, [s.id]: v } }))}
            />
          );
        })}
        <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
          {t('teacher.scores.footnote')}
        </Text>
      </Card>
    </Screen>
  );
}
