-- migrate:up
-- Changes from the R1 review (2026-10-09).

-- ── Feature flags: each caller reads only the global rows and its own scopes ──
-- (07 §2 GET /v1/feature-flags returns only the flags for the signed-in user's scope.)
ALTER TABLE platform.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY flags_own_scope ON platform.feature_flags FOR SELECT TO app_user
  USING (scope_type = 'global'
         OR (scope_type = 'centre' AND scope_id = ANY (platform.ctx_centre_ids()))
         OR (scope_type = 'teacher' AND scope_id = platform.ctx_teacher_id()));
CREATE POLICY flags_system ON platform.feature_flags FOR SELECT TO app_worker USING (true);
CREATE POLICY flags_ops ON platform.feature_flags TO app_ops USING (platform.ctx_is_ops()) WITH CHECK (platform.ctx_is_ops());

-- ── Teacher profile state (decided 2026-10-09) ────────────────────────────────
-- invited:    created by a centre's invite; hidden from search and parents.
-- incomplete: the teacher signed in (and accepted any invite) but has no name or subject yet.
-- active:     name and at least one subject: visible to parents (search, profiles).
ALTER TABLE org.teachers
  ADD COLUMN profile_status text NOT NULL DEFAULT 'incomplete'
    CHECK (profile_status IN ('invited', 'incomplete', 'active'));
UPDATE org.teachers SET profile_status = 'active' WHERE display_name <> '';
GRANT UPDATE (profile_status) ON org.teachers TO app_user;

-- ── Which keys protect the stored data (local key changes are detected) ───────
-- One row per purpose: `field` (FIELD_KEY_LOCAL / KMS) and `lookup` (HMAC_KEY_LOOKUP). The value is
-- a short fingerprint of the key, never the key. A mismatch at start-up means the data was written
-- with another key: locally, re-seed (`pnpm seed:demo --reset`).
CREATE TABLE platform.data_keys (
  purpose    text PRIMARY KEY CHECK (purpose IN ('field', 'lookup')),
  key_id     text NOT NULL CHECK (key_id ~ '^[0-9a-f]{8,16}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform.data_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY data_keys_system ON platform.data_keys TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON platform.data_keys TO app_worker;

-- ── C01 join requests from a pending centre: verification by Link ops ─────────
-- (`pnpm ops:verify-centre` and the local Demo tools button write as ops; every change is audited.)
GRANT SELECT, UPDATE (location_status) ON org.centres TO app_ops;

-- migrate:down
REVOKE UPDATE (location_status) ON org.centres FROM app_ops;
DROP TABLE platform.data_keys;
REVOKE UPDATE (profile_status) ON org.teachers FROM app_user;
ALTER TABLE org.teachers DROP COLUMN profile_status;
DROP POLICY flags_ops ON platform.feature_flags;
DROP POLICY flags_system ON platform.feature_flags;
DROP POLICY flags_own_scope ON platform.feature_flags;
ALTER TABLE platform.feature_flags DISABLE ROW LEVEL SECURITY;
