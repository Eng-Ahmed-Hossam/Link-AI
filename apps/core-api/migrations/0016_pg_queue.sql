-- migrate:up
-- A Postgres-backed event queue for a one-server deployment (ship job S1; ADR-0003 keeps SNS/SQS
-- for the cloud). With QUEUE_PROVIDER=postgres each consumer reads the outbox directly: the
-- existing inbox (platform.inbox_events) dedupes, and this table counts failures per consumer and
-- event. After 5 tries an event is dead for that consumer (the DLQ), kept for ops to look at.

CREATE TABLE platform.queue_failures (
  consumer        text NOT NULL,
  event_id        uuid NOT NULL,
  attempts        int  NOT NULL DEFAULT 1 CHECK (attempts > 0),
  last_error      text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  dead_at         timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);
CREATE INDEX queue_failures_dead ON platform.queue_failures (consumer) WHERE dead_at IS NOT NULL;
-- The consumer's scan: recent events in order.
CREATE INDEX outbox_events_created ON platform.outbox_events (created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.queue_failures TO app_worker;
GRANT SELECT ON platform.queue_failures TO app_ops;

-- migrate:down
DROP INDEX platform.outbox_events_created;
DROP TABLE platform.queue_failures;
