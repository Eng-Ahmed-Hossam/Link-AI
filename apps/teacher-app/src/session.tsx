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
import {
  api,
  apiConfig,
  configureAuth,
  pilotApi,
  setAuthToken,
  setRefreshToken,
} from '@link/api-client';
import { CORE_API, PILOT } from './api-mode';
import { tokenStore } from './token-store';

/**
 * Teacher session, per API mode:
 * - mock modes: `mock.<userId>` tokens (refused by core-api), kept in AsyncStorage;
 * - live (core-api): the access token (15 min) and the rotated refresh token (30 days) in the
 *   device's secure storage (MKT-ACC-04); the client renews the access token by itself;
 * - pilot: the pilot server's httpOnly session.
 */
export interface Session {
  accessToken: string;
  userId: string;
  /** Live only. */
  refreshToken?: string;
}

const LIVE = CORE_API;

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
    if (LIVE)
      configureAuth({
        transport: 'bearer',
        // A rotated pair replaces the stored one; a session that cannot be renewed signs out.
        onTokens: (t) => {
          setSession((cur) => {
            if (!cur) return cur;
            const next = { ...cur, ...t };
            void tokenStore.set(KEY, JSON.stringify(next));
            return next;
          });
        },
        onAuthLost: () => {
          setSession(null);
          setAuthToken(null);
          void tokenStore.remove(KEY);
        },
      });
    (LIVE ? tokenStore.get(KEY) : AsyncStorage.getItem(KEY))
      .then((raw) => {
        const s = raw ? (JSON.parse(raw) as Session) : null;
        setAuthToken(s?.accessToken ?? null);
        if (LIVE) setRefreshToken(s?.refreshToken ?? null);
        setSession(s);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const signIn = useCallback((s: Session) => {
    setSession(s);
    if (PILOT) return;
    setAuthToken(s.accessToken);
    if (LIVE) {
      setRefreshToken(s.refreshToken ?? null);
      tokenStore.set(KEY, JSON.stringify(s)).catch(() => {});
      return;
    }
    AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});
  }, []);
  const signOut = useCallback(() => {
    setSession(null);
    if (PILOT) {
      void pilotApi.signOut().catch(() => {});
      return;
    }
    if (LIVE) {
      const refresh = apiConfig.refreshToken; // the current one (the client may have rotated it)
      void (refresh ? api.logout(refresh) : Promise.resolve()).catch(() => {});
      setAuthToken(null);
      setRefreshToken(null);
      tokenStore.remove(KEY).catch(() => {});
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
