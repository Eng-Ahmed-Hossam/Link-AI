-- migrate:up
-- Platform tables (docs/06 §10, ADR-0003) and the append-only audit log (docs/06 §10, INV-02).
-- platform.* is SYSTEM (app_worker), except where a request must write in its own transaction:
-- app_user INSERTs outbox rows and idempotency keys, and reads feature flags.

-- ── Outbox (ADR-0003) ─────────────────────────────────────────────────────────
CREATE TABLE platform.outbox_events (
  id             uuid PRIMARY KEY,               -- the event ID (UUIDv7)
  aggregate_type text NOT NULL,
  aggregate_id   uuid NOT NULL,
  type           text NOT NULL,                  -- entity.past_tense_verb
  version        int  NOT NULL DEFAULT 1 CHECK (version >= 1),
  payload        jsonb NOT NULL,                 -- the full envelope (docs/05 §4); IDs and amounts only
  centre_id      uuid,
  partition_key  text NOT NULL,
  trace_id       text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  published_at   timestamptz,
  attempts       int  NOT NULL DEFAULT 0,
  last_error     text,
  CHECK (type ~ '^[a-z_]+\.[a-z_]+$')
);
CREATE INDEX outbox_events_unpublished ON platform.outbox_events (created_at) WHERE published_at IS NULL;

GRANT INSERT ON platform.outbox_events TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.outbox_events TO app_worker;  -- relay + clean-up
GRANT SELECT ON platform.outbox_events TO app_ops;

-- ── Inbox: consumer dedupe (ADR-0003 §3) ──────────────────────────────────────
CREATE TABLE platform.inbox_events (
  consumer     text NOT NULL,
  event_id     uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);
GRANT SELECT, INSERT, DELETE ON platform.inbox_events TO app_worker;
GRANT SELECT ON platform.inbox_events TO app_ops;

-- ── Idempotency keys (BR-MNY-04, E0-07) ───────────────────────────────────────
-- Durable copy for money endpoints; Redis `idem:{key}` serves the rest.
CREATE TABLE platform.idempotency_keys (
  user_id       uuid NOT NULL,
  key           text NOT NULL CHECK (length(key) BETWEEN 8 AND 255),
  method_path   text NOT NULL,
  request_hash  text NOT NULL,
  response_code int,
  response_body jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  PRIMARY KEY (user_id, key)
);
ALTER TABLE platform.idempotency_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY idem_self ON platform.idempotency_keys TO app_user
  USING (user_id = platform.ctx_user_id()) WITH CHECK (user_id = platform.ctx_user_id());
CREATE POLICY idem_system ON platform.idempotency_keys TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON platform.idempotency_keys TO app_user;
GRANT SELECT, DELETE ON platform.idempotency_keys TO app_worker;

-- ── Feature flags (E0-09) ─────────────────────────────────────────────────────
-- scope_id is the all-zero UUID for global flags, so the primary key never holds NULL.
CREATE TABLE platform.feature_flags (
  key        text NOT NULL CHECK (key ~ '^[a-z0-9_.]+$'),
  scope_type text NOT NULL DEFAULT 'global' CHECK (scope_type IN ('global', 'centre', 'teacher')),
  scope_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  enabled    boolean NOT NULL DEFAULT false,
  config     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, scope_type, scope_id),
  CHECK ((scope_type = 'global') = (scope_id = '00000000-0000-0000-0000-000000000000'))
);
CREATE TRIGGER feature_flags_touch BEFORE UPDATE ON platform.feature_flags
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
GRANT SELECT ON platform.feature_flags TO app_user, app_worker;
GRANT SELECT, INSERT, UPDATE ON platform.feature_flags TO app_ops;

-- ── Audit log (docs/06 §10): append-only, write-once, partitioned by month ────
CREATE TABLE audit.audit_events (
  id              uuid NOT NULL,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  actor_id        uuid,
  actor_type      text NOT NULL CHECK (actor_type IN ('user', 'system', 'provider', 'ai')),
  centre_id       uuid,
  action          text NOT NULL,
  object_type     text NOT NULL,
  object_ref      text NOT NULL,
  before          jsonb,
  after           jsonb,
  reason          text,
  model_version   text,
  undoes_event_id uuid,
  request_id      text,
  trace_id        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE audit.audit_events_default PARTITION OF audit.audit_events DEFAULT;

-- Monthly partitions. A worker job will keep creating them ahead (E0-08 follow-up);
-- until then, rows outside the created months land in the default partition.
CREATE FUNCTION audit.ensure_month_partition(month date) RETURNS void
  LANGUAGE plpgsql AS $$
DECLARE
  start_on date := date_trunc('month', month)::date;
  name text := format('audit_events_%s', to_char(start_on, 'YYYY_MM'));
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS audit.%I PARTITION OF audit.audit_events FOR VALUES FROM (%L) TO (%L)',
    name, start_on, (start_on + interval '1 month')::date);
END
$$;

DO $$
BEGIN
  FOR i IN 0..5 LOOP
    PERFORM audit.ensure_month_partition((date_trunc('month', now()) + make_interval(months => i))::date);
  END LOOP;
END
$$;

CREATE INDEX audit_events_centre_time ON audit.audit_events (centre_id, occurred_at DESC);
CREATE INDEX audit_events_object ON audit.audit_events (object_type, object_ref, occurred_at);

CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit.audit_events
  FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

ALTER TABLE audit.audit_events ENABLE ROW LEVEL SECURITY;
-- Read: CENTRE (owner) and OPS. Insert: any request writes its own audit row.
CREATE POLICY audit_read_centre_owner ON audit.audit_events FOR SELECT TO app_user
  USING (centre_id = ANY (platform.ctx_centre_ids()) AND 'centre_owner' = ANY (platform.ctx_roles()));
CREATE POLICY audit_insert ON audit.audit_events FOR INSERT TO app_user, app_worker WITH CHECK (true);
CREATE POLICY audit_read_ops ON audit.audit_events FOR SELECT TO app_ops USING (platform.ctx_is_ops());

GRANT SELECT, INSERT ON audit.audit_events TO app_user;
GRANT INSERT ON audit.audit_events TO app_worker;
GRANT SELECT ON audit.audit_events TO app_ops;
-- No UPDATE, DELETE or TRUNCATE grants for anyone (INV-02).

-- migrate:down
DROP TABLE audit.audit_events;
DROP FUNCTION audit.ensure_month_partition(date);
DROP TABLE platform.feature_flags;
DROP TABLE platform.idempotency_keys;
DROP TABLE platform.inbox_events;
DROP TABLE platform.outbox_events;
