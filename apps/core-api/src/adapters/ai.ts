/**
 * core-api → ai-service (docs/09 §2, ADR-0007). ai-service runs on this machine only (127.0.0.1,
 * shared token): local Whisper for speech-to-text, the `link_nlp` roster matcher (never guesses a
 * student) and, when configured, a local Ollama model. It writes nothing itself: the proposal comes
 * back to `POST /v1/internal/voice-results/{id}`.
 */
export interface VoiceJob {
  voiceId: string;
  dataClass: 'synthetic' | 'consented_real';
  roster: { id: string; displayName: string; nicknames: string[] }[];
  assessment: { title: string; maxScore: number } | null;
  durationS: number;
  /** Adults who may be named in a note (the teacher): never sent to an LLM, never a student. */
  extraNames: string[];
  callbackUrl: string;
}
export interface VoiceAi {
  /** Whether the service is local (a `consented_real` note may only go to a local one). */
  readonly local: boolean;
  submit(
    job: VoiceJob,
    audio: { bytes: Uint8Array; mime: string },
  ): Promise<{ etaSeconds: number | null }>;
}
export const VOICE_AI = Symbol('VOICE_AI');

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
export const isLoopback = (url: string) => {
  try {
    return LOOPBACK.has(new URL(url).hostname);
  } catch {
    return false;
  }
};

export class AiServiceClient implements VoiceAi {
  readonly local: boolean;
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {
    this.local = isLoopback(url);
  }

  async submit(job: VoiceJob, audio: { bytes: Uint8Array; mime: string }) {
    const form = new FormData();
    form.append(
      'audio',
      new Blob([audio.bytes as unknown as ArrayBuffer], { type: audio.mime }),
      'note',
    );
    form.append(
      'meta',
      JSON.stringify({
        jobId: job.voiceId,
        dataClass: job.dataClass,
        roster: job.roster,
        assessment: job.assessment,
        callbackUrl: job.callbackUrl,
        durationS: job.durationS,
        extraNames: job.extraNames,
      }),
    );
    const r = await fetch(`${this.url}/v1/jobs`, {
      method: 'POST',
      headers: { 'x-link-internal-token': this.token },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`ai-service ${r.status}`);
    const body = (await r.json()) as { etaSeconds?: number };
    return { etaSeconds: body.etaSeconds ?? null };
  }
}
