import { ApiError, fuApi, type SessionRecord } from '@link/api-client';
import { track } from '../net';
import { dropDraft, storeDraft } from './drafts';
import { toSaveBody, type Draft } from './logic';

export type ConfirmResult =
  | { ok: true; record: SessionRecord }
  | { ok: false; kind: 'network' | 'server' | 'identity' | 'invalid'; detail: string };

/** Last confirmed record, so T06 can show the receipt without another request. */
export let lastConfirmed: SessionRecord | null = null;

/**
 * Approval 1 (FUP-REC-05 AC3): save the draft, then confirm with the draft's OWN key. The key is
 * stored with the draft, so a retry — even after a restart — never creates a second record.
 */
export async function confirmDraft(d: Draft): Promise<ConfirmResult> {
  await storeDraft(d);
  try {
    await track(fuApi.saveDraft(d.recordId, toSaveBody(d)));
    const record = await track(fuApi.confirmRecord(d.recordId, d.confirmKey));
    lastConfirmed = record;
    await dropDraft(d.recordId);
    return { ok: true, record };
  } catch (e) {
    if (!(e instanceof ApiError)) return { ok: false, kind: 'server', detail: String(e) };
    if (e.isNetwork) return { ok: false, kind: 'network', detail: e.message };
    // Confirmed elsewhere with another key: never pretend this draft was saved.
    if (e.code === 'record_confirmed')
      return { ok: false, kind: 'server', detail: e.problem.detail ?? '' };
    if (e.code === 'identity_unresolved')
      return { ok: false, kind: 'identity', detail: e.problem.detail ?? '' };
    if (e.problem.status === 422)
      return { ok: false, kind: 'invalid', detail: e.problem.detail ?? '' };
    return { ok: false, kind: 'server', detail: e.problem.detail ?? '' };
  }
}
