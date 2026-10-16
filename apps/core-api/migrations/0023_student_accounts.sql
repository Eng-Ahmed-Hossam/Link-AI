-- migrate:up
-- Database v2, group A: student accounts (docs/plan/database-v2.md §2.A, decisions of 2026-10-16).
-- Only a guardian of the child creates one (with the `student_account` consent). A student signs
-- in with a one-time code from the parent's app (10 minutes), then a 4-digit PIN that works only
-- on the device it was set on (up to 2 devices; a 3rd is refused). 5 wrong PINs lock the account
-- until the parent makes a new code. The parent can pause it, remove a device or sign it out
-- everywhere. A student has no phone, no email and no Google sign-in, and holds no other role.
-- The PIN check and the code redeem run in core-api as the system (app_worker), like sign-in.

ALTER TABLE identity.users
  ADD COLUMN account_type text NOT NULL DEFAULT 'adult' CHECK (account_type IN ('adult', 'student')),
  -- No student phone, ever; the name lives once, on org.students.
  ADD CONSTRAINT users_student_no_contact CHECK (account_type = 'adult' OR (phone_hmac IS NULL AND name IS NULL));

-- No phone, email or Google identity for a student user.
CREATE FUNCTION identity.refuse_student_identity() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM identity.users u WHERE u.id = NEW.user_id AND u.account_type = 'student') THEN
    RAISE EXCEPTION 'a student account signs in with its code and PIN only'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'student_no_identity';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER user_identities_no_student BEFORE INSERT OR UPDATE ON identity.user_identities
  FOR EACH ROW EXECUTE FUNCTION identity.refuse_student_identity();

CREATE TABLE identity.student_accounts (
  student_id         uuid PRIMARY KEY,                         -- → org.students
  user_id            uuid NOT NULL UNIQUE REFERENCES identity.users (id),
  guardian_id        uuid NOT NULL,                            -- → org.guardians: who created it
  created_by_user_id uuid NOT NULL,                            -- the parent's user
  status             text NOT NULL DEFAULT 'awaiting_device'
                       CHECK (status IN ('awaiting_device', 'active', 'paused', 'locked', 'closed')),
  failed_pin_count   smallint NOT NULL DEFAULT 0 CHECK (failed_pin_count BETWEEN 0 AND 5),
  locked_at          timestamptz,
  paused_at          timestamptz,
  paused_by          uuid,
  closed_at          timestamptz,
  consent_event_id   uuid NOT NULL,                            -- → org.consent_events (student_account)
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'locked') = (locked_at IS NOT NULL)),
  CHECK (status <> 'paused' OR paused_at IS NOT NULL),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);
CREATE TRIGGER student_accounts_touch BEFORE UPDATE ON identity.student_accounts
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- Only a guardian of the child creates the account, for a student user; the 5th wrong PIN locks it.
CREATE FUNCTION identity.guard_student_account() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM org.student_guardians sg
                   WHERE sg.student_id = NEW.student_id AND sg.guardian_id = NEW.guardian_id) THEN
      RAISE EXCEPTION 'only a guardian of the child creates a student account'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'student_account_guardian';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM identity.users u WHERE u.id = NEW.user_id AND u.account_type = 'student') THEN
      RAISE EXCEPTION 'a student account needs a student user'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'student_account_user';
    END IF;
  END IF;
  IF NEW.failed_pin_count >= 5 AND NEW.status IN ('active', 'awaiting_device') THEN
    NEW.status := 'locked';
    NEW.locked_at := now();
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER student_accounts_guard BEFORE INSERT OR UPDATE ON identity.student_accounts
  FOR EACH ROW EXECUTE FUNCTION identity.guard_student_account();

