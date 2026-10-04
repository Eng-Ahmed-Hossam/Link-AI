/**
 * The bridge between the follow-up handlers and ai-service (B3), configured by the server that runs
 * them: the pilot server (real notes, `consented_real`, audio encrypted on disk) or the demo mock
 * server with real speech-to-text switched on (`synthetic`, audio in memory). Browser MSW mode never
 * configures it, so the demo fixtures keep working there and in tests.
 */

/** Where an uploaded recording is kept until ai-service has it (the server decides how). */
export interface AudioStore {
  put(voiceId: string, bytes: Uint8Array, mime: string): void | Promise<void>;
}

let audioStore: AudioStore | null = null;
let internalToken: string | null = null;
let assistantStt: ((audio: Uint8Array, mime: string) => Promise<string>) | null = null;

export function configureBridge(opts: {
  audioStore?: AudioStore | null;
  internalToken?: string | null;
  assistantStt?: ((audio: Uint8Array, mime: string) => Promise<string>) | null;
}) {
  if (opts.audioStore !== undefined) audioStore = opts.audioStore;
  if (opts.internalToken !== undefined) internalToken = opts.internalToken;
  if (opts.assistantStt !== undefined) assistantStt = opts.assistantStt;
}

export const bridge = {
  get audioStore() {
    return audioStore;
  },
  get internalToken() {
    return internalToken;
  },
  get assistantStt() {
    return assistantStt;
  },
};
