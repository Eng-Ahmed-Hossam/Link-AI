import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fuApi, type Correction, type SessionRecord } from '@link/api-client';
import { normalizeDigits } from '@link/i18n';
import {
  Button,
  Callout,
  Card,
  Chip,
  Segmented,
  Sheet,
  StateView,
  StatusBadge,
  TextField,
  textStyle,
} from '@link/ui-native';
import { color, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { isNetworkError, track } from '@/net';
import { dayMonth, num } from '@/format';
import { Screen } from '@/ui/Screen';

/**
 * T13 · Records history (FUP-REC-08). A correction names the field, old value, new value, reason
 * and author; the original is kept and the history stays visible. Nothing is overwritten.
 */
export function RecordsHistory({
  groupId: id,
  highlight: record,
  back,
}: {
  groupId: string;
  highlight?: string;
  back?: boolean;
}) {
  const { locale, t } = useLocale();
  const q = useQuery({
    queryKey: ['records', id, locale],
    queryFn: () => track(fuApi.records(id)),
  });
  const [correcting, setCorrecting] = useState<SessionRecord | null>(null);

  return (
    <Screen
      title={t('teacher.history.title')}
      subtitle={t('teacher.history.subtitle')}
      back={back}
      testID="screen-t13"
    >
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
      ) : !q.data.length ? (
        <StateView locale={locale} kind="empty" title={t('teacher.history.empty')} />
      ) : (
        q.data.map((r) => (
          <RecordCard
            key={r.id}
            r={r}
            highlight={r.id === record}
            onCorrect={() => setCorrecting(r)}
          />
        ))
      )}
      <Callout locale={locale} tone="info" body={t('teacher.history.hint')} />
      {correcting ? <CorrectionSheet r={correcting} onClose={() => setCorrecting(null)} /> : null}
    </Screen>
  );
}

function fieldName(t: ReturnType<typeof useLocale>['t'], f: Correction['field']) {
  return f === 'score'
    ? t('teacher.history.fieldScore')
    : f === 'attendance'
      ? t('teacher.history.fieldAttendance')
      : f === 'participation'
        ? t('teacher.history.fieldParticipation')
        : t('teacher.history.fieldObservation');
}

/** Correction values as the teacher reads them: localised digits and attendance words. */
function valueLabel(t: ReturnType<typeof useLocale>['t'], locale: 'ar' | 'en', v: string | null) {
  if (v == null || v === '') return '—';
  if (/^\d+(\.\d+)?$/.test(v)) return num(Number(v), locale);
  if (v === 'present') return t('teacher.attendance.present');
  if (v === 'absent') return t('teacher.attendance.absent');
  if (v === 'late') return t('teacher.attendance.late');
  if (v === 'not_recorded') return t('teacher.attendance.not_recorded');
  return v;
}

function RecordCard({
  r,
  highlight,
  onCorrect,
}: {
  r: SessionRecord;
  highlight: boolean;
  onCorrect: () => void;
}) {
  const { locale, t } = useLocale();
  const c = { present: 0, absent: 0, late: 0, not_recorded: 0 };
  for (const e of r.entries) c[e.attendance]++;
  const scores = r.entries.filter((e) => e.score != null).length;
  const notes = r.entries.filter((e) => e.observation).length + (r.groupObservation ? 1 : 0);
  const corrected = r.corrections.length > 0;
  return (
    <Card
      testID={`record-${r.id}`}
      style={highlight ? { borderColor: color.blue, borderWidth: 2 } : undefined}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[8] }}>
        <Text style={[textStyle(locale, 'label'), { flex: 1 }]}>
          {dayMonth(r.sessionDate, locale)}
        </Text>
        <StatusBadge
          locale={locale}
          tone={r.status === 'draft' ? 'warning' : corrected ? 'info' : 'success'}
          label={
            r.status === 'draft'
              ? t('teacher.history.draft')
              : corrected
                ? t('teacher.history.corrected')
                : t('teacher.history.confirmed')
          }
        />
      </View>
      <Text style={textStyle(locale, 'body')}>
        {t('teacher.review.counts', {
          present: num(c.present, locale),
          absent: num(c.absent, locale),
          late: num(c.late, locale),
          notRecorded: num(c.not_recorded, locale),
        })}
      </Text>
      <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
        {r.assessment
          ? t('teacher.history.scoresSet', {
              count: scores,
              n: num(scores, locale),
              title: r.assessment.title,
            })
          : t('teacher.history.noScores')}{' '}
        • {t('teacher.roster.notes', { count: notes, n: num(notes, locale) })}
        {r.confirmedBy
          ? ` • ${t('teacher.history.confirmedBy', { name: r.confirmedBy.displayName })}`
          : ''}
      </Text>
      {r.status === 'draft' ? (
        <Text style={[textStyle(locale, 'caption'), { color: color.amber }]}>
          {t('teacher.history.draftNote')}
        </Text>
      ) : null}
      {r.corrections.map((x) => (
        <View
          key={x.id}
          testID={`correction-${x.id}`}
          style={{ gap: 2, borderTopWidth: 1, borderColor: color.border, paddingTop: space[8] }}
        >
          <Text style={textStyle(locale, 'body')}>
            {t('teacher.history.correctionLine', {
              name: x.student.displayName,
              field: fieldName(t, x.field),
              old: valueLabel(t, locale, x.oldValue),
              new: valueLabel(t, locale, x.newValue),
            })}
          </Text>
          <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
            {t('teacher.history.reason', { reason: x.reason })} •{' '}
            {t('teacher.history.by', {
              name: x.author.displayName,
              date: dayMonth(x.at.slice(0, 10), locale),
            })}
          </Text>
          <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
            {t('teacher.history.originalKept')}
          </Text>
        </View>
      ))}
      {r.signals.map((s) => (
        <StatusBadge
          key={s.id}
          locale={locale}
          tone={s.status === 'resolved_by_correction' ? 'neutral' : 'warning'}
          label={
            s.status === 'resolved_by_correction'
              ? `${s.explanation} — ${t('teacher.history.resolvedByCorrection')}`
              : s.explanation
          }
        />
      ))}
      {r.status === 'confirmed' ? (
        <Button
          locale={locale}
          variant="secondary"
          testID={`correct-${r.id}`}
          label={t('teacher.history.addCorrection')}
          onPress={onCorrect}
        />
      ) : null}
    </Card>
  );
}

