import type { Tx } from './db';
import { uuidv7 } from './ids';

/**
 * Append-only audit (docs/10 §6): written in the SAME transaction as the change it describes.
 * `before`/`after` carry IDs and states only — never phones, names or codes.
 */
export interface AuditEvent {
  actorId: string | null;
  actorType: 'user' | 'system' | 'provider' | 'ai';
  centreId?: string | null;
  action: string;
  objectType: string;
  objectRef: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  requestId?: string | null;
}

export async function writeAudit(tx: Tx, e: AuditEvent) {
  await tx
    .insertInto('audit.audit_events')
    .values({
      id: uuidv7(),
      actor_id: e.actorId,
      actor_type: e.actorType,
      centre_id: e.centreId ?? null,
      action: e.action,
      object_type: e.objectType,
      object_ref: e.objectRef,
      before: e.before ? JSON.stringify(e.before) : null,
      after: e.after ? JSON.stringify(e.after) : null,
      reason: e.reason ?? null,
      request_id: e.requestId ?? null,
    })
    .execute();
}
