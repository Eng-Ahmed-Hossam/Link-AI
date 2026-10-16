-- migrate:up
-- Database v2, group A: the tester allowlist (auth-map-staging.md §1). Staging is invite-only; an
-- account is created only for an allowlisted email or phone (checked when the account is made).
-- Subjects are HMACs like every identity; ops see the masked hint only.
CREATE TABLE identity.access_allowlist (
  id         uuid PRIMARY KEY,
  kind       text NOT NULL CHECK (kind IN ('email', 'phone')),
  subject    bytea NOT NULL CHECK (length(subject) = 32),
  hint       text NOT NULL CHECK (char_length(hint) BETWEEN 1 AND 120),
  note       text CHECK (char_length(note) <= 200),          -- never contact details (ops screen says so)
  audience   text NOT NULL CHECK (audience IN ('app', 'ops')),
  added_by   uuid NOT NULL,
  used_at    timestamptz,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX access_allowlist_live ON identity.access_allowlist (kind, subject, audience)
  NULLS NOT DISTINCT WHERE removed_at IS NULL;

ALTER TABLE identity.access_allowlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY aa_system ON identity.access_allowlist TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY aa_ops ON identity.access_allowlist TO app_ops
  USING (platform.ctx_is_ops()) WITH CHECK (platform.ctx_is_ops());
GRANT SELECT, INSERT, UPDATE ON identity.access_allowlist TO app_worker;
GRANT SELECT (id, kind, hint, note, audience, added_by, used_at, removed_at, created_at),
  INSERT, UPDATE (note, removed_at) ON identity.access_allowlist TO app_ops;

-- migrate:down
DROP TABLE identity.access_allowlist;
