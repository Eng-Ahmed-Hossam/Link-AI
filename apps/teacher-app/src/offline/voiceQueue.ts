import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { File, Directory, Paths } from 'expo-file-system';
import { ApiError, apiUrl, fuApi } from '@link/api-client';
import { offlineStore } from './store';
import { reportOnline, track } from '../net';

/**
 * Offline voice queue (FUP-VOI-01 AC4). A recording is written to the device first, then uploaded
 * when there is a connection; the queue survives an app restart. The dev store is NOT encrypted
 * (placeholder); the encrypted on-device queue is a pending story.
 */
export interface QueuedNote {
  localId: string;
  recordId: string;
  durationS: number;
  createdAt: string;
  /** Native: a file in the app's document folder. Web preview: a data URL in the store. */
  audio: { kind: 'file'; uri: string } | { kind: 'data'; dataUrl: string };
  /** `rejected`: the server refused the note for good (e.g. voice switched off); not retried. */
  status: 'queued' | 'uploading' | 'uploaded' | 'rejected';
  voiceNoteId?: string;
  /** Where the server said to upload (the pilot's own route, or the mock's signed URL). */
  uploadUrl?: string;
}

const KEY = 'voice-queue';
let cache: QueuedNote[] | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function read(): Promise<QueuedNote[]> {
  cache ??= (await offlineStore.get<QueuedNote[]>(KEY)) ?? [];
  return cache;
}
async function write(list: QueuedNote[]) {
  cache = list;
  await offlineStore.set(KEY, list);
  emit();
}

/** Copy the recorder's temporary file somewhere that survives a restart. */
async function persistAudio(localId: string, uri: string): Promise<QueuedNote['audio']> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    return { kind: 'data', dataUrl };
  }
  const dir = new Directory(Paths.document, 'voice-queue');
  if (!dir.exists) dir.create({ intermediates: true });
  const target = new File(dir, `${localId}.m4a`);
  await new File(uri).copy(target);
  return { kind: 'file', uri: target.uri };
}

export async function enqueue(n: {
  localId: string;
  recordId: string;
  durationS: number;
  uri: string;
}) {
  const audio = await persistAudio(n.localId, n.uri);
  const list = await read();
  await write([
    ...list,
    {
      localId: n.localId,
      recordId: n.recordId,
      durationS: n.durationS,
      createdAt: new Date().toISOString(),
      audio,
      status: 'queued',
    },
  ]);
}

async function body(n: QueuedNote): Promise<Uint8Array | Blob> {
  if (n.audio.kind === 'data') return (await fetch(n.audio.dataUrl)).blob();
  return new File(n.audio.uri).bytes();
}

let running: Promise<void> | null = null;

/** Upload every queued note. Safe to call often: one run at a time; keys make retries idempotent. */
export function processQueue(): Promise<void> {
  // A run in progress may have started before the newest note was queued: run again after it.
  if (running) return running.then(() => processQueue());
  running = (async () => {
    try {
      for (const n of await read()) {
        if (n.status === 'uploaded' || n.status === 'rejected') continue;
        try {
          // The local id is the Idempotency-Key: a retry after a lost response never creates a second note.
          const vn = n.voiceNoteId
            ? { id: n.voiceNoteId, uploadUrl: n.uploadUrl ?? `/__mock/uploads/${n.voiceNoteId}` }
            : await track(
                fuApi.createVoiceNote(
                  { sessionRecordId: n.recordId, durationS: n.durationS },
                  n.localId,
                ),
              );
          await write(
            (await read()).map((x) =>
              x.localId === n.localId
                ? { ...x, voiceNoteId: vn.id, uploadUrl: vn.uploadUrl, status: 'uploading' }
                : x,
            ),
          );
          const audio = await body(n);
          const put = await fetch(apiUrl(vn.uploadUrl), {
            method: 'PUT',
            headers: {
              'content-type': audio instanceof Blob && audio.type ? audio.type : 'audio/mp4',
            },
            body: audio as BodyInit,
          });
          if (!put.ok) throw new Error(`upload ${put.status}`);
          await track(fuApi.voiceUploaded(vn.id));
          await write(
            (await read()).map((x) => (x.localId === n.localId ? { ...x, status: 'uploaded' } : x)),
          );
        } catch (e) {
          if (e instanceof TypeError) reportOnline(false); // fetch could not reach the server
          const s = e instanceof ApiError ? e.problem.status : 0;
          if (s >= 400 && s < 500 && s !== 408 && s !== 429) {
            // Refused for good (not this teacher's group, voice off…): stop retrying this note.
            await write(
              (await read()).map((x) =>
                x.localId === n.localId ? { ...x, status: 'rejected' } : x,
              ),
            );
            continue;
          }
          break; // offline or server error: keep the queue and try again later
        }
      }
    } finally {
      running = null;
    }
  })();
  return running;
}

let worker: ReturnType<typeof setInterval> | null = null;
/** Started once by the root layout: on launch, then every few seconds. */
export function startQueueWorker() {
  if (worker) return;
  void processQueue();
  worker = setInterval(() => {
    if (!running) void processQueue();
  }, 4000);
}

export async function forget(localId: string) {
  await write((await read()).filter((x) => x.localId !== localId));
}

export function useVoiceQueue(): QueuedNote[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      if (!cache) void read().then(emit);
      return () => listeners.delete(l);
    },
    () => cache ?? EMPTY,
    () => EMPTY,
  );
}
const EMPTY: QueuedNote[] = [];

export const audioSource = (n: QueuedNote) =>
  n.audio.kind === 'data' ? n.audio.dataUrl : n.audio.uri;
