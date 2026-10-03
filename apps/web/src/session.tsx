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
import { setAuthToken, type Role } from '@link/api-client';

/**
 * Session for the mock-data frontend. NOT the real auth: real tokens (15 min access, rotating
 * refresh, MKT-ACC-04) arrive with E1-01/E1-02. Mock tokens live in localStorage only so a demo
 * survives a reload.
 */
export interface Session {
  accessToken: string;
  userId: string;
  roles: Role[];
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
    setAuthToken(s.accessToken);
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }, []);

  const signOut = useCallback(() => {
    setSession(null);
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
