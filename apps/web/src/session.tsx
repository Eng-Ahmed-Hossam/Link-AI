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
import { pilotApi, setAuthToken, type Role } from '@link/api-client';
import { PILOT } from './api-mode';

/**
 * Session for the mock-data frontend. NOT the real auth: real tokens (15 min access, rotating
 * refresh, MKT-ACC-04) arrive with E1-01/E1-02. Mock tokens live in localStorage only so a demo
 * survives a reload.
 *
 * Pilot builds keep nothing in the browser: the server holds the session and the browser only has
 * an httpOnly cookie, so the session is read back from `GET /v1/me` (A3).
 */
export interface Session {
  accessToken: string;
  userId: string;
  roles: Role[];
  /** Pilot: the pilot centre's id (from /v1/me). */
  centreId?: string;
  /** Pilot: the person's first name, for the header. */
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
    if (PILOT) return; // the cookie is the session
    setAuthToken(s.accessToken);
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }, []);

  const signOut = useCallback(() => {
    setSession(null);
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
