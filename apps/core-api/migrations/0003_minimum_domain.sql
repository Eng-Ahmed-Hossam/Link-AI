-- migrate:up
-- The minimum domain tables the seed needs (docs/14 §4). Every other table arrives with its story.
-- Shapes follow docs/06; cross-schema references are plain uuid columns (module rule 4).
-- RLS codes (docs/06 §0): SELF, CENTRE, TEACHER, OPS, SYSTEM. Public reads come later through views.

-- ── identity ──────────────────────────────────────────────────────────────────
CREATE TABLE identity.users (
  id         uuid PRIMARY KEY,
  phone_e164 text NOT NULL UNIQUE CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),  -- [PII]
  name       text,                                                              -- [PII]
  language   text NOT NULL DEFAULT 'ar' CHECK (language IN ('ar', 'en')),
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER users_touch BEFORE UPDATE ON identity.users FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
ALTER TABLE identity.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self_read ON identity.users FOR SELECT TO app_user USING (id = platform.ctx_user_id());
CREATE POLICY users_self_update ON identity.users FOR UPDATE TO app_user
  USING (id = platform.ctx_user_id()) WITH CHECK (id = platform.ctx_user_id());
CREATE POLICY users_ops_read ON identity.users FOR SELECT TO app_ops USING (platform.ctx_is_ops());
CREATE POLICY users_system ON identity.users TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT, UPDATE (name, language) ON identity.users TO app_user;
GRANT SELECT ON identity.users TO app_ops;
GRANT SELECT, INSERT, UPDATE ON identity.users TO app_worker;

CREATE TABLE identity.role_assignments (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES identity.users (id),
  role        text NOT NULL CHECK (role IN ('parent', 'teacher', 'centre_owner', 'centre_staff', 'link_ops')),
  centre_id   uuid,
  teacher_id  uuid,
  permissions text[] NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'revoked')),
  invited_by  uuid,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (role NOT IN ('centre_owner', 'centre_staff') OR centre_id IS NOT NULL),
  CHECK (role <> 'teacher' OR teacher_id IS NOT NULL)
);
-- centre_id is NULL for parents, teachers and ops: NULLS NOT DISTINCT stops duplicate roles.
CREATE UNIQUE INDEX role_assignments_live ON identity.role_assignments (user_id, role, centre_id)
  NULLS NOT DISTINCT WHERE status <> 'revoked';
CREATE TRIGGER role_assignments_touch BEFORE UPDATE ON identity.role_assignments
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
ALTER TABLE identity.role_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY ra_self_read ON identity.role_assignments FOR SELECT TO app_user USING (user_id = platform.ctx_user_id());
CREATE POLICY ra_centre_read ON identity.role_assignments FOR SELECT TO app_user
  USING (centre_id = ANY (platform.ctx_centre_ids()) AND 'centre_owner' = ANY (platform.ctx_roles()));
CREATE POLICY ra_ops ON identity.role_assignments FOR SELECT TO app_ops USING (platform.ctx_is_ops());
CREATE POLICY ra_system ON identity.role_assignments TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT ON identity.role_assignments TO app_user, app_ops;
GRANT SELECT, INSERT, UPDATE ON identity.role_assignments TO app_worker;

-- ── ref: reference data (PUBLIC read, OPS write) ──────────────────────────────
-- `confirmed` is false until OD-07 is decided (docs/14 §4). Added to all four tables.
CREATE TABLE ref.curricula (
  id        uuid PRIMARY KEY,
  code      text NOT NULL UNIQUE CHECK (code IN ('NATIONAL', 'IGCSE', 'AMERICAN', 'NILE')),
  name_en   text NOT NULL,
  name_ar   text NOT NULL,
  position  int  NOT NULL DEFAULT 0,
  active    boolean NOT NULL DEFAULT true,
  confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ref.school_years (
  id            uuid PRIMARY KEY,
  curriculum_id uuid NOT NULL REFERENCES ref.curricula (id),
  code          text NOT NULL,
  name_en       text NOT NULL,
  name_ar       text NOT NULL,
  position      int  NOT NULL DEFAULT 0,
  confirmed     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (curriculum_id, code),
  UNIQUE (curriculum_id, id)  -- target of the subjects composite FK
);

CREATE TABLE ref.academic_terms (
  id            uuid PRIMARY KEY,
  academic_year text NOT NULL CHECK (academic_year ~ '^[0-9]{4}/[0-9]{2}$'),
  code          text NOT NULL,
  name_en       text NOT NULL,
  name_ar       text NOT NULL,
  starts_on     date NOT NULL,
  ends_on       date NOT NULL,
  confirmed     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on > starts_on),
  UNIQUE (academic_year, code)
);

