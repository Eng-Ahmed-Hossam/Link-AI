import { Platform } from 'react-native';
import { MOCK_SERVER_URL, resolveApiMode } from '@link/api-client';

/** `mock` (in-app handlers) | `mock-server` (shared state over HTTP) | `live` (core-api). */
export const API_MODE = resolveApiMode(
  process.env.EXPO_PUBLIC_API_MODE,
  process.env.EXPO_PUBLIC_USE_MOCKS,
);

/** The Android emulator reaches the dev machine at 10.0.2.2; a phone needs the LAN IP in the env. */
const mockServerUrl = () =>
  Platform.OS === 'android' ? MOCK_SERVER_URL.replace('localhost', '10.0.2.2') : MOCK_SERVER_URL;

export const API_BASE_URL =
  API_MODE === 'mock'
    ? 'http://mock.link.test'
    : (process.env.EXPO_PUBLIC_API_BASE_URL ?? (API_MODE === 'mock-server' ? mockServerUrl() : ''));

/** Demo controls: dev builds only, APP_ENV=local plus the demo flag, never with live data. */
export const DEMO_CONTROLS =
  __DEV__ &&
  process.env.EXPO_PUBLIC_APP_ENV === 'local' &&
  process.env.EXPO_PUBLIC_DEMO_CONTROLS === '1' &&
  API_MODE !== 'live';
