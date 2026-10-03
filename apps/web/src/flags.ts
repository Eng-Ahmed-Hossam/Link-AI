'use client';

import { useSyncExternalStore } from 'react';

/**
 * Feature flags. Keys match the seed (`platform.feature_flags`, docs/14 §4). Phase 2–3 items are
 * OFF and do not render at all when off. Until core-api serves flags (E0-09), defaults live here
 * and a dev-only panel can override them locally (localStorage `link.flags`) for demos.
 */
export const FLAG_DEFAULTS = {
  'followup.owner_nav': false,
  'followup.records': false,
  'followup.voice_notes': false,
  'followup.whatsapp_updates': false,
  /** P09 "Updates from the centre" feed (Phase 2). */
  'parent.updates_feed': false,
  /** P05 "% recorded" badge (Phase 2). */
  'teacher.recorded_badge': false,
  'analytics.topic_scores': false,
  'analytics.focus_plans': false,
  'landing.phase2_sections': false,
  'ai.review_moderation': false,
} as const;

export type FlagKey = keyof typeof FLAG_DEFAULTS;

const KEY = 'link.flags';
const listeners = new Set<() => void>();

function overrides(): Partial<Record<FlagKey, boolean>> {
  if (process.env.NODE_ENV === 'production') return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function setFlagOverride(key: FlagKey, value: boolean | null) {
  const o = overrides();
  if (value === null) delete o[key];
  else o[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

const snapshot = () => JSON.stringify(overrides());

export function useFlags(): Record<FlagKey, boolean> {
  const raw = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    snapshot,
    () => '{}',
  );
  return { ...FLAG_DEFAULTS, ...(JSON.parse(raw) as Partial<Record<FlagKey, boolean>>) };
}

export const useFlag = (key: FlagKey) => useFlags()[key];
