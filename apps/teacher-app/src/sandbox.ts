import { Platform } from 'react-native';
import { API_MODE } from './api-mode';

/**
 * The public trial's sandbox (ADR-0010) on the teacher app's web build: the website's role chooser
 * opens `/try?sandbox=<id>`, so the teacher works in the same world as the visitor's web pages.
 * Opened directly, the app makes its own id. Every API call goes to `<demo API>/sb/<id>/…`.
 * Mock-server mode on the web only (the trial and `pnpm demo`); phones and live mode unchanged.
 */
const KEY = 'link.sandbox';
const SANDBOX_ID = /^[A-Za-z0-9_-]{22,64}$/;

function newId() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function sandboxId(): string | null {
  if (Platform.OS !== 'web' || API_MODE !== 'mock-server') return null;
  try {
    const given = new URLSearchParams(window.location.search).get('sandbox');
    if (given && SANDBOX_ID.test(given)) {
      localStorage.setItem(KEY, given);
      return given;
    }
    const kept = localStorage.getItem(KEY);
    if (kept && SANDBOX_ID.test(kept)) return kept;
    const id = newId();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return null;
  }
}

export function withSandbox(base: string) {
  const id = sandboxId();
  return id ? `${base.replace(/\/$/, '')}/sb/${id}` : base;
}
