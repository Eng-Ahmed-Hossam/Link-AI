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
import { setAuthToken } from '@link/api-client';

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
    setAuthToken(s.accessToken);
    setSession(s);
    AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});
  }, []);
  const signOut = useCallback(() => {
    setAuthToken(null);
    setSession(null);
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

/** The sample teacher of the demo scenario (Ms Salma, Al Nour). */
export const SAMPLE_TEACHER: Session = { accessToken: 'mock.usr-salma', userId: 'usr-salma' };
