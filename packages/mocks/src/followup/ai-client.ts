/**
 * Talks to ai-service (apps/ai-service) on this machine: hands over a voice note, or transcribes an
 * Ask Link question. Used by the pilot server (data class `consented_real`) and by the demo mock
 * server with real speech-to-text on (`synthetic`). Node only.
 */
import { setVoiceEta, setVoiceResult, type VoiceDispatch } from './db';

export interface AiTarget {
  url: string;
  token: string;
  dataClass: 'synthetic' | 'consented_real';
  /** Where ai-service posts the result back (this server's internal route). */
  callbackBase: string;
}

export async function sendVoiceJob(
  ai: AiTarget,
  d: VoiceDispatch,
  audio: { bytes: Uint8Array; mime: string } | null,
): Promise<void> {
  if (!audio) {
    setVoiceResult(d.voiceId, { status: 'failed', code: 'audio_missing' });
    return;
  }
  const form = new FormData();
  form.append('audio', new Blob([audio.bytes as BlobPart], { type: audio.mime }), 'note');
  form.append(
    'meta',
    JSON.stringify({
      jobId: d.voiceId,
      dataClass: ai.dataClass,
      roster: d.roster,
      assessment: d.assessment,
      callbackUrl: `${ai.callbackBase}/v1/internal/voice-results/${d.voiceId}`,
      durationS: d.durationS,
    }),
  );
  try {
    const r = await fetch(`${ai.url}/v1/jobs`, {
      method: 'POST',
      headers: { 'x-link-internal-token': ai.token },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`ai-service ${r.status}`);
    const body = (await r.json()) as { etaSeconds?: number };
    if (body.etaSeconds) setVoiceEta(d.voiceId, body.etaSeconds);
  } catch {
    // ai-service down: the teacher sees "Type the note instead" and can try again later.
    setVoiceResult(d.voiceId, { status: 'failed', code: 'stt_unavailable' });
  }
}

export async function transcribeQuestion(ai: AiTarget, audio: Uint8Array, mime: string) {
  const form = new FormData();
  form.append('audio', new Blob([audio as BlobPart], { type: mime }), 'question');
  form.append('dataClass', ai.dataClass);
  const r = await fetch(`${ai.url}/v1/transcribe`, {
    method: 'POST',
    headers: { 'x-link-internal-token': ai.token },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`ai-service ${r.status}`);
  return ((await r.json()) as { text: string }).text;
}

/** Is ai-service up, with its speech model loaded? */
export async function aiReady(url: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/ready`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return false;
    return !!((await r.json()) as { stt?: { loaded?: boolean } }).stt?.loaded;
  } catch {
    return false;
  }
}
