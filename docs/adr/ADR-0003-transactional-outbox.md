# ADR-0003 · Transactional outbox for events

- **Status:** Accepted — agreed design in the kickoff prompt (§5 Events)
- **Date:** 2026-10-03
- **Deciders:** Founding engineering team

## Context

A business change (e.g. a confirmed enrolment) must reliably trigger other work: notifications, ledger release, cache invalidation, rule checks. Writing to the database and publishing to a queue in two steps ("dual write") loses events or publishes events for changes that rolled back.

## Decision

1. Every module that emits events writes an **`platform.outbox_events`** row **in the same transaction** as the business change (and the audit row).
2. An **outbox relay** (in workers) polls unpublished rows in order, publishes them to the managed queue (SNS+SQS or Pub/Sub, OD-31) with a partition key per aggregate, and marks them published.
3. Delivery is **at-least-once**. Every consumer keeps an **inbox** (`platform.inbox_events`, PK `(consumer, event_id)`) and skips events it has already handled, in the same transaction as its own work.
4. Failing messages are retried with back-off, then parked in a **dead-letter queue**; on-call is alerted on depth; a replay tool re-delivers after a fix.
5. Event contracts (envelope + `data`) are versioned in a schema registry (`packages/config/events`). Only backward-compatible changes; breaking changes get a new version or type. Payloads carry IDs and amounts, never personal data.
6. The `traceId` travels in every event (OpenTelemetry).

Catalogue: [05-architecture.md](../05-architecture.md) §4.

## Consequences

- ✅ No lost or phantom events; the database is the single source of truth.
- ✅ Consumers can be moved to separate services later without changing producers.
- ⚠️ Events arrive slightly later (relay lag; target p95 < 5 s) and may arrive more than once — every consumer must be idempotent.
- ⚠️ Ordering is guaranteed only per partition key; consumers must not assume a global order.
- ⚠️ The outbox table needs a clean-up job (delete published rows after N days).

## Alternatives considered

- **Publish after commit** (in application code). Rejected: crashes between commit and publish lose events.
- **Change data capture (Debezium) from the WAL.** Viable later; more infrastructure than needed now. CDC is planned only for search and analytics feeds.
