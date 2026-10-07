'use client';

/**
 * "Try Link with your centre" (landing page, path A): a personalised demo that lives only in this
 * browser. The visitor's centre name renames the sample scenario; they are signed in as the role
 * they chose. Nothing leaves the browser in `mock` mode (the in-browser MSW backend answers);
 * "Reset demo" wipes it all. Demo-only code: the pilot build swaps this module for a stub.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { setApiBaseUrl } from '@link/api-client';
import { demoApi } from '@link/api-client/demo';
import { resetMockDb } from '@link/mocks';
import { resetFollowupDb, setDemo } from '@link/mocks/followup';
import type { Locale } from '@link/i18n';
import type { Session } from '../session';
import { API_BASE_URL, API_MODE } from '../api-mode';

export type TryRole = 'owner' | 'reception' | 'teacher';
export interface TrySession {
  centreName: string;
  role: TryRole;
  teachers: number | null;
  lang: Locale;
  startedAt: number;
  /** The "Want this for your real centre?" card was shown and closed. */
  cardDone?: boolean;
}

export const TRY_KEY = 'link.try';
/** Browser keys the personalised demo uses (wiped by "Reset demo"). */
const DEMO_KEYS = [TRY_KEY, 'link.session', 'link.mock.fu.v4', 'link.mock.db.v1'];

const SESSIONS: Record<Exclude<TryRole, 'teacher'>, Session> = {
  owner: { accessToken: 'mock.usr-owner', userId: 'usr-owner', roles: ['centre_owner'] },
  reception: {
    accessToken: 'mock.usr-reception',
    userId: 'usr-reception',
    roles: ['centre_staff'],
  },
};
const TEACHER_APP = process.env.NEXT_PUBLIC_TEACHER_APP_URL || 'http://localhost:8081';

export function readTry(): TrySession | null {
  try {
    const raw = localStorage.getItem(TRY_KEY);
    return raw ? (JSON.parse(raw) as TrySession) : null;
  } catch {
    return null;
  }
}
export function writeTry(s: TrySession) {
  try {
    localStorage.setItem(TRY_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: the demo still opens, without the banner */
  }
}

/**
 * Sets up the demo and says where to go. Owner and Reception open the owner web here, signed in;
 * a teacher opens the teacher app, which renames its own copy of the scenario. In `mock` mode the
 * scenario is reset right here in the browser (no request at all); with the demo's shared mock
 * server (`pnpm demo`) it is reset there.
 */
export async function startTry(input: {
  centreName: string;
  role: TryRole;
  teachers: number | null;
  lang: Locale;
}): Promise<string> {
  writeTry({ ...input, startedAt: Date.now() });
  if (input.role === 'teacher') {
    const q = new URLSearchParams({ centre: input.centreName, lang: input.lang });
    return `${TEACHER_APP}/try?${q}`;
  }
  const settings = { phase2: true, marketplace: false, offline: false, realStt: false };
  if (API_MODE === 'mock') {
    resetMockDb();
    resetFollowupDb({ centreName: input.centreName });
    setDemo(settings);
  } else {
    // The website pages do not load the app providers, which set the API address: set it here,
    // or these calls would go to the web app itself (404).
    setApiBaseUrl(API_BASE_URL);
    await demoApi.reset(input.centreName);
    await demoApi.settings(settings);
  }
  try {
    localStorage.setItem('link.session', JSON.stringify(SESSIONS[input.role]));
  } catch {
    /* storage blocked: the centre entry asks to sign in */
  }
  return `/${input.lang}/centre/cen-nour/today`;
}

/** True while a personalised demo is on in this browser (read synchronously: no flash of flags). */
export function useTryOn(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => readTry() !== null,
    () => false,
  );
}

/** The visitor's centre name while a personalised demo is on (the owner shell shows it). */
export function useTryCentre(): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => setName(readTry()?.centreName ?? null), []);
  return name;
}

/** "Reset demo": everything the demo kept in this browser, then back to the landing page. */
export function resetTry(lang: Locale) {
  try {
    for (const k of DEMO_KEYS) localStorage.removeItem(k);
  } catch {
    /* nothing stored */
  }
  window.location.assign(`/${lang}`);
}
