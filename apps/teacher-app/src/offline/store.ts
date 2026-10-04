import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Storage for things that must survive an app restart: record drafts and the voice-note queue.
 * Screens use this interface only, so the encrypted store (FUP-VOI-01 AC4, a pending story) can
 * replace the dev implementation without touching them.
 */
export interface OfflineStore {
  readonly encrypted: boolean;
  /** Shown in the UI next to anything stored with it. */
  readonly label: string;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

const NS = 'link.offline.';

/** DEV ONLY — AsyncStorage (localStorage on web). NOT ENCRYPTED: placeholder until FUP-VOI-01 AC4. */
export const devStore: OfflineStore = {
  encrypted: false,
  label: 'not encrypted — placeholder',
  async get<T>(key: string) {
    const raw = await AsyncStorage.getItem(NS + key);
    return raw == null ? null : (JSON.parse(raw) as T);
  },
  async set<T>(key: string, value: T) {
    await AsyncStorage.setItem(NS + key, JSON.stringify(value));
  },
  async remove(key: string) {
    await AsyncStorage.removeItem(NS + key);
  },
  async keys(prefix: string) {
    const all = await AsyncStorage.getAllKeys();
    return all.filter((k) => k.startsWith(NS + prefix)).map((k) => k.slice(NS.length));
  },
};

export const offlineStore: OfflineStore = devStore;
