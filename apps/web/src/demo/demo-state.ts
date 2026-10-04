'use client';

import { useSyncExternalStore } from 'react';
import { demoApi, type DemoSnapshot } from '@link/api-client/demo';
import { DEMO_CONTROLS } from '../api-mode';

/**
 * Polls the mock backend's demo state while Demo controls are on, so every app (parent PWA, owner
 * web, teacher app) follows the same Phase 2 switch and sees provider events promptly.
 */
let snapshot: DemoSnapshot | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

async function poll() {
  try {
    const next = await demoApi.state();
    if (JSON.stringify(next) !== JSON.stringify(snapshot)) {
      snapshot = next;
      listeners.forEach((l) => l());
    }
  } catch {
    /* offline switch or server down: keep the last snapshot */
  }
}

export const refreshDemoState = poll;

function subscribe(l: () => void) {
  listeners.add(l);
  if (DEMO_CONTROLS && !timer) {
    void poll();
    timer = setInterval(poll, 2000);
  }
  return () => {
    listeners.delete(l);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useDemoState(): DemoSnapshot | null {
  return useSyncExternalStore(
    subscribe,
    () => (DEMO_CONTROLS ? snapshot : null),
    () => null,
  );
}
