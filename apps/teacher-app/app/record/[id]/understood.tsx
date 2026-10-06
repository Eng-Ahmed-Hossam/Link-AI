import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import {
  ApiError,
  fuApi,
  isExtractionReady,
  type VoiceExtraction,
  type VoiceItem,
} from '@link/api-client';
import { normalizeDigits } from '@link/i18n';
import {
  Button,
  Callout,
  Card,
  Chip,
  ReviewItemCard,
  Segmented,
  StateView,
  StatusBadge,
  textStyle,
} from '@link/ui-native';
import { color, radius, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { track } from '@/net';
import { useDraft } from '@/record/drafts';
import {
  applyVoice,
  checkScore,
  readyToApply,
  shownValue,
  type ItemDecision,
  type UnmentionedChoice,
} from '@/record/logic';
import { audioSource, useVoiceQueue } from '@/offline/voiceQueue';
import { isolate, num } from '@/format';
import { Screen } from '@/ui/Screen';

/**
 * V02 · What the AI understood (FUP-VOI-03). The transcript is a RECEIPT (never shown to parents or
 * used in reports) and the recording can be replayed. Each item is accepted, edited or skipped on
 * its own; low-confidence fields are blank, medium ones say "Check" (OD-36). Students not
 * mentioned: "Mark N present" or "Leave not recorded", with no default. No topic tags (CF-07).
 */
export default function Understood() {
  const { id, voice, local } = useLocalSearchParams<{
    id: string;
    voice: string;
    local?: string;
  }>();
  const { locale, t } = useLocale();
  const router = useRouter();
  const { draft, update } = useDraft(id);
  const q = useQuery({
    queryKey: ['extraction', voice, locale],
    queryFn: () => track(fuApi.extraction(voice)),
    refetchInterval: (query) =>
      query.state.data && isExtractionReady(query.state.data) ? false : 1000,
  });
  const [decisions, setDecisions] = useState<Record<string, ItemDecision>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<string>('');
  const [unmentioned, setUnmentioned] = useState<UnmentionedChoice>(null);
  const queued = useVoiceQueue().find((n) => n.localId === local);

  // Back to the T04 already in the stack (its text field is the typed alternative).
  const typeInstead = () => router.back();

  if (q.isError) {
    const stt = q.error instanceof ApiError && q.error.code === 'stt_unavailable';
    return (
      <Screen title={t('teacher.understood.title')} back>
        <StateView
          locale={locale}
          kind={
            stt ? 'error' : q.error instanceof ApiError && q.error.isNetwork ? 'offline' : 'error'
          }
          title={stt ? t('teacher.voice.sttDownTitle') : t('states.error.title')}
          body={stt ? t('teacher.voice.sttDownBody') : t('states.error.body')}
          actionLabel={t('common.retry')}
          onAction={() => q.refetch()}
        />
        <Button
          locale={locale}
          variant="secondary"
          testID="type-instead"
          label={t('teacher.voice.typeInstead')}
          onPress={typeInstead}
        />
      </Screen>
    );
  }
  if (!q.data || !isExtractionReady(q.data) || !draft)
    return (
      <Screen title={t('teacher.understood.title')} back>
        <StateView
          locale={locale}
          kind="loading"
          title={t('teacher.voice.processing')}
          body={t('teacher.voice.processingBody')}
        />
      </Screen>
    );

  const x: VoiceExtraction = q.data;
  const max = x.assessment?.maxScore ?? null;
  const items = x.items.filter((i) => !x.discardedItemIds.includes(i.id));
  const decide = (itemId: string, d: ItemDecision) => {
    setDecisions((m) => ({ ...m, [itemId]: d }));
    setEditing(null);
  };
  const ready = readyToApply({ ...x, items }, decisions, unmentioned);
  const attLabel = (v: string) =>
    v === 'present'
      ? t('teacher.attendance.present')
      : v === 'absent'
        ? t('teacher.attendance.absent')
        : v === 'late'
          ? t('teacher.attendance.late')
          : v;
  const display = (it: VoiceItem, v: string | number | null) =>
    v == null
      ? null
      : it.field === 'attendance'
        ? attLabel(String(v))
        : it.field === 'score' && max
          ? `${num(Number(v), locale)} / ${num(max, locale)}`
          : String(v);
  const fieldLabel = (it: VoiceItem) =>
    it.field === 'attendance'
      ? t('teacher.understood.fieldAttendance')
      : it.field === 'score'
        ? t('teacher.understood.fieldScore', { max: num(max ?? 0, locale) })
        : t('teacher.understood.fieldObservation');
  const title = (it: VoiceItem) =>
    it.identity === 'group'
      ? t('teacher.understood.wholeGroup')
      : it.student
        ? it.student.displayName
        : t('teacher.understood.whoIs', { mention: isolate(it.mention ?? '') });

  function editor(it: VoiceItem) {
    const open =
      editing === it.id ||
      (it.band === 'low' && (decisions[it.id]?.kind ?? 'pending') === 'pending');
    if (!open) return null;
    const value = editing === it.id ? edit : '';
    const setV = (v: string) => {
      setEditing(it.id);
      setEdit(v);
    };
    let problem: string | null = null;
    if (it.field === 'score' && value.trim()) {
      const c = checkScore(value, max, 'present');
      if (!c.ok)
        problem =
          c.reason === 'out_of_range' && max != null
            ? t('teacher.scores.overMax', { value: value, max: num(max, locale) })
            : t('teacher.scores.notANumber');
    }
    const usable = value.trim() !== '' && !problem;
    return (
      <View style={{ gap: space[8] }}>
        {it.field === 'attendance' ? (
          <Segmented
            locale={locale}
            label={title(it)}
            value={(['present', 'absent', 'late'] as const).find((v) => v === value) ?? null}
            options={(['present', 'absent', 'late'] as const).map((v) => ({
              value: v,
              label: attLabel(v),
            }))}
            onChange={(v) => setV(v)}
          />
        ) : (
          <TextInput
            testID={`edit-${it.id}`}
            accessibilityLabel={fieldLabel(it)}
            placeholder={t('teacher.understood.fillIn')}
            placeholderTextColor={color.muted}
            keyboardType={it.field === 'score' ? 'decimal-pad' : 'default'}
            multiline={it.field === 'observation'}
            value={value}
            onChangeText={(v) => setV(it.field === 'score' ? normalizeDigits(v) : v)}
            style={[
              textStyle(locale, 'body'),
              {
                minHeight: 44,
                borderWidth: 1,
                borderColor: problem ? color.red : color.border,
                borderRadius: radius[12],
                paddingHorizontal: space[12],
                textAlign: 'auto',
              },
            ]}
          />
        )}
        {problem ? (
          <Text
            accessibilityRole="alert"
            style={[textStyle(locale, 'caption'), { color: color.red }]}
          >
            {problem}
          </Text>
        ) : null}
        <Button
          locale={locale}
          variant="secondary"
          testID={`use-${it.id}`}
          label={t('teacher.understood.useThis')}
          disabled={!usable}
          onPress={() =>
            decide(it.id, { kind: 'accepted', value: it.field === 'score' ? Number(value) : value })
          }
        />
      </View>
    );
  }

  function card(it: VoiceItem) {
    const dec = decisions[it.id] ?? { kind: 'pending' };
    const value = dec.kind === 'accepted' ? display(it, dec.value) : display(it, shownValue(it));
    // An ambiguous name (two close students) and an unknown one (a misheard name, "ليلة") both
    // block until the teacher picks: Link never attaches a student by itself (AI-02).
    const blocking =
      it.identity === 'ambiguous' || it.identity === 'unknown' ? (
        <View style={{ gap: space[8] }}>
          <StatusBadge
            locale={locale}
            tone="warning"
            label={
              it.identity === 'unknown'
                ? t('teacher.understood.whoIsThis')
                : t('teacher.understood.confirmIdentity')
            }
          />
          <Button
            locale={locale}
            testID={`identity-${it.id}`}
            label={t('teacher.understood.chooseStudent')}
            onPress={() =>
              router.push({
                pathname: '/record/[id]/identity',
                params: { id, extraction: x.id, item: it.id, voice },
              })
            }
          />
          <Button
            locale={locale}
            variant="secondary"
            testID={`keep-${it.id}`}
            label={t('teacher.understood.keepForLater')}
            onPress={() => decide(it.id, { kind: 'accepted', value: it.value! })}
          />
          <Button
            locale={locale}
            variant="quiet"
            label={t('teacher.understood.skip')}
            onPress={() => decide(it.id, { kind: 'skipped' })}
          />
        </View>
      ) : undefined;
    return (
      <ReviewItemCard
        key={it.id}
        testID={`item-${it.id}`}
        locale={locale}
        title={title(it)}
        field={fieldLabel(it)}
        value={dec.kind === 'accepted' ? value : it.band === 'low' ? null : value}
        sourceText={it.sourceText}
        band={dec.kind === 'accepted' ? 'high' : it.band}
        decision={dec.kind}
        blocking={dec.kind === 'pending' ? blocking : undefined}
        editor={dec.kind === 'pending' ? editor(it) : null}
        labels={{
          check: t('teacher.understood.check'),
          blank: t('teacher.understood.blank'),
          from: t('teacher.understood.from'),
          accept: t('teacher.understood.accept'),
          edit: t('teacher.understood.edit'),
          skip: t('teacher.understood.skip'),
          accepted: t('teacher.understood.accepted'),
          skipped: t('teacher.understood.skipped'),
        }}
        onAccept={
          it.band !== 'low'
            ? () => decide(it.id, { kind: 'accepted', value: it.value! })
            : undefined
        }
        onEdit={
          it.band !== 'low'
            ? () => {
                setEditing(it.id);
                setEdit(it.value == null ? '' : String(it.value));
              }
            : undefined
        }
        onSkip={() => decide(it.id, { kind: 'skipped' })}
      />
    );
  }

  const groups: { key: string; title: string; items: VoiceItem[] }[] = [
    {
      key: 'attendance',
      title: t('teacher.understood.attendance'),
      items: items.filter((i) => i.field === 'attendance' || i.field === 'late_minutes'),
    },
    {
      key: 'scores',
      title: x.assessment
        ? t('teacher.understood.scoresOf', {
            title: x.assessment.title,
            max: num(x.assessment.maxScore, locale),
          })
        : t('teacher.understood.scores'),
      items: items.filter((i) => i.field === 'score'),
    },
    {
      key: 'observation',
      title: t('teacher.understood.observation'),
      items: items.filter((i) => i.field === 'observation' || i.field === 'participation'),
    },
  ];

  return (
    <Screen
      title={t('teacher.understood.title')}
      subtitle={t('teacher.understood.subtitle', { seconds: num(queued?.durationS ?? 0, locale) })}
      back
      showStorageNote
      testID="screen-v02"
      footer={
        <>
          <Button
            locale={locale}
            testID="apply-voice"
            label={t('teacher.understood.apply')}
            disabled={ready.undecided > 0 || ready.needsUnmentionedChoice}
            onPress={() => {
              update((d) => applyVoice(d, { ...x, items }, decisions, unmentioned));
              router.replace(`/record/${id}/review`);
            }}
          />
          {ready.undecided > 0 || ready.needsUnmentionedChoice ? (
            <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
              {t('teacher.understood.applyHint', {
                count: ready.undecided,
                n: num(ready.undecided, locale),
              })}
            </Text>
          ) : null}
        </>
      }
    >
      {queued ? (
        <Replay locale={locale} source={audioSource(queued)} seconds={queued.durationS} />
      ) : null}

      <Card tone="default" testID="receipt">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[8] }}>
          <Text
            style={[
              textStyle(locale, 'caption'),
              { flex: 1, color: color.muted, textTransform: 'uppercase' },
            ]}
          >
            {t('teacher.understood.transcriptLabel')}
          </Text>
          <StatusBadge locale={locale} tone="neutral" label={t('teacher.understood.receiptOnly')} />
        </View>
        {/* The transcript is always Egyptian Arabic, so it reads right-to-left in both UI languages. */}
        <View style={{ direction: 'rtl' }}>
          <Text
            testID="transcript"
            style={[textStyle('ar', 'body'), { writingDirection: 'rtl', textAlign: 'auto' }]}
          >
            {x.transcript}
          </Text>
        </View>
        <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
          {t('teacher.understood.receiptNote')}
        </Text>
      </Card>

      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <View key={g.key} style={{ gap: space[8] }}>
            <Text
              style={[
                textStyle(locale, 'caption'),
                { color: color.muted, textTransform: 'uppercase' },
              ]}
            >
              {g.title}
            </Text>
            {g.items.map(card)}
          </View>
        ))}

      {x.unmentioned.length ? (
        <Callout
          locale={locale}
          tone="warning"
          title={t('teacher.understood.needsYou')}
          body={t('teacher.understood.unmentioned', {
            count: x.unmentioned.length,
            n: num(x.unmentioned.length, locale),
          })}
        >
          <View
            accessibilityRole="radiogroup"
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[8] }}
          >
            <Chip
              locale={locale}
              testID="unmentioned-present"
              label={t('teacher.understood.markPresent', {
                count: x.unmentioned.length,
                n: num(x.unmentioned.length, locale),
              })}
              selected={unmentioned === 'present'}
              onPress={() => setUnmentioned('present')}
            />
            <Chip
              locale={locale}
              testID="unmentioned-leave"
              label={t('teacher.understood.leaveNotRecorded')}
              selected={unmentioned === 'not_recorded'}
              onPress={() => setUnmentioned('not_recorded')}
            />
          </View>
        </Callout>
      ) : null}
    </Screen>
  );
}

/** Replay the teacher's own recording (FUP-VOI-03 AC1). Media controls are never mirrored (RTL-03). */
function Replay({
  locale,
  source,
  seconds,
}: {
  locale: 'ar' | 'en';
  source: string;
  seconds: number;
}) {
  const { t } = useLocale();
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[12] }}>
        <Button
          locale={locale}
          variant="secondary"
          testID="replay"
          label={status.playing ? t('teacher.understood.pause') : t('teacher.understood.play')}
          onPress={() => {
            if (status.playing) player.pause();
            else {
              if (
                status.didJustFinish ||
                (status.duration && status.currentTime >= status.duration)
              )
                void player.seekTo(0);
              player.play();
            }
          }}
        />
        <View style={{ flex: 1 }}>
          <Text style={textStyle(locale, 'label')}>
            {t('teacher.understood.yourRecording', { seconds: num(seconds, locale) })}
          </Text>
          <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
            {t('teacher.understood.tapToReplay')}
          </Text>
        </View>
      </View>
    </Card>
  );
}
