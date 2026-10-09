import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Where the teacher app keeps its session (07 §1, MKT-ACC-04). On a phone: the OS secure storage
 * (Keychain / Keystore) via expo-secure-store. The web build (`pnpm dev`, the e2e runs) has no
 * secure storage, so it falls back to the browser's storage: that build is a development and
 * demo surface, never how teachers run the app.
 */
const secure = Platform.OS !== 'web';

export const tokenStore = {
  async get(key: string) {
    return secure ? SecureStore.getItemAsync(key) : AsyncStorage.getItem(key);
  },
  async set(key: string, value: string) {
    if (secure) await SecureStore.setItemAsync(key, value);
    else await AsyncStorage.setItem(key, value);
  },
  async remove(key: string) {
    if (secure) await SecureStore.deleteItemAsync(key);
    else await AsyncStorage.removeItem(key);
  },
};
