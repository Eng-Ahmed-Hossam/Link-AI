'use client';

/**
 * "Try Link" (the website's role chooser, `/{lang}/try`): the visitor picks Parent, Teacher or
 * Centre owner and lands in that role's app, signed in as the sample user. Picking a role never
 * resets data, so every role sees the same story (the local demo's shared mock server); "Reset
 * demo" is the only reset. In `mock` mode nothing leaves the browser. Demo-only code: the pilot
 * build swaps this module for a stub.
 */
import { useSyncExternalStore } from 'react';
import { setApiBaseUrl } from '@link/api-client';
import { demoApi } from '@link/api-client/demo';
import { resetMockDb } from '@link/mocks';
import { resetFollowupDb, setDemo } from '@link/mocks/followup';
import type { Locale } from '@link/i18n';
import type { Session } from '../session';
import { API_BASE_URL, API_MODE } from '../api-mode';

export type TryRole = 'parent' | 'teacher' | 'owner';
export interface TrySession {
  role: TryRole;
  lang: Locale;
  startedAt: number;
  /** The "Want this for your real centre?" card was shown and closed. */
  cardDone?: boolean;
}

export const TRY_KEY = 'link.try';
/** Browser keys the demo uses (wiped by "Reset demo"). */
const DEMO_KEYS = [TRY_KEY, 'link.session', 'link.mock.fu.v4', 'link.mock.db.v1'];

/** The sample accounts (the mock server prints them: code 123456). */
const SESSIONS: Record<Exclude<TryRole, 'teacher'>, Session> = {
  parent: { accessToken: 'mock.usr-parent', userId: 'usr-parent', roles: ['parent'] },
  owner: { accessToken: 'mock.usr-owner', userId: 'usr-owner', roles: ['centre_owner'] },
};
/** Each role's home: owner → Room schedule, parent → Search; the teacher app opens on Groups. */
const HOME: Record<Exclude<TryRole, 'teacher'>, (lang: Locale) => string> = {
  parent: (lang) => `/${lang}/search`,
  owner: (lang) => `/${lang}/centre/cen-nour/schedule`,
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

/** The demo's switches, with no reset: the marketplace and the follow-up product both on (OD-58). */
const SETTINGS = { phase2: true, marketplace: true, offline: false, realStt: false };

/** Signs in the role's sample user and says where to go. */
export async function startTry(input: { role: TryRole; lang: Locale }): Promise<string> {
  const prior = readTry();
  writeTry({ ...input, startedAt: prior?.startedAt ?? Date.now(), cardDone: prior?.cardDone });
  if (input.role === 'teacher')
    return `${TEACHER_APP}/try?${new URLSearchParams({ lang: input.lang })}`;
  if (API_MODE === 'mock') {
    // First visit in this browser: the sample scenario; later visits keep what was done.
    if (!prior) {
      resetMockDb();
      resetFollowupDb();
    }
    setDemo(SETTINGS);
  } else {
    // The website pages load no app providers, which set the API address: set it here, or these
    // calls would go to the web app itself (404).
    setApiBaseUrl(API_BASE_URL);
    await demoApi.settings(SETTINGS);
  }
  try {
    localStorage.setItem('link.session', JSON.stringify(SESSIONS[input.role]));
  } catch {
    /* storage blocked: the app asks to sign in */
  }
  return HOME[input.role](input.lang);
}

/** True while a demo is on in this browser (read synchronously: no flash of flags). */
export function useTryOn(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => readTry() !== null,
    () => false,
  );
}

/** "Reset demo": the shared sample scenario again, this browser's demo data wiped, then home. */
export async function resetTry(lang: Locale) {
  if (API_MODE !== 'mock') {
    setApiBaseUrl(API_BASE_URL);
    await demoApi.reset().catch(() => undefined);
  }
  try {
    for (const k of DEMO_KEYS) localStorage.removeItem(k);
  } catch {
    /* nothing stored */
  }
  window.location.assign(`/${lang}`);
}
