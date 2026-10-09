'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, apiConfig, pilotApi, setAuthToken, type Role } from '@link/api-client';
import { CORE_API, PILOT } from './api-mode';

/** core-api (07 §1): like the pilot, the browser keeps no token; the session is read from /v1/me. */
const LIVE = CORE_API;

/**
 * The signed-in person, per API mode:
 * - mock modes: `mock.<user>` tokens in localStorage, so a demo survives a reload;
 * - live (core-api): httpOnly cookies only (15 min access, rotated 30-day refresh, MKT-ACC-04); the
 *   session is read back from `GET /v1/me` and nothing is stored in the browser;
 * - pilot: the pilot server's own httpOnly session, read back from `GET /v1/me` (A3).
 */
export interface Session {
  accessToken: string;
  userId: string;
  roles: Role[];
  /** Live and pilot: the person's centre (from /v1/me). */
  centreId?: string;
  /** Live and pilot: the person's name, for the header. */
  name?: string;
}

interface SessionValue {
  session: Session | null;
  ready: boolean;
  signIn: (s: Session) => void;
  signOut: () => void;
}

const KEY = 'link.session';
const Ctx = createContext<SessionValue>({
  session: null,
  ready: false,
  signIn: () => {},
  signOut: () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (LIVE) {
      // A session that cannot be renewed any more (refresh expired or revoked) signs out here.
      apiConfig.onAuthLost = () => setSession(null);
      api
        .me()
        .then((m) =>
          setSession({
            accessToken: '',
            userId: m.id,
            roles: m.roles,
            centreId: m.centreIds?.[0],
            name: m.name ?? undefined,
          }),
        )
        .catch(() => setSession(null))
        .finally(() => setReady(true));
      return;
    }
    if (PILOT) {
      pilotApi
        .me()
        .then((m) =>
          setSession({
            accessToken: '',
            userId: m.id,
            roles: m.roles,
            centreId: m.centreId,
            name: m.name,
          }),
        )
        .catch(() => setSession(null))
        .finally(() => setReady(true));
      return;
    }
    try {
      const raw = localStorage.getItem(KEY);
      const s = raw ? (JSON.parse(raw) as Session) : null;
      setSession(s);
      setAuthToken(s?.accessToken ?? null);
    } catch {
      /* storage blocked: stay signed out */
    }
    setReady(true);
  }, []);

  const signIn = useCallback((s: Session) => {
    setSession(s);
    if (PILOT || LIVE) return; // the cookie is the session
    setAuthToken(s.accessToken);
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }, []);

  const signOut = useCallback(() => {
    setSession(null);
    if (LIVE) {
      void api.logout().catch(() => {});
      return;
    }
    if (PILOT) {
      void pilotApi.signOut().catch(() => {});
      return;
    }
    setAuthToken(null);
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ session, ready, signIn, signOut }),
    [session, ready, signIn, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
