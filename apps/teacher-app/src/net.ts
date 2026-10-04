import { useSyncExternalStore } from 'react';
import { ApiError } from '@link/api-client';

/**
 * Reachability as the app last saw it: a network error (no response at all) marks us offline;
 * any response marks us online. The voice queue and the drafts use this to decide when to sync.
 */
let online = true;
const listeners = new Set<() => void>();

export function reportOnline(ok: boolean) {
  if (ok === online) return;
  online = ok;
  listeners.forEach((l) => l());
}

/** Wrap an API call: records reachability, rethrows the error. */
export async function track<T>(p: Promise<T>): Promise<T> {
  try {
    const v = await p;
    reportOnline(true);
    return v;
  } catch (e) {
    if (e instanceof ApiError) reportOnline(!e.isNetwork);
    throw e;
  }
}

export const isNetworkError = (e: unknown) => e instanceof ApiError && e.isNetwork;

export function useOnline() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => online,
    () => true,
  );
}
