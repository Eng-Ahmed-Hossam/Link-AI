import type { Tx } from './db';
import { uuidv7 } from './ids';

/**
 * Transactional outbox (ADR-0003): the event row is written in the same transaction as the change,
 * and the worker's relay publishes it afterwards. Payloads carry IDs and amounts, never PII
 * (CLAUDE.md naming: `entity.past_tense_verb`).
 */
export interface DomainEvent {
  type: string;
  aggregateType: string;
  aggregateId: string;
  centreId?: string | null;
  data: Record<string, unknown>;
  requestId?: string | null;
}

/** The envelope consumers receive (docs/05 §4). */
export interface EventEnvelope {
  id: string;
  type: string;
  version: number;
  occurredAt: string;
  aggregate: { type: string; id: string };
  centreId: string | null;
  data: Record<string, unknown>;
  requestId: string | null;
}

export async function enqueue(tx: Tx, e: DomainEvent): Promise<EventEnvelope> {
  if (!/^[a-z_]+\.[a-z_]+$/.test(e.type)) throw new Error(`bad event type ${e.type}`);
  const envelope: EventEnvelope = {
    id: uuidv7(),
    type: e.type,
    version: 1,
    occurredAt: new Date().toISOString(),
    aggregate: { type: e.aggregateType, id: e.aggregateId },
    centreId: e.centreId ?? null,
    data: e.data,
    requestId: e.requestId ?? null,
  };
  await tx
    .insertInto('platform.outbox_events')
    .values({
      id: envelope.id,
      aggregate_type: e.aggregateType,
      aggregate_id: e.aggregateId,
      type: e.type,
      version: 1,
      payload: JSON.stringify(envelope),
      centre_id: e.centreId ?? null,
      // Events for one aggregate stay in order (FIFO group on the real queue).
      partition_key: `${e.aggregateType}:${e.aggregateId}`,
      trace_id: e.requestId ?? null,
    })
    .execute();
  return envelope;
}
