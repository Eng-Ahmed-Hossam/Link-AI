'use client';

import { newIdempotencyKey } from '@link/api-client';

/**
 * P06 → P07 hand-off. The seat hold is only created when the parent presses Pay on P07
 * (MKT-ENR-02 AC6), so P06 stores a draft. Its Idempotency-Key is generated once, so a retried
 * "Pay" never creates a second hold (07 §1).
 */
export interface ReserveDraft {
  id: string;
  groupId: string;
  studentId: string;
  firstSessionId: string;
  enrolmentKey: string;
}

const key = (id: string) => `link.reserve.${id}`;

export function createDraft(d: Omit<ReserveDraft, 'id' | 'enrolmentKey'>): ReserveDraft {
  const draft = {
    ...d,
    id: `draft-${newIdempotencyKey().slice(0, 8)}`,
    enrolmentKey: newIdempotencyKey(),
  };
  try {
    sessionStorage.setItem(key(draft.id), JSON.stringify(draft));
  } catch {
    /* ignore */
  }
  return draft;
}

export function readDraft(id: string): ReserveDraft | null {
  try {
    const raw = sessionStorage.getItem(key(id));
    return raw ? (JSON.parse(raw) as ReserveDraft) : null;
  } catch {
    return null;
  }
}
