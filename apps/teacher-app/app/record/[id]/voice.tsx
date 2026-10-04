import { useEffect, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { ApiError, fuApi, isExtractionReady, newIdempotencyKey } from '@link/api-client';
import { Button, Callout, Card, RecordButton, StateView, textStyle } from '@link/ui-native';
import { color, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { useOnline } from '@/net';
import { useDraft } from '@/record/drafts';
import { enqueue, processQueue, useVoiceQueue } from '@/offline/voiceQueue';
import { dayMonth, num } from '@/format';
import { Screen } from '@/ui/Screen';

type Phase =
  | 'idle'
  | 'recording'
  | 'saving'
  | 'processing'
  | 'queued'
  | 'cancelled'
  | 'stt_down'
  | 'stt_failed';
/** B3: give up waiting after 3 minutes (the server says so too); the audio is kept for a retry. */
const GIVE_UP_MS = 190_000;
type Perm = 'unknown' | 'granted' | 'ask' | 'denied';

/**
 * V01 · Voice note — recording (FUP-VOI-01). Hold to record, release to finish, slide toward the
 * start edge to cancel, with a timer. Nothing is saved until the teacher reviews what the AI
 * understood. The recording goes to the device queue first, so it survives being offline or a
 * restart. If speech-to-text is down, "Type the note instead" (FUP-VOI-06).
 */
export default function Voice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale, t } = useLocale();
  const router = useRouter();
  const online = useOnline();
  const { draft } = useDraft(id);
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const rec = useAudioRecorderState(recorder, 100);
  const [phase, setPhase] = useState<Phase>('idle');
  const [perm, setPerm] = useState<Perm>('unknown');
  const [levels, setLevels] = useState<number[]>([]);
  const localId = useRef<string | null>(null);
  /** True once the first upload attempt for this recording has finished (either way). */
  const [tried, setTried] = useState(false);
  /** Seconds left, as the server estimates (real speech-to-text); null = no estimate. */
  const [eta, setEta] = useState<number | null>(null);
  /** Bumped by "Try again" to restart the wait. */
  const [attempt, setAttempt] = useState(0);
  const queue = useVoiceQueue();

  useEffect(() => {
    getRecordingPermissionsAsync()
      .then((p) => setPerm(p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'denied'))
      .catch(() => setPerm('ask'));
  }, []);

  // Level meter from metering (dBFS, about -60…0).
  useEffect(() => {
    if (phase !== 'recording') return;
    const m = rec.metering;
    const v = m == null ? 0.35 + Math.random() * 0.3 : Math.max(0, Math.min(1, (m + 60) / 60));
    setLevels((l) => [...l.slice(-40), v]);
  }, [rec.durationMillis, rec.metering, phase]);

  // After upload, wait for the extraction, then go to V02.
  const mine = queue.find((n) => n.localId === localId.current);
  useEffect(() => {
    if (phase !== 'processing' && phase !== 'queued') return;
    if (!mine || !tried) return;
    if (mine.status !== 'uploaded' || !mine.voiceNoteId) {
      setPhase('queued');
      return;
    }
    setPhase('processing');
    let alive = true;
    const since = Date.now();
    const poll = async () => {
      while (alive) {
        if (Date.now() - since > GIVE_UP_MS) {
          setPhase('stt_failed');
          return;
        }
        try {
          const x = await fuApi.extraction(mine.voiceNoteId!);
          if (!isExtractionReady(x)) setEta(x.etaSeconds ?? null);
          if (isExtractionReady(x)) {
            router.replace({
              pathname: '/record/[id]/understood',
              params: { id, voice: mine.voiceNoteId!, local: mine.localId },
            });
            return;
          }
        } catch (e) {
          if (e instanceof ApiError && e.code === 'stt_unavailable') {
            setPhase('stt_down');
            return;
          }
          if (e instanceof ApiError && (e.code === 'stt_failed' || e.code === 'stt_timeout')) {
            setPhase('stt_failed');
            return;
          }
          if (e instanceof ApiError && e.isNetwork) {
            setPhase('queued');
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 800));
      }
    };
    void poll();
    return () => {
      alive = false;
    };
  }, [mine?.status, mine?.voiceNoteId, tried, attempt]);

  async function retry() {
    if (!mine?.voiceNoteId) return;
    try {
      await fuApi.retryVoice(mine.voiceNoteId);
      setEta(null);
      setPhase('processing');
      setAttempt((n) => n + 1);
    } catch {
      setPhase('stt_failed');
    }
  }

  async function ensurePermission() {
    if (perm === 'granted') return true;
    const p = await requestRecordingPermissionsAsync();
    setPerm(p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'denied');
    return p.granted;
  }

  async function start() {
    if (!(await ensurePermission())) return;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setLevels([]);
    setPhase('recording');
  }

  async function finish() {
    if (phase !== 'recording') return;
    setPhase('saving');
    const durationS = Math.max(1, Math.round(rec.durationMillis / 1000));
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) {
      setPhase('idle');
      return;
    }
    const lid = newIdempotencyKey();
    localId.current = lid;
    await enqueue({ localId: lid, recordId: id, durationS, uri });
    setTried(false);
    setPhase('processing');
    await processQueue();
    setTried(true);
  }

  async function cancel() {
    if (phase !== 'recording') return;
    await recorder.stop().catch(() => {});
    setPhase('cancelled'); // discarded: nothing queued, nothing saved
  }

  // Back to the T04 this screen was opened from: its text field is the typed alternative.
  const typeInstead = () => router.back();

  return (
    <Screen
      title={t('teacher.voice.title')}
      subtitle={
        draft
          ? `${draft.groupName} • ${dayMonth(draft.sessionDate, locale)} • ${t('teacher.voice.holdAndSpeak')}`
          : undefined
      }
      back
      showStorageNote
      testID="screen-v01"
    >
      {perm === 'denied' ? (
        <Callout
          locale={locale}
          tone="error"
          role="alert"
          title={t('teacher.voice.micOffTitle')}
          body={t('teacher.voice.micOffBody')}
        >
          <Button
            locale={locale}
            variant="secondary"
            label={t('teacher.voice.openSettings')}
            onPress={() => Linking.openSettings().catch(() => {})}
          />
        </Callout>
      ) : null}

      {phase === 'processing' || phase === 'saving' ? (
        <StateView
          locale={locale}
          kind="loading"
          title={t('teacher.voice.processing')}
          body={
            eta != null
              ? t('teacher.voice.processingEta', { count: eta, n: num(eta, locale) })
              : t('teacher.voice.processingBody')
          }
        />
      ) : phase === 'stt_failed' ? (
        <Callout
          locale={locale}
          tone="warning"
          role="alert"
          title={t('teacher.voice.failedTitle')}
          body={t('teacher.voice.failedBody')}
        >
          <Button
            locale={locale}
            variant="secondary"
            testID="voice-retry"
            label={t('teacher.voice.retry')}
            onPress={retry}
          />
        </Callout>
      ) : phase === 'queued' ? (
        <Callout
          locale={locale}
          tone="warning"
          role="alert"
          title={t('teacher.voice.queuedTitle')}
          body={t('teacher.voice.queuedBody')}
        >
          <Button
            locale={locale}
            variant="secondary"
            label={t('teacher.voice.backToRecord')}
            onPress={() => router.back()}
          />
        </Callout>
      ) : phase === 'stt_down' ? (
        <Callout
          locale={locale}
          tone="warning"
          role="alert"
          title={t('teacher.voice.sttDownTitle')}
          body={t('teacher.voice.sttDownBody')}
        />
      ) : (
        <RecordButton
          locale={locale}
          recording={phase === 'recording'}
          elapsedMs={rec.durationMillis}
          levels={levels}
          disabled={perm === 'denied'}
          labels={{
            hold: t('teacher.voice.hold'),
            release: t('teacher.voice.release'),
            slide: t('teacher.voice.slide'),
            cancelArmed: t('teacher.voice.cancelArmed'),
            recording: t('teacher.voice.recording'),
            a11yName: t('teacher.voice.a11yName'),
          }}
          onStart={start}
          onFinish={finish}
          onCancel={cancel}
        />
      )}

      {phase === 'recording' ? (
        <Button
          locale={locale}
          variant="secondary"
          danger
          testID="cancel-recording"
          label={t('teacher.voice.cancel')}
          onPress={cancel}
        />
      ) : null}
      {phase === 'cancelled' ? (
        <Text
          accessibilityLiveRegion="polite"
          testID="recording-cancelled"
          style={[textStyle(locale, 'body'), { color: color.muted }]}
        >
          {t('teacher.voice.cancelled')}
        </Text>
      ) : null}
      {!online && phase === 'idle' ? (
        <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
          {t('teacher.voice.offlineHint')}
        </Text>
      ) : null}

      <Card>
        <Text style={textStyle(locale, 'heading')}>{t('teacher.voice.tipsTitle')}</Text>
        <View style={{ gap: space[4] }}>
          {[t('teacher.voice.tipWho'), t('teacher.voice.tipWhat'), t('teacher.voice.tipNext')].map(
            (x) => (
              <Text key={x} style={[textStyle(locale, 'body'), { color: color.muted }]}>
                {'•'} {x}
              </Text>
            ),
          )}
        </View>
      </Card>
      <Callout locale={locale} tone="info" body={t('teacher.voice.nothingSaved')} />
      <Button
        locale={locale}
        variant="quiet"
        testID="type-instead"
        label={t('teacher.voice.typeInstead')}
        onPress={typeInstead}
      />
    </Screen>
  );
}
