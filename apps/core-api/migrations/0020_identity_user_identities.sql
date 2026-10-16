-- migrate:up
-- Database v2, group A (docs/plan/database-v2.md §2.A; auth-map-staging.md §1): one person, several
-- sign-in methods. Every subject is an HMAC (HMAC_KEY_LOOKUP) of the normalised value — the
-- `+20…` phone, the lower-cased email, Google's `sub` — never plaintext. A phone identity mirrors
-- identity.users.phone_* (kept equal by a trigger on users, so existing sign-in code needs no
-- change); email and Google come with the auth stage. users.phone_* become nullable: an email- or
-- Google-only adult, and every student (0023), has no phone.

-- UUIDv7 for rows made by triggers (the app makes its own, docs/06 §0): 48-bit ms time + random.
CREATE FUNCTION platform.uuidv7() RETURNS uuid
  LANGUAGE sql VOLATILE AS $$
  SELECT encode(set_bit(set_bit(overlay(uuid_send(gen_random_uuid())
           PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
           FROM 1 FOR 6), 52, 1), 53, 1), 'hex')::uuid
$$;

CREATE TABLE identity.user_identities (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES identity.users (id),
  provider     text NOT NULL CHECK (provider IN ('phone', 'email', 'google')),
  subject      bytea NOT NULL CHECK (length(subject) = 32),   -- HMAC-SHA256, never plaintext
  contact_enc  bytea,                                         -- [PII] envelope-encrypted phone or email
  hint         text NOT NULL CHECK (char_length(hint) BETWEEN 1 AND 120),  -- masked: •••• 0003
  verified_at  timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject),
  CHECK (provider = 'google' OR contact_enc IS NOT NULL)
);
CREATE UNIQUE INDEX user_identities_one_phone ON identity.user_identities (user_id) WHERE provider = 'phone';
CREATE INDEX user_identities_user ON identity.user_identities (user_id);
CREATE TRIGGER user_identities_touch BEFORE UPDATE ON identity.user_identities
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- The phone identity follows users.phone_* (set, changed or cleared there).
CREATE FUNCTION identity.sync_phone_identity() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.phone_hmac IS NULL THEN
    DELETE FROM identity.user_identities WHERE user_id = NEW.id AND provider = 'phone';
    RETURN NEW;
  END IF;
  INSERT INTO identity.user_identities (id, user_id, provider, subject, contact_enc, hint, verified_at)
  VALUES (platform.uuidv7(), NEW.id, 'phone', NEW.phone_hmac, NEW.phone_enc, '•••• ' || NEW.phone_last4, now())
  ON CONFLICT (user_id) WHERE provider = 'phone'
  DO UPDATE SET subject = EXCLUDED.subject, contact_enc = EXCLUDED.contact_enc, hint = EXCLUDED.hint;
  RETURN NEW;
END
$$;
CREATE TRIGGER users_phone_identity AFTER INSERT OR UPDATE OF phone_hmac, phone_enc, phone_last4 ON identity.users
  FOR EACH ROW EXECUTE FUNCTION identity.sync_phone_identity();

-- A phone identity is only ever the mirror of users.phone_* (no second truth).
CREATE FUNCTION identity.guard_phone_identity() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.provider = 'phone' AND NOT EXISTS (
       SELECT 1 FROM identity.users u WHERE u.id = NEW.user_id AND u.phone_hmac = NEW.subject) THEN
    RAISE EXCEPTION 'a phone identity must equal the user''s phone'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'phone_identity_mirror';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER user_identities_guard BEFORE INSERT OR UPDATE ON identity.user_identities
  FOR EACH ROW EXECUTE FUNCTION identity.guard_phone_identity();

-- Backfill: every existing user signs in with their phone, verified when the account was made.
INSERT INTO identity.user_identities (id, user_id, provider, subject, contact_enc, hint, verified_at, created_at)
SELECT platform.uuidv7(), u.id, 'phone', u.phone_hmac, u.phone_enc, '•••• ' || u.phone_last4, u.created_at, u.created_at
FROM identity.users u WHERE u.phone_hmac IS NOT NULL;

ALTER TABLE identity.users
  ALTER COLUMN phone_hmac DROP NOT NULL,
  ALTER COLUMN phone_enc DROP NOT NULL,
  ALTER COLUMN phone_last4 DROP NOT NULL,
  ADD CONSTRAINT users_phone_whole CHECK ((phone_hmac IS NULL) = (phone_enc IS NULL) AND (phone_hmac IS NULL) = (phone_last4 IS NULL)),
  -- The role switcher's last workspace; permissions still come from every active role.
  ADD COLUMN active_role text CHECK (active_role IN ('parent', 'teacher', 'centre_owner', 'centre_staff', 'link_ops')),
  ADD COLUMN active_centre_id uuid,
  ADD CONSTRAINT users_active_centre CHECK (active_role IN ('centre_owner', 'centre_staff') OR active_centre_id IS NULL);
GRANT UPDATE (active_role, active_centre_id) ON identity.users TO app_user;

-- "Recent sign-in" (auth-map-staging §2) and how the sign-in was proved.
ALTER TABLE identity.auth_sessions
  ADD COLUMN amr text CHECK (amr IN ('phone', 'email', 'google', 'student_pin')),
  ADD COLUMN authenticated_at timestamptz;

-- RLS: subject and contact_enc never reach app_user; people read their own methods masked.
ALTER TABLE identity.user_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY ui_system ON identity.user_identities TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY ui_ops ON identity.user_identities FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.user_identities TO app_worker;
GRANT SELECT (id, user_id, provider, hint, verified_at, last_used_at, created_at) ON identity.user_identities TO app_ops;

CREATE VIEW identity.my_sign_in_methods WITH (security_barrier) AS
  SELECT i.id, i.provider, i.hint, i.verified_at, i.last_used_at, i.created_at
  FROM identity.user_identities i WHERE i.user_id = platform.ctx_user_id();
GRANT SELECT ON identity.my_sign_in_methods TO app_user;

-- migrate:down
DROP VIEW identity.my_sign_in_methods;
ALTER TABLE identity.auth_sessions DROP COLUMN authenticated_at, DROP COLUMN amr;
REVOKE UPDATE (active_role, active_centre_id) ON identity.users FROM app_user;
ALTER TABLE identity.users
  DROP CONSTRAINT users_active_centre,
  DROP COLUMN active_centre_id,
  DROP COLUMN active_role,
  DROP CONSTRAINT users_phone_whole;
-- Refuses while a phone-less user exists (only the auth stage and students make them).
ALTER TABLE identity.users
  ALTER COLUMN phone_hmac SET NOT NULL,
  ALTER COLUMN phone_enc SET NOT NULL,
  ALTER COLUMN phone_last4 SET NOT NULL;
DROP TRIGGER users_phone_identity ON identity.users;
DROP FUNCTION identity.sync_phone_identity();
DROP TABLE identity.user_identities;
DROP FUNCTION identity.guard_phone_identity();
DROP FUNCTION platform.uuidv7();
