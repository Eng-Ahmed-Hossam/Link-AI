import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fuApi, newIdempotencyKey, type SessionRecord } from '@link/api-client';
import { offlineStore } from '../offline/store';
import { track } from '../net';
import { draftFromRecord, toSaveBody, type Draft } from './logic';

/**
 * Record drafts live on the device (offline store) until the record is confirmed, so a draft
 * survives a restart and a failed save (FUP-REC-07 AC1).
 */
const key = (recordId: string) => `draft:${recordId}`;

export const loadDraft = (recordId: string) => offlineStore.get<Draft>(key(recordId));
export const storeDraft = (d: Draft) =>
  offlineStore.set(key(d.recordId), { ...d, updatedAt: new Date().toISOString() });
export const dropDraft = (recordId: string) => offlineStore.remove(key(recordId));
export async function listDrafts() {
  const keys = await offlineStore.keys('draft:');
  const all = await Promise.all(keys.map((k) => offlineStore.get<Draft>(k)));
  return all.filter((d): d is Draft => !!d);
}

/** Open (or create) the server record for a session and the local draft that mirrors it. */
export async function openDraft(
  groupId: string,
  groupName: string,
  sessionId: string,
): Promise<Draft> {
  const r: SessionRecord = await track(fuApi.openRecord(groupId, sessionId));
  const local = await loadDraft(r.id);
  if (local) return local;
  const d = draftFromRecord(r, groupName, newIdempotencyKey());
  await storeDraft(d);
  return d;
}

/** "Save draft": always on the device; to the server when reachable. Gaps are allowed (FUP-REC-02 AC2). */
export async function saveDraftRemote(d: Draft): Promise<'server' | 'device'> {
  await storeDraft(d);
  try {
    await track(fuApi.saveDraft(d.recordId, toSaveBody(d)));
    return 'server';
  } catch {
    return 'device';
  }
}

export function useDraft(recordId: string | undefined) {
  const [draft, setDraft] = useState<Draft | null | undefined>(undefined);
  // Reload on focus: a screen further up the stack (T07, V02) may have changed the stored draft.
  useFocusEffect(
    useCallback(() => {
      if (!recordId) return;
      let alive = true;
      loadDraft(recordId).then((d) => alive && setDraft(d));
      return () => {
        alive = false;
      };
    }, [recordId]),
  );
  const update = useCallback((fn: (d: Draft) => Draft) => {
    setDraft((cur) => {
      if (!cur) return cur;
      const next = fn(cur);
      void storeDraft(next);
      return next;
    });
  }, []);
  return { draft, update, setDraft };
}
