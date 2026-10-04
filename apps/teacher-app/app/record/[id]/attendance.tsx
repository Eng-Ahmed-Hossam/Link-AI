import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Button,
  Callout,
  Card,
  ListRow,
  Segmented,
  StateView,
  StatusBadge,
  textStyle,
} from '@link/ui-native';
import { color, radius, space } from '@link/tokens';
import { normalizeDigits } from '@link/i18n';
import { useLocale } from '@/locale';
import { saveDraftRemote, useDraft } from '@/record/drafts';
import { attendanceOf, markRemainingPresent, summary } from '@/record/logic';
import { dayMonth, num } from '@/format';
import { Screen } from '@/ui/Screen';

type Mark = 'present' | 'absent' | 'late';
const tone = {
  present: 'success',
  absent: 'error',
  late: 'info',
  not_recorded: 'neutral',
} as const;

/**
 * T02 · Confirm attendance (FUP-REC-02), step 1 of 4. Every student is marked explicitly; nothing
 * is pre-selected and unmarked students stay "Not recorded" (BR-APR-07). Save draft with gaps is fine.
 */
export default function Attendance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale, t } = useLocale();
  const router = useRouter();
  const { draft, update } = useDraft(id);
  const [saved, setSaved] = useState<null | 'server' | 'device'>(null);

  if (draft === undefined)
    return (
      <Screen title={t('teacher.attendance.title')} back>
        <StateView locale={locale} kind="loading" title={t('states.loading.label')} />
      </Screen>
    );
  if (draft === null)
    return (
      <Screen title={t('teacher.attendance.title')} back>
        <StateView
          locale={locale}
          kind="empty"
          title={t('teacher.record.noDraft')}
          body={t('teacher.record.noDraftBody')}
        />
      </Screen>
    );

  const c = summary(draft);
  const marked = draft.roster.length - c.not_recorded;
  const labels = {
    present: t('teacher.attendance.present'),
    absent: t('teacher.attendance.absent'),
    late: t('teacher.attendance.late'),
    not_recorded: t('teacher.attendance.not_recorded'),
  };
  const label = (a: keyof typeof tone) => labels[a];
  const notes = (sid: string) => (draft.observations[sid] ? 1 : 0);

  return (
    <Screen
      title={t('teacher.attendance.title')}
      subtitle={`${draft.groupName} • ${dayMonth(draft.sessionDate, locale)}`}
      step={{ index: 1, total: 4 }}
      back
      showStorageNote
      testID="screen-t02"
      footer={
        <>
          <Button
            locale={locale}
            variant="secondary"
            testID="mark-remaining"
            label={t('teacher.attendance.markRemaining')}
            disabled={c.not_recorded === 0}
            onPress={() => update(markRemainingPresent)}
          />
          <Button
            locale={locale}
            testID="to-scores"
            label={t('teacher.attendance.continue')}
            onPress={() => router.push(`/record/${id}/scores`)}
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
              testID="draft-saved"
              style={[textStyle(locale, 'caption'), { color: color.muted }]}
            >
              {saved === 'server'
                ? t('teacher.record.savedDraft')
                : t('teacher.record.savedOnDevice')}
            </Text>
          ) : null}
          <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
            {t('teacher.attendance.footnote')}
          </Text>
        </>
      }
    >
      <Callout
        locale={locale}
        tone="info"
        title={t('teacher.attendance.reviewTitle')}
        body={t('teacher.attendance.reviewBody')}
      />
      <Card>
        {draft.roster.map((s) => {
          const a = attendanceOf(draft, s.id);
          return (
            <View
              key={s.id}
              testID={`row-${s.id}`}
              style={{ gap: space[8], paddingVertical: space[4] }}
            >
              <ListRow
                locale={locale}
                name={s.displayName}
                trailing={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[8] }}>
                    <StatusBadge locale={locale} tone={tone[a]} label={label(a)} />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('teacher.attendance.addNote', { name: s.displayName })}
                      onPress={() =>
                        router.push({
                          pathname: '/student/[id]/note',
                          params: { id: s.id, groupId: draft.groupId },
                        })
                      }
                      style={{
                        minWidth: 44,
                        minHeight: 44,
                        borderRadius: radius[12],
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: notes(s.id) ? color.blueSoft : color.soft,
                      }}
                    >
                      <Text style={textStyle(locale, 'label')}>{'✎'}</Text>
                    </Pressable>
                  </View>
                }
              />
              <Segmented<Mark>
                locale={locale}
                testID={`att-${s.id}`}
                label={s.displayName}
                value={a === 'not_recorded' ? null : a}
                options={[
                  { value: 'present', label: label('present') },
                  { value: 'absent', label: label('absent') },
                  { value: 'late', label: label('late') },
                ]}
                onChange={(v) =>
                  update((d) => ({
                    ...d,
                    attendance: { ...d.attendance, [s.id]: v },
                    // Absence is separate from scores: an absent student has none (FUP-REC-03 AC2).
                    scores: v === 'absent' ? { ...d.scores, [s.id]: '' } : d.scores,
                    sources: { ...d.sources, [s.id]: 'tap' },
                  }))
                }
              />
              {a === 'late' ? (
                <TextInput
                  accessibilityLabel={t('teacher.attendance.lateMinutes', { name: s.displayName })}
                  placeholder={t('teacher.attendance.lateMinutesPlaceholder')}
                  placeholderTextColor={color.muted}
                  keyboardType="number-pad"
                  value={draft.lateMinutes[s.id] != null ? String(draft.lateMinutes[s.id]) : ''}
                  onChangeText={(v) => {
                    const n = Number(normalizeDigits(v).replace(/\D/g, ''));
                    update((d) => ({
                      ...d,
                      lateMinutes: { ...d.lateMinutes, [s.id]: v.trim() ? n : null },
                    }));
                  }}
                  style={[
                    textStyle(locale, 'body'),
                    {
                      minHeight: 44,
                      borderWidth: 1,
                      borderColor: color.border,
                      borderRadius: radius[12],
                      paddingHorizontal: space[12],
                      textAlign: 'auto',
                    },
                  ]}
                />
              ) : null}
            </View>
          );
        })}
        <Text testID="marked-count" style={[textStyle(locale, 'caption'), { color: color.muted }]}>
          {t('teacher.attendance.markedCount', {
            marked: num(marked, locale),
            total: num(draft.roster.length, locale),
            count: draft.roster.length,
          })}
        </Text>
      </Card>
    </Screen>
  );
}
