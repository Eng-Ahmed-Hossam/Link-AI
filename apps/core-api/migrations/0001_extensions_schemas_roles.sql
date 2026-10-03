-- migrate:up
-- docs/06 §0, docs/10 §2. Runs as app_migrator, which owns the database.
-- Locally the container init script already created the extensions as superuser
-- (PostGIS needs it); these statements are then no-ops. In the cloud the managed
-- admin role runs them.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Application roles. NOLOGIN here; credentials are set outside migrations
-- (locally by `pnpm db:migrate` from .env.local, in the cloud by Terraform).
-- None of them has BYPASSRLS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_worker') THEN
    CREATE ROLE app_worker NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_ops') THEN
    CREATE ROLE app_ops NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

-- One schema per bounded context (docs/05 §2, docs/06 §0).
CREATE SCHEMA identity;
CREATE SCHEMA ref;
CREATE SCHEMA org;
CREATE SCHEMA market;
CREATE SCHEMA ledger;
CREATE SCHEMA records;
CREATE SCHEMA followup;
CREATE SCHEMA messaging;
CREATE SCHEMA analytics;
CREATE SCHEMA audit;
CREATE SCHEMA platform;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public, identity, ref, org, market, ledger, records, followup, messaging, analytics, audit, platform
  TO app_user, app_worker, app_ops;

-- ── RLS request context (docs/10 §2) ──────────────────────────────────────────
-- core-api runs, inside each request transaction:
--   SET LOCAL app.user_id = '<uuid>'; SET LOCAL app.roles = '{…}';
--   SET LOCAL app.centre_ids = '{<uuid>,…}'; SET LOCAL app.teacher_id = …; SET LOCAL app.guardian_id = …;
-- A missing or empty setting means "none". Policies call these helpers.
CREATE FUNCTION platform.ctx_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION platform.ctx_centre_ids() RETURNS uuid[]
  LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('app.centre_ids', true), '')::uuid[], '{}'::uuid[]) $$;

CREATE FUNCTION platform.ctx_roles() RETURNS text[]
  LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('app.roles', true), '')::text[], '{}'::text[]) $$;

CREATE FUNCTION platform.ctx_teacher_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.teacher_id', true), '')::uuid $$;

CREATE FUNCTION platform.ctx_guardian_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.guardian_id', true), '')::uuid $$;

CREATE FUNCTION platform.ctx_is_ops() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT 'link_ops' = ANY (platform.ctx_roles()) $$;

-- ── Shared triggers ───────────────────────────────────────────────────────────
-- INV-02: append-only tables reject UPDATE and DELETE (and have no grants for them).
CREATE FUNCTION platform.reject_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%.% is append-only: % is not allowed', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END
$$;

CREATE FUNCTION platform.touch_updated_at() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA platform TO app_user, app_worker, app_ops;

-- migrate:down
DROP SCHEMA platform, audit, analytics, messaging, followup, records, ledger, market, org, ref, identity CASCADE;
REVOKE ALL ON SCHEMA public FROM app_user, app_worker, app_ops;
DROP ROLE IF EXISTS app_user;
DROP ROLE IF EXISTS app_worker;
DROP ROLE IF EXISTS app_ops;
