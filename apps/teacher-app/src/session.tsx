import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pilotApi, setAuthToken } from '@link/api-client';
import { PILOT } from './api-mode';

/**
 * Teacher session for the mock-data app. NOT the real auth (T14 phone OTP arrives in Batch 3);
 * mock tokens are `mock.<userId>` and are refused by core-api.
 */
export interface Session {
  accessToken: string;
  userId: string;
}

interface SessionValue {
  session: Session | null;
  ready: boolean;
  signIn: (s: Session) => void;
  signOut: () => void;
}

const KEY = 'link.teacher.session';
const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (PILOT) {
      // Pilot (A3): the server holds the session (httpOnly cookie); nothing is stored on the phone.
      pilotApi
        .me()
        .then((m) => setSession({ accessToken: '', userId: m.id }))
        .catch(() => setSession(null))
        .finally(() => setReady(true));
      return;
    }
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const s = raw ? (JSON.parse(raw) as Session) : null;
        setAuthToken(s?.accessToken ?? null);
        setSession(s);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const signIn = useCallback((s: Session) => {
    setSession(s);
    if (PILOT) return;
    setAuthToken(s.accessToken);
    AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});
  }, []);
  const signOut = useCallback(() => {
    setSession(null);
    if (PILOT) {
      void pilotApi.signOut().catch(() => {});
      return;
    }
    setAuthToken(null);
    AsyncStorage.removeItem(KEY).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ session, ready, signIn, signOut }),
    [session, ready, signIn, signOut],
  );
  // Render nothing until the stored session (and its token) is loaded, so no call goes out unsigned.
  return <Ctx.Provider value={value}>{ready ? children : null}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