CREATE TABLE ref.subjects (
  id             uuid PRIMARY KEY,
  curriculum_id  uuid NOT NULL REFERENCES ref.curricula (id),
  school_year_id uuid NOT NULL,
  code           text NOT NULL,
  name_en        text NOT NULL,
  name_ar        text NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  confirmed      boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (curriculum_id, school_year_id, code),
  -- The school year belongs to the same curriculum (docs/06 §2).
  FOREIGN KEY (curriculum_id, school_year_id) REFERENCES ref.school_years (curriculum_id, id)
);

GRANT SELECT ON ref.curricula, ref.school_years, ref.academic_terms, ref.subjects TO app_user, app_worker, app_ops;
GRANT INSERT, UPDATE ON ref.curricula, ref.school_years, ref.academic_terms, ref.subjects TO app_ops;

-- ── org ───────────────────────────────────────────────────────────────────────
CREATE TABLE org.centres (
  id           uuid PRIMARY KEY,                -- also the tenant ID
  owner_id     uuid NOT NULL,                   -- → identity.users
  name         text NOT NULL,
  slug         text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  about_en     text,
  about_ar     text,
  governorate  text,
  area         text,
  address      text,
  location     geography(Point, 4326),
  hours        jsonb NOT NULL DEFAULT '[]'::jsonb,
  photos       jsonb NOT NULL DEFAULT '[]'::jsonb,
  verification text NOT NULL DEFAULT 'pending'
    CHECK (verification IN ('pending', 'in_review', 'verified', 'rejected', 'revoked')),
  verified_at  timestamptz,
  settings     jsonb NOT NULL DEFAULT '{"autoApprove": {"enabled": false}, "shareAttendanceWithParents": false}'::jsonb,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX centres_location ON org.centres USING gist (location);
CREATE INDEX centres_verification ON org.centres (verification);
CREATE TRIGGER centres_touch BEFORE UPDATE ON org.centres FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
ALTER TABLE org.centres ENABLE ROW LEVEL SECURITY;
CREATE POLICY centres_centre_read ON org.centres FOR SELECT TO app_user USING (id = ANY (platform.ctx_centre_ids()));
CREATE POLICY centres_owner_update ON org.centres FOR UPDATE TO app_user
  USING (id = ANY (platform.ctx_centre_ids()) AND owner_id = platform.ctx_user_id())
  WITH CHECK (id = ANY (platform.ctx_centre_ids()) AND owner_id = platform.ctx_user_id());
CREATE POLICY centres_ops ON org.centres TO app_ops USING (platform.ctx_is_ops()) WITH CHECK (platform.ctx_is_ops());
CREATE POLICY centres_system ON org.centres FOR SELECT TO app_worker USING (true);
GRANT SELECT, UPDATE (name, about_en, about_ar, governorate, area, address, location, hours, photos, settings)
  ON org.centres TO app_user;
GRANT SELECT, UPDATE (verification, verified_at) ON org.centres TO app_ops;
GRANT SELECT ON org.centres TO app_worker;

CREATE TABLE org.teachers (
  id               uuid PRIMARY KEY,
  user_id          uuid NOT NULL UNIQUE,        -- → identity.users
  display_name     text NOT NULL,               -- [PII] public once verified
  slug             text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  bio_en           text,
  bio_ar           text,
  years_experience smallint CHECK (years_experience >= 0),
  photo_key        text,
  verification     text NOT NULL DEFAULT 'not_started'
    CHECK (verification IN ('not_started', 'pending', 'verified', 'rejected', 'revoked')),
  verified_at      timestamptz,
  open_to_slots    boolean NOT NULL DEFAULT false,
  availability     jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings         jsonb NOT NULL DEFAULT '{"reviewEachEnrolment": false}'::jsonb,  -- OD-08
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER teachers_touch BEFORE UPDATE ON org.teachers FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
ALTER TABLE org.teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY teachers_self ON org.teachers FOR SELECT TO app_user
  USING (user_id = platform.ctx_user_id() OR id = platform.ctx_teacher_id());
CREATE POLICY teachers_self_update ON org.teachers FOR UPDATE TO app_user
  USING (id = platform.ctx_teacher_id()) WITH CHECK (id = platform.ctx_teacher_id());
CREATE POLICY teachers_ops ON org.teachers TO app_ops USING (platform.ctx_is_ops()) WITH CHECK (platform.ctx_is_ops());
CREATE POLICY teachers_system ON org.teachers FOR SELECT TO app_worker USING (true);
GRANT SELECT, UPDATE (display_name, bio_en, bio_ar, years_experience, photo_key, open_to_slots, availability, settings)
  ON org.teachers TO app_user;
GRANT SELECT, UPDATE (verification, verified_at) ON org.teachers TO app_ops;
GRANT SELECT ON org.teachers TO app_worker;

CREATE TABLE org.teacher_subjects (
  teacher_id uuid NOT NULL REFERENCES org.teachers (id),
  subject_id uuid NOT NULL,                     -- → ref.subjects
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, subject_id)
);
ALTER TABLE org.teacher_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY ts_self ON org.teacher_subjects TO app_user
  USING (teacher_id = platform.ctx_teacher_id()) WITH CHECK (teacher_id = platform.ctx_teacher_id());
CREATE POLICY ts_ops ON org.teacher_subjects FOR SELECT TO app_ops USING (platform.ctx_is_ops());
CREATE POLICY ts_system ON org.teacher_subjects FOR SELECT TO app_worker USING (true);
GRANT SELECT, INSERT, DELETE ON org.teacher_subjects TO app_user;
GRANT SELECT ON org.teacher_subjects TO app_ops, app_worker;

-- ── market.rooms: the centre-scoped table that proves RLS ─────────────────────
-- Code `room` = UI "hall" (glossary).
CREATE TABLE market.rooms (
  id          uuid PRIMARY KEY,
  centre_id   uuid NOT NULL,                    -- tenant (→ org.centres)
  name        text NOT NULL,
  capacity    int  NOT NULL CHECK (capacity > 0),
  facilities  text[] NOT NULL DEFAULT '{}'
    CHECK (facilities <@ ARRAY['ac', 'smart_board', 'projector', 'sound', 'whiteboard', 'wheelchair', 'fan']),
  rent_rule   jsonb NOT NULL CHECK (rent_rule ->> 'type' IN ('fixed_per_session', 'per_student_per_session', 'percent_of_fees')),
  listed      boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rooms_centre ON market.rooms (centre_id);
CREATE TRIGGER rooms_touch BEFORE UPDATE ON market.rooms FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
ALTER TABLE market.rooms ENABLE ROW LEVEL SECURITY;
-- CENTRE: read for owner and staff; writes are owner-only, checked by the app's permission layer too.
CREATE POLICY rooms_centre ON market.rooms TO app_user
  USING (centre_id = ANY (platform.ctx_centre_ids()))
  WITH CHECK (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY rooms_ops ON market.rooms FOR SELECT TO app_ops USING (platform.ctx_is_ops());
CREATE POLICY rooms_system ON market.rooms FOR SELECT TO app_worker USING (true);
GRANT SELECT, INSERT, UPDATE ON market.rooms TO app_user;
GRANT SELECT ON market.rooms TO app_ops, app_worker;

-- ── ledger.commission_rules (the commission defaults in the seed) ─────────────
CREATE TABLE ledger.commission_rules (
  id            uuid PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('rent_fee', 'booking_commission')),
  centre_id     uuid,
  teacher_id    uuid,
  rate_pct      numeric(5,2) NOT NULL CHECK (rate_pct >= 0 AND rate_pct <= 100),
  min_amount_pt bigint CHECK (min_amount_pt >= 0),
  valid_from    date NOT NULL,
  valid_to      date,
  reason        text,
  created_by    uuid,
  scope_id      uuid NOT NULL GENERATED ALWAYS AS (COALESCE(centre_id, teacher_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED,
  validity      daterange NOT NULL GENERATED ALWAYS AS (daterange(valid_from, valid_to, '[)')) STORED,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'rent_fee' OR teacher_id IS NULL),
  CHECK (kind <> 'booking_commission' OR centre_id IS NULL),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  -- INV-13: rules of one kind and scope never overlap in time, including the global default.
  EXCLUDE USING gist (kind WITH =, scope_id WITH =, validity WITH &&)
);
ALTER TABLE ledger.commission_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY cr_own_read ON ledger.commission_rules FOR SELECT TO app_user
  USING ((centre_id IS NULL AND teacher_id IS NULL)
         OR centre_id = ANY (platform.ctx_centre_ids())
         OR teacher_id = platform.ctx_teacher_id());
CREATE POLICY cr_ops ON ledger.commission_rules TO app_ops USING (platform.ctx_is_ops()) WITH CHECK (platform.ctx_is_ops());
CREATE POLICY cr_system ON ledger.commission_rules FOR SELECT TO app_worker USING (true);
GRANT SELECT ON ledger.commission_rules TO app_user, app_worker;
GRANT SELECT, INSERT, UPDATE ON ledger.commission_rules TO app_ops;  -- ops.finance is checked by core-api

-- migrate:down
DROP TABLE ledger.commission_rules;
DROP TABLE market.rooms;
DROP TABLE org.teacher_subjects;
DROP TABLE org.teachers;
DROP TABLE org.centres;
DROP TABLE ref.subjects;
DROP TABLE ref.academic_terms;
DROP TABLE ref.school_years;
DROP TABLE ref.curricula;
DROP TABLE identity.role_assignments;
DROP TABLE identity.users;
