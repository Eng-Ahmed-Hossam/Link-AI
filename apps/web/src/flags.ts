'use client';

import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, PHASE2_FLAGS } from '@link/api-client';
import { useDemoState, useTryOn } from '@demo';
import { CORE_API, PILOT } from './api-mode';
import { useSession } from './session';

/**
 * Feature flags. Keys match the seed (`platform.feature_flags`, docs/14 §4). Phase 2–3 items are
 * OFF and do not render at all when off. Until core-api serves flags (E0-09), defaults live here
 * and a dev-only panel can override them locally (localStorage `link.flags`) for demos.
 */
export const FLAG_DEFAULTS = {
  /** Phase 1 marketplace surfaces (owner nav marketplace items). On by default; the MVP pilot turns it off (CF-29). */
  'marketplace.enabled': true,
  /** Ask Link (V03/V07). Its answers are fixtures until the AI service exists, so the pilot hides it. */
  'followup.assistant': true,
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
  // Demo controls (dev only) switch the Phase 2 flags for every app at once; local overrides still win.
  const demo = useDemoState();
  const phase2 = demo
    ? {
        ...Object.fromEntries(PHASE2_FLAGS.map((k) => [k, demo.demo.phase2])),
        'marketplace.enabled': demo.demo.marketplace !== false,
      }
    : {};
  // "Try Link" (the role chooser, /try) shows the whole product: marketplace + the Follow-up extra.
  const tryOn = useTryOn();
  // Live: core-api serves the flags (global, merged with the person's centre and teacher scopes).
  const { session } = useSession();
  const server = useQuery({
    queryKey: ['feature-flags', session?.userId ?? null],
    queryFn: api.featureFlags,
    enabled: CORE_API,
    staleTime: 30_000,
  });
  if (PILOT) return { ...FLAG_DEFAULTS, ...PILOT_FLAGS };
  if (CORE_API) {
    const known = Object.entries(server.data?.flags ?? {}).filter(([k]) => k in FLAG_DEFAULTS);
    return {
      ...FLAG_DEFAULTS,
      ...(Object.fromEntries(known) as Partial<Record<FlagKey, boolean>>),
    };
  }
  if (tryOn) return { ...FLAG_DEFAULTS, ...TRY_FLAGS, ...phase2Overrides(raw) };
  return {
    ...FLAG_DEFAULTS,
    ...phase2,
    ...(JSON.parse(raw) as Partial<Record<FlagKey, boolean>>),
  };
}

/**
 * The concierge pilot (docs/13): the follow-up loop only. No marketplace, no Ask Link, no voice
 * notes until real speech-to-text lands (Part B), no parent app.
 */
const PILOT_FLAGS: Partial<Record<FlagKey, boolean>> = {
  'marketplace.enabled': false,
  'followup.assistant': false,
  'followup.owner_nav': true,
  'followup.records': true,
  'followup.voice_notes': false,
  'followup.whatsapp_updates': true,
};

/**
 * "Try Link" from the role chooser: one connected product — the marketplace, plus the Follow-up
 * paid extra for the sample centre (OD-58; which centres have it is per centre, not a flag), the
 * demo-only Ask Link (scripted answers, labelled) and the parent feed.
 */
const TRY_FLAGS: Partial<Record<FlagKey, boolean>> = {
  'marketplace.enabled': true,
  'followup.assistant': true,
  'followup.owner_nav': true,
  'followup.records': true,
  'followup.voice_notes': true,
  'followup.whatsapp_updates': true,
  'parent.updates_feed': true,
};
/** Local overrides (dev only) still win over the try flags. */
const phase2Overrides = (raw: string) => JSON.parse(raw) as Partial<Record<FlagKey, boolean>>;

export const useFlag = (key: FlagKey) => useFlags()[key];
