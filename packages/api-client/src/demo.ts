/**
 * Demo controls client (dev only). Talks to `/__demo/*`, which exists only in the mock handlers
 * (`mock` and `mock-server` API modes). Apps render the controls only when APP_ENV=local and the
 * demo flag are set, and never in production builds. Imported only as `@link/api-client/demo`, so
 * the main entry (and every pilot or production bundle) carries no `/__demo` call.
 */
import { apiUrl } from './config';

export interface DemoSnapshot {
  demo: {
    offline: boolean;
    phase2: boolean;
    sttDown: boolean;
    confirmFault: 'before_commit' | 'after_commit' | null;
    marketplace: boolean;
    dayOffset: number;
    /** Voice notes and Ask Link questions go to local Whisper (ai-service) instead of fixtures. */
    realStt?: boolean;
  };
  counters: { confirmCalls: number; confirmCommits: number };
  records: { confirmed: number; drafts: string[] };
  signals: {
    id: string;
    rule: string;
    ruleVersion: number;
    student: string;
    status: string;
    caseId: string | null;
    explanation: string;
    evidence: { recordId: string; sessionDate: string }[];
  }[];
  cases: { id: string; student: string; assignee: string; status: string; dueOn: string }[];
  messages: {
    id: string;
    student: string;
    status: string;
    channel: string | null;
    replies: number;
  }[];
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { detail?: string }).detail ?? `HTTP ${res.status}`);
  return json as T;
}

export const demoApi = {
  state: () => call<DemoSnapshot>('GET', '/__demo/state'),
  /** A fresh demo-followup scenario; `centreName` renames the sample centre (landing, path A). */
  reset: (centreName?: string) =>
    call<{ ok: true }>('POST', '/__demo/reset', { scenario: 'demo-followup', centreName }),
  settings: (patch: Partial<DemoSnapshot['demo']>) =>
    call<DemoSnapshot['demo']>('POST', '/__demo/settings', patch),
  /** Mock provider event: Queued → Sent → Delivered, or → Failed. */
  provider: (outcome: 'advance' | 'fail', messageId?: string) =>
    call<{ id: string; status: string }>('POST', '/__demo/provider', { outcome, messageId }),
  /** "Simulate a new day": open cases' due dates move a day back (an open case becomes overdue). */
  newDay: () => call<{ dayOffset: number; overdue: number }>('POST', '/__demo/new-day', {}),
  /** Delivers the parent reply "عندها درس تاني الأربع" (or another body). */
  reply: (body?: string, messageId?: string) =>
    call<{ messageId: string; caseId: string | null }>('POST', '/__demo/reply', {
      body,
      messageId,
    }),
};

export { PHASE2_FLAGS } from './flags';
