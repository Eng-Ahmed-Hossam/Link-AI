-- migrate:up
-- Accounts and sessions (docs/06 §1, docs/10 §5 and §7, MKT-ACC-01/04).
-- Phones are no longer stored in plaintext: an HMAC for lookup, the number envelope-encrypted by
-- the app, and the last 4 digits for masked display (decided 2026-10-08).

-- 0003 stored sample phones in plaintext. Only the old sample seed's rows (fixed IDs …-8000-b0…)
-- may be dropped here; they come back from `pnpm seed:demo` with encrypted phones. Anything else
-- stops the migration rather than lose an account.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM identity.users WHERE id::text NOT LIKE '00000000-0000-7000-8000-b0%') THEN
    RAISE EXCEPTION 'identity.users has accounts that are not old sample rows; migrate their phones first';
  END IF;
END
$$;
DELETE FROM identity.role_assignments;
DELETE FROM identity.users;

ALTER TABLE identity.users
  DROP COLUMN phone_e164,
  ADD COLUMN phone_hmac  bytea NOT NULL UNIQUE CHECK (length(phone_hmac) = 32),   -- HMAC-SHA256
  ADD COLUMN phone_enc   bytea NOT NULL,                                          -- [PII] envelope-encrypted
  ADD COLUMN phone_last4 text  NOT NULL CHECK (phone_last4 ~ '^[0-9]{4}$');

-- ── auth_sessions: one row per refresh token; rotation chain per sign-in ──────
CREATE TABLE identity.auth_sessions (
  id                 uuid PRIMARY KEY,
  user_id            uuid NOT NULL REFERENCES identity.users (id),
  family_id          uuid NOT NULL,              -- every rotation of one sign-in shares it
  refresh_token_hash bytea NOT NULL UNIQUE,      -- SHA-256 of the token; the token itself is never stored
  client             text NOT NULL CHECK (client IN ('web', 'app')),
  device_label       text,
  last_used_at       timestamptz,
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz,
  replaced_by        uuid REFERENCES identity.auth_sessions (id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_family ON identity.auth_sessions (family_id);
CREATE INDEX auth_sessions_user ON identity.auth_sessions (user_id) WHERE revoked_at IS NULL;
ALTER TABLE identity.auth_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_sessions_self ON identity.auth_sessions FOR SELECT TO app_user USING (user_id = platform.ctx_user_id());
CREATE POLICY auth_sessions_system ON identity.auth_sessions TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT (id, user_id, client, device_label, last_used_at, expires_at, revoked_at, created_at)
  ON identity.auth_sessions TO app_user;
GRANT SELECT, INSERT, UPDATE ON identity.auth_sessions TO app_worker;

-- ── devices: push tokens (MKT-NTF-02). Table only; the endpoints come with notifications. ──
CREATE TABLE identity.devices (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES identity.users (id),
  platform     text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  push_token   text NOT NULL UNIQUE,
  app          text NOT NULL CHECK (app IN ('teacher_app', 'parent_pwa', 'centre_web')),
  last_seen_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE identity.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY devices_self ON identity.devices TO app_user
  USING (user_id = platform.ctx_user_id()) WITH CHECK (user_id = platform.ctx_user_id());
CREATE POLICY devices_system ON identity.devices TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON identity.devices TO app_user;
GRANT SELECT, INSERT, UPDATE ON identity.devices TO app_worker;

-- Sign-up, staff invites and sessions write as the system (app_worker): a new phone needs a user row,
-- which app_user may not insert. core-api checks the owner's permission first and audits the change.

-- migrate:down
DROP TABLE identity.devices;
DROP TABLE identity.auth_sessions;
DELETE FROM identity.role_assignments;
DELETE FROM identity.users;
ALTER TABLE identity.users
  DROP COLUMN phone_last4,
  DROP COLUMN phone_enc,
  DROP COLUMN phone_hmac,
  ADD COLUMN phone_e164 text NOT NULL UNIQUE CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$');