CREATE TABLE identity.student_access_codes (
  id                 uuid PRIMARY KEY,
  student_id         uuid NOT NULL REFERENCES identity.student_accounts (student_id),
  created_by_user_id uuid NOT NULL,
  code_hmac          bytea NOT NULL UNIQUE CHECK (length(code_hmac) = 32),  -- the code is never stored
  expires_at         timestamptz NOT NULL,
  used_at            timestamptz,
  used_by_device_id  uuid,
  revoked_at         timestamptz,
  redeem_attempts    smallint NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '10 minutes')
);
-- One live code per child: a new code revokes the old one in the same transaction.
CREATE UNIQUE INDEX student_access_codes_live ON identity.student_access_codes (student_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE TABLE identity.student_devices (
  id             uuid PRIMARY KEY,
  student_id     uuid NOT NULL REFERENCES identity.student_accounts (student_id),
  user_id        uuid NOT NULL REFERENCES identity.users (id),
  secret_hash    bytea NOT NULL UNIQUE CHECK (length(secret_hash) = 32),  -- SHA-256 of the device's secret
  pin_hash       text,                                     -- scrypt(HMAC(pepper, device ‖ PIN)); NULL until set
  pin_set_at     timestamptz,
  platform       text NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  label          text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 60),  -- generated, never typed
  access_code_id uuid REFERENCES identity.student_access_codes (id),
  last_used_at   timestamptz,
  revoked_at     timestamptz,
  revoked_reason text CHECK (revoked_reason IN ('removed_by_parent', 'signed_out_everywhere', 'closed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL)),
  CHECK ((pin_hash IS NULL) = (pin_set_at IS NULL))
);
CREATE INDEX student_devices_live ON identity.student_devices (student_id) WHERE revoked_at IS NULL;

-- Up to 2 live devices per student (decided 2026-10-16: a phone and a laptop). The account row is
-- locked first, so two devices binding at once can't both pass.
CREATE FUNCTION identity.guard_student_devices() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.revoked_at IS NOT NULL THEN RETURN NEW; END IF;
  PERFORM 1 FROM identity.student_accounts WHERE student_id = NEW.student_id FOR UPDATE;
  IF (SELECT count(*) FROM identity.student_devices d
      WHERE d.student_id = NEW.student_id AND d.revoked_at IS NULL AND d.id <> NEW.id) >= 2 THEN
    RAISE EXCEPTION 'a student has at most 2 devices'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'student_device_limit';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER student_devices_limit BEFORE INSERT OR UPDATE OF revoked_at ON identity.student_devices
  FOR EACH ROW EXECUTE FUNCTION identity.guard_student_devices();

ALTER TABLE identity.auth_sessions
  ADD COLUMN student_device_id uuid REFERENCES identity.student_devices (id);
CREATE INDEX auth_sessions_student_device ON identity.auth_sessions (student_device_id)
  WHERE student_device_id IS NOT NULL AND revoked_at IS NULL;

-- ── The RLS context gains the student ─────────────────────────────────────────
-- core-api sets app.student_id from load_context(); it is set only while the account is `active`,
-- so a paused, locked or closed account has no context on its very next request.
CREATE FUNCTION platform.ctx_student_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.student_id', true), '')::uuid $$;

DROP FUNCTION identity.load_context();
CREATE FUNCTION identity.load_context()
  RETURNS TABLE (roles text[], centre_ids uuid[], owner_centre_ids uuid[], teacher_id uuid, guardian_id uuid,
                 permissions jsonb, student_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT
    CASE WHEN u.account_type = 'student' THEN '{student}'::text[]
         ELSE COALESCE(array_agg(DISTINCT ra.role), '{}'::text[]) END,
    COALESCE(array_agg(DISTINCT ra.centre_id) FILTER (WHERE ra.role IN ('centre_owner', 'centre_staff')), '{}'::uuid[]),
    COALESCE(array_agg(DISTINCT ra.centre_id) FILTER (WHERE ra.role = 'centre_owner'), '{}'::uuid[]),
    (array_agg(ra.teacher_id) FILTER (WHERE ra.role = 'teacher'))[1],
    (SELECT g.id FROM org.guardians g WHERE g.user_id = platform.ctx_user_id() AND u.account_type = 'adult'),
    COALESCE(jsonb_object_agg(ra.centre_id::text, to_jsonb(ra.permissions))
             FILTER (WHERE ra.role = 'centre_staff'), '{}'::jsonb),
    sa.student_id
  FROM identity.users u
  LEFT JOIN identity.role_assignments ra ON ra.user_id = u.id AND ra.status = 'active' AND u.account_type = 'adult'
  LEFT JOIN identity.student_accounts sa ON sa.user_id = u.id AND sa.status = 'active'
  WHERE u.id = platform.ctx_user_id() AND u.status = 'active'
    AND (u.account_type = 'adult' OR sa.student_id IS NOT NULL)
  GROUP BY u.id, u.account_type, sa.student_id
$$;
REVOKE ALL ON FUNCTION identity.load_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.load_context() TO app_user, app_worker, app_ops;

-- The children whose learning data the caller may read as family: a guardian's own children, or
-- the student themself. SECURITY DEFINER like org.my_student_ids() (policies would recurse).
CREATE FUNCTION org.family_student_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT org.my_student_ids()
  UNION
  SELECT platform.ctx_student_id() WHERE platform.ctx_student_id() IS NOT NULL
$$;
REVOKE ALL ON FUNCTION org.family_student_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION org.family_student_ids() TO app_user;

-- Withdrawing the guardian's `student_account` consent closes the account at once (PDPL: as easy
-- as giving it): every device is unbound and every session ends. Only for the caller's own child.
CREATE FUNCTION identity.close_student_account(p_student uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u uuid;
BEGIN
  IF NOT (p_student IN (SELECT org.my_student_ids())) THEN RETURN; END IF;
  UPDATE identity.student_accounts SET status = 'closed', closed_at = now(), locked_at = NULL
  WHERE student_id = p_student AND status <> 'closed' RETURNING user_id INTO u;
  IF u IS NULL THEN RETURN; END IF;
  UPDATE identity.student_devices SET revoked_at = now(), revoked_reason = 'closed'
  WHERE student_id = p_student AND revoked_at IS NULL;
  UPDATE identity.auth_sessions SET revoked_at = now() WHERE user_id = u AND revoked_at IS NULL;
END
$$;
REVOKE ALL ON FUNCTION identity.close_student_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.close_student_account(uuid) TO app_user;

-- A student reads their own student row (name, curriculum, school year).
CREATE POLICY students_self ON org.students FOR SELECT TO app_user USING (id = platform.ctx_student_id());

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE identity.student_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY sa_family ON identity.student_accounts FOR SELECT TO app_user
  USING (student_id IN (SELECT org.family_student_ids()));
CREATE POLICY sa_system ON identity.student_accounts TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY sa_ops ON identity.student_accounts FOR SELECT TO app_ops USING (platform.ctx_is_ops());

ALTER TABLE identity.student_access_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY sac_guardian ON identity.student_access_codes FOR SELECT TO app_user
  USING (student_id IN (SELECT org.my_student_ids()));
CREATE POLICY sac_system ON identity.student_access_codes TO app_worker USING (true) WITH CHECK (true);

ALTER TABLE identity.student_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY sd_family ON identity.student_devices FOR SELECT TO app_user
  USING (student_id IN (SELECT org.family_student_ids()));
CREATE POLICY sd_system ON identity.student_devices TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY sd_ops ON identity.student_devices FOR SELECT TO app_ops USING (platform.ctx_is_ops());

-- Secrets (code_hmac, secret_hash, pin_hash) are never granted to app_user or app_ops.
GRANT SELECT (student_id, user_id, guardian_id, status, failed_pin_count, locked_at, paused_at, closed_at, created_at)
  ON identity.student_accounts TO app_user, app_ops;
GRANT SELECT (id, student_id, expires_at, used_at, revoked_at, created_at) ON identity.student_access_codes TO app_user;
GRANT SELECT (id, student_id, platform, label, pin_set_at, last_used_at, revoked_at, revoked_reason, created_at)
  ON identity.student_devices TO app_user, app_ops;
GRANT SELECT, INSERT, UPDATE ON identity.student_accounts, identity.student_access_codes, identity.student_devices
  TO app_worker;
-- Students are made by the system role (app_worker inserts users already).
GRANT DELETE ON identity.student_access_codes TO app_worker;   -- retention: 24 h
GRANT DELETE ON identity.student_devices TO app_worker;        -- retention: removed + 90 days

-- migrate:down
DROP POLICY students_self ON org.students;
DROP FUNCTION identity.close_student_account(uuid);
DROP FUNCTION identity.load_context();
CREATE FUNCTION identity.load_context()
  RETURNS TABLE (roles text[], centre_ids uuid[], owner_centre_ids uuid[], teacher_id uuid, guardian_id uuid,
                 permissions jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT
    COALESCE(array_agg(DISTINCT ra.role), '{}'::text[]),
    COALESCE(array_agg(DISTINCT ra.centre_id) FILTER (WHERE ra.role IN ('centre_owner', 'centre_staff')), '{}'::uuid[]),
    COALESCE(array_agg(DISTINCT ra.centre_id) FILTER (WHERE ra.role = 'centre_owner'), '{}'::uuid[]),
    (array_agg(ra.teacher_id) FILTER (WHERE ra.role = 'teacher'))[1],
    (SELECT g.id FROM org.guardians g WHERE g.user_id = platform.ctx_user_id()),
    COALESCE(jsonb_object_agg(ra.centre_id::text, to_jsonb(ra.permissions))
             FILTER (WHERE ra.role = 'centre_staff'), '{}'::jsonb)
  FROM identity.users u
  LEFT JOIN identity.role_assignments ra ON ra.user_id = u.id AND ra.status = 'active'
  WHERE u.id = platform.ctx_user_id() AND u.status = 'active'
  GROUP BY u.id
$$;
REVOKE ALL ON FUNCTION identity.load_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.load_context() TO app_user, app_worker, app_ops;
DROP FUNCTION platform.ctx_student_id();
ALTER TABLE identity.auth_sessions DROP COLUMN student_device_id;
DROP TABLE identity.student_devices;
DROP FUNCTION identity.guard_student_devices();
DROP TABLE identity.student_access_codes;
DROP TABLE identity.student_accounts;
DROP FUNCTION org.family_student_ids();
DROP FUNCTION identity.guard_student_account();
DROP TRIGGER user_identities_no_student ON identity.user_identities;
DROP FUNCTION identity.refuse_student_identity();
-- Local only: sample student users and their sessions go with their accounts.
DELETE FROM identity.auth_sessions WHERE user_id IN (SELECT id FROM identity.users WHERE account_type = 'student');
DELETE FROM identity.users WHERE account_type = 'student';
ALTER TABLE identity.users DROP CONSTRAINT users_student_no_contact, DROP COLUMN account_type;