function CorrectionSheet({ r, onClose }: { r: SessionRecord; onClose: () => void }) {
  const { locale, t } = useLocale();
  const qc = useQueryClient();
  const [entryId, setEntryId] = useState<string | null>(null);
  const [field, setField] = useState<'attendance' | 'score' | null>(null);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const entry = r.entries.find((e) => e.id === entryId);

  async function submit() {
    if (!entry || !field || !reason.trim()) {
      setError(t('teacher.history.needAll'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await track(
        fuApi.correct(entry.id, {
          field,
          newValue: value.trim() === '' ? null : value.trim(),
          reason: reason.trim(),
        }),
      );
      await qc.invalidateQueries({ queryKey: ['records'] });
      onClose();
    } catch (e) {
      setError(
        isNetworkError(e)
          ? t('states.offline.body')
          : ((e as { problem?: { detail?: string } }).problem?.detail ?? t('states.error.body')),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      locale={locale}
      open
      onClose={onClose}
      title={t('teacher.history.correctTitle', { date: dayMonth(r.sessionDate, locale) })}
      closeLabel={t('common.close')}
    >
      <Text style={textStyle(locale, 'label')}>{t('teacher.history.student')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[8] }}>
        {r.entries.map((e) => (
          <Chip
            key={e.id}
            locale={locale}
            label={e.student.displayName}
            selected={entryId === e.id}
            onPress={() => setEntryId(e.id)}
            testID={`correct-student-${e.student.id}`}
          />
        ))}
      </View>
      {entry ? (
        <>
          <Segmented<'attendance' | 'score'>
            locale={locale}
            label={t('teacher.history.field')}
            value={field}
            options={[
              { value: 'attendance', label: t('teacher.history.fieldAttendance') },
              ...(r.assessment
                ? [{ value: 'score' as const, label: t('teacher.history.fieldScore') }]
                : []),
            ]}
            onChange={(f) => {
              setField(f);
              setValue('');
            }}
          />
          {field === 'attendance' ? (
            <Segmented
              locale={locale}
              label={t('teacher.history.newValue')}
              value={(['present', 'absent', 'late'] as const).find((v) => v === value) ?? null}
              options={(['present', 'absent', 'late'] as const).map((v) => ({
                value: v,
                label: t(
                  v === 'present'
                    ? 'teacher.attendance.present'
                    : v === 'absent'
                      ? 'teacher.attendance.absent'
                      : 'teacher.attendance.late',
                ),
              }))}
              onChange={setValue}
            />
          ) : field === 'score' ? (
            <TextField
              locale={locale}
              testID="correct-value"
              label={t('teacher.history.newScore', {
                max: num(r.assessment!.maxScore, locale),
                current: entry.score == null ? '—' : num(entry.score, locale),
              })}
              keyboardType="decimal-pad"
              value={value}
              onChangeText={(v) => setValue(normalizeDigits(v))}
            />
          ) : null}
          <TextField
            locale={locale}
            testID="correct-reason"
            label={t('teacher.history.reasonLabel')}
            value={reason}
            onChangeText={setReason}
            help={t('teacher.history.reasonHelp')}
          />
        </>
      ) : null}
      {error ? <Callout locale={locale} tone="error" role="alert" body={error} /> : null}
      <Button
        locale={locale}
        testID="submit-correction"
        label={busy ? t('common.loading') : t('teacher.history.saveCorrection')}
        disabled={busy}
        onPress={submit}
      />
    </Sheet>
  );
}
