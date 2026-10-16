import { API_MODE } from './api-mode';

/**
 * The public trial's sandbox (ADR-0010): on the hosted demo API every visitor works in their own
 * world, named by an unguessable id this browser makes once (128 bits) and keeps. Every API call
 * goes to `<demo API>/sb/<id>/…`; the role chooser hands the same id to the teacher app, so the
 * web and the teacher app share one world. Mock-server mode only (the trial and `pnpm demo`).
 */
const KEY = 'link.sandbox';
export const SANDBOX_ID = /^[A-Za-z0-9_-]{22,64}$/;
let memory: string | null = null;

function newId() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** This browser's sandbox id (made once, then kept). */
export function sandboxId(): string {
  try {
    const kept = localStorage.getItem(KEY);
    if (kept && SANDBOX_ID.test(kept)) return kept;
    const id = newId();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return (memory ??= newId());
  }
}

/** The API base for this visitor: the sandbox in mock-server mode, the base itself otherwise. */
export function withSandbox(base: string) {
  if (API_MODE !== 'mock-server' || typeof window === 'undefined') return base;
  return `${base.replace(/\/$/, '')}/sb/${sandboxId()}`;
}
