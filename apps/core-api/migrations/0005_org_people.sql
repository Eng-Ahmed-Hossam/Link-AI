-- migrate:up
-- Parents, children, consent and centre join requests (docs/06 §3), plus the per-request RLS
-- context loader (docs/10 §2). Guardian phones follow docs/10 §5: HMAC + envelope-encrypted.

-- ── guardians ─────────────────────────────────────────────────────────────────
CREATE TABLE org.guardians (
  id              uuid PRIMARY KEY,
  user_id         uuid UNIQUE,                 -- → identity.users; NULL for a guardian without an account
  phone_encrypted bytea,                       -- [PII] envelope-encrypted
  phone_hmac      bytea,                       -- lookup without decryption
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX guardians_phone ON org.guardians (phone_hmac) WHERE phone_hmac IS NOT NULL;
CREATE TRIGGER guardians_touch BEFORE UPDATE ON org.guardians FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
ALTER TABLE org.guardians ENABLE ROW LEVEL SECURITY;
CREATE POLICY guardians_self ON org.guardians TO app_user
  USING (user_id = platform.ctx_user_id()) WITH CHECK (user_id = platform.ctx_user_id());
CREATE POLICY guardians_ops ON org.guardians FOR SELECT TO app_ops USING (platform.ctx_is_ops());
CREATE POLICY guardians_system ON org.guardians TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON org.guardians TO app_user;
GRANT SELECT ON org.guardians TO app_ops;
GRANT SELECT, INSERT, UPDATE ON org.guardians TO app_worker;

-- ── students ──────────────────────────────────────────────────────────────────
CREATE TABLE org.students (
  id                     uuid PRIMARY KEY,
  display_name           text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 80),  -- [PII]
  curriculum_id          uuid NOT NULL,         -- → ref.curricula
  school_year_id         uuid NOT NULL,         -- → ref.school_years
  created_by_guardian_id uuid NOT NULL REFERENCES org.guardians (id),
  archived_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER students_touch BEFORE UPDATE ON org.students FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE org.student_guardians (
  student_id      uuid NOT NULL REFERENCES org.students (id),
  guardian_id     uuid NOT NULL REFERENCES org.guardians (id),
  relation        text NOT NULL DEFAULT 'guardian' CHECK (relation IN ('mother', 'father', 'guardian', 'other')),
  consent_version text NOT NULL,
  consent_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, guardian_id)
);

-- GUARDIAN visibility, as lookups that bypass RLS: each table's policy needs the other table, and
-- policies that query each other recurse. Both return rows for the caller's own guardian only.
CREATE FUNCTION org.my_student_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT sg.student_id FROM org.student_guardians sg WHERE sg.guardian_id = platform.ctx_guardian_id()
  UNION
  SELECT s.id FROM org.students s WHERE s.created_by_guardian_id = platform.ctx_guardian_id()
$$;
CREATE FUNCTION org.student_created_by_me(student uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM org.students s
                 WHERE s.id = student AND s.created_by_guardian_id = platform.ctx_guardian_id())
$$;
REVOKE ALL ON FUNCTION org.my_student_ids(), org.student_created_by_me(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION org.my_student_ids(), org.student_created_by_me(uuid) TO app_user;

ALTER TABLE org.students ENABLE ROW LEVEL SECURITY;
-- GUARDIAN: linked through student_guardians, or created by this guardian (so INSERT … RETURNING works
-- before the link row exists, in the same transaction). TEACHER and CENTRE arrive with enrolments (R2).
CREATE POLICY students_guardian ON org.students TO app_user
  USING (id IN (SELECT org.my_student_ids()))
  WITH CHECK (created_by_guardian_id = platform.ctx_guardian_id());
CREATE POLICY students_ops ON org.students FOR SELECT TO app_ops USING (platform.ctx_is_ops());
CREATE POLICY students_system ON org.students TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE (display_name, curriculum_id, school_year_id, archived_at) ON org.students TO app_user;
GRANT SELECT ON org.students TO app_ops;
GRANT SELECT, INSERT, UPDATE ON org.students TO app_worker;

ALTER TABLE org.student_guardians ENABLE ROW LEVEL SECURITY;
CREATE POLICY sg_guardian ON org.student_guardians TO app_user
  USING (guardian_id = platform.ctx_guardian_id())
  WITH CHECK (guardian_id = platform.ctx_guardian_id() AND org.student_created_by_me(student_id));
CREATE POLICY sg_ops ON org.student_guardians FOR SELECT TO app_ops USING (platform.ctx_is_ops());
CREATE POLICY sg_system ON org.student_guardians TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON org.student_guardians TO app_user;
GRANT SELECT ON org.student_guardians TO app_ops;
GRANT SELECT, INSERT ON org.student_guardians TO app_worker;

-- ── consent_events: append-only; the current state is the latest row (BR-DAT-03) ──
CREATE TABLE org.consent_events (
  id          uuid PRIMARY KEY,
  user_id     uuid,                            -- → identity.users: the person consenting
  guardian_id uuid REFERENCES org.guardians (id),
  student_id  uuid,                            -- context: a consent about one child
  kind        text NOT NULL CHECK (kind IN ('terms', 'privacy', 'child_data_processing', 'share_phone_with_teacher',
                                            'whatsapp_updates', 'sms_updates', 'focus_plans', 'ai_training_use')),
  granted     boolean NOT NULL,
  version     text NOT NULL CHECK (length(version) BETWEEN 1 AND 40),
  source      text NOT NULL CHECK (source IN ('signup', 'add_child', 'checkout', 'settings', 'whatsapp_stop', 'import', 'ops')),
  context     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR guardian_id IS NOT NULL)
);
CREATE INDEX consent_events_current
  ON org.consent_events ((COALESCE(user_id, guardian_id)), student_id, kind, created_at DESC);
CREATE TRIGGER consent_events_append_only BEFORE UPDATE OR DELETE ON org.consent_events
  FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
ALTER TABLE org.consent_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY consent_self ON org.consent_events TO app_user
  USING (user_id = platform.ctx_user_id() OR guardian_id = platform.ctx_guardian_id())
  WITH CHECK (user_id = platform.ctx_user_id());
CREATE POLICY consent_ops ON org.consent_events FOR SELECT TO app_ops USING (platform.ctx_is_ops());
CREATE POLICY consent_system ON org.consent_events TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON org.consent_events TO app_user, app_worker;
GRANT SELECT ON org.consent_events TO app_ops;

-- ── leads: the landing form and C01 join requests (MKT-WEB-01, MKT-CEN-01) ────
-- `details` (added): the rest of the C01 form — governorate, address, subjects, hall range, phone last 4.
CREATE TABLE org.leads (
  id                      uuid PRIMARY KEY,
  kind                    text NOT NULL CHECK (kind IN ('centre', 'teacher')),
  name                    text,                -- [PII]
  centre_name             text,
  area                    text,
  teacher_count           int CHECK (teacher_count >= 0),
  whatsapp_encrypted      bytea,               -- [PII]
  whatsapp_hmac           bytea,
  contact_consent_version text NOT NULL,
  details                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                  text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'discarded')),
  converted_centre_id     uuid,
  last_contact_at         timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_whatsapp ON org.leads (whatsapp_hmac) WHERE status = 'new';
CREATE TRIGGER leads_touch BEFORE UPDATE ON org.leads FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
ALTER TABLE org.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY leads_ops ON org.leads TO app_ops USING (platform.ctx_is_ops()) WITH CHECK (platform.ctx_is_ops());
CREATE POLICY leads_system ON org.leads TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT, UPDATE (status, last_contact_at) ON org.leads TO app_ops;
GRANT SELECT, INSERT, UPDATE ON org.leads TO app_worker;

-- ── verification_checks (ops; the owner sees the status of their own checks later) ──
CREATE TABLE org.verification_checks (
  id           uuid PRIMARY KEY,
  subject_type text NOT NULL CHECK (subject_type IN ('centre', 'teacher')),
  subject_id   uuid NOT NULL,
  check_code   text NOT NULL CHECK (check_code IN ('owner_call', 'address_pin_match', 'site_visit_or_video', 'owner_id',
                                                   'owner_profile_approval', 'ekyc_id', 'degree', 'reference')),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed', 'waived')),
  evidence_key text,
  done_by      uuid,
  done_at      timestamptz,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id, check_code)
);
CREATE TRIGGER verification_checks_touch BEFORE UPDATE ON org.verification_checks
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
ALTER TABLE org.verification_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY vc_ops ON org.verification_checks TO app_ops USING (platform.ctx_is_ops()) WITH CHECK (platform.ctx_is_ops());
CREATE POLICY vc_system ON org.verification_checks TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON org.verification_checks TO app_ops, app_worker;

-- ── centres and teachers: sign-up writes them as the system ───────────────────
-- CF-44: a pin moved by the owner is under review until ops verify it.
ALTER TABLE org.centres
  ADD COLUMN location_status text NOT NULL DEFAULT 'verified' CHECK (location_status IN ('verified', 'under_review'));
DROP POLICY centres_system ON org.centres;
CREATE POLICY centres_system ON org.centres TO app_worker USING (true) WITH CHECK (true);
GRANT INSERT, UPDATE ON org.centres TO app_worker;
DROP POLICY teachers_system ON org.teachers;
CREATE POLICY teachers_system ON org.teachers TO app_worker USING (true) WITH CHECK (true);
GRANT INSERT, UPDATE ON org.teachers TO app_worker;

-- P-4 (07 §2a): short school-year names for chips ("Sec 2", «٢ ثانوي»).
ALTER TABLE ref.school_years ADD COLUMN short_name_en text, ADD COLUMN short_name_ar text;
GRANT INSERT, UPDATE ON ref.curricula, ref.school_years, ref.academic_terms, ref.subjects TO app_worker;

-- ── RLS context (docs/10 §2) ──────────────────────────────────────────────────
-- core-api sets app.user_id from the verified token, then loads the rest from here in the same
-- transaction, so a revoked role or a new centre takes effect on the next request (never cached).
-- SECURITY DEFINER reads role rows across centres, but only for the caller's own user ID.
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

-- migrate:down
DROP FUNCTION identity.load_context();
REVOKE INSERT, UPDATE ON ref.curricula, ref.school_years, ref.academic_terms, ref.subjects FROM app_worker;
ALTER TABLE ref.school_years DROP COLUMN short_name_ar, DROP COLUMN short_name_en;
REVOKE INSERT, UPDATE ON org.teachers FROM app_worker;
DROP POLICY teachers_system ON org.teachers;
CREATE POLICY teachers_system ON org.teachers FOR SELECT TO app_worker USING (true);
REVOKE INSERT, UPDATE ON org.centres FROM app_worker;
DROP POLICY centres_system ON org.centres;
CREATE POLICY centres_system ON org.centres FOR SELECT TO app_worker USING (true);
ALTER TABLE org.centres DROP COLUMN location_status;
DROP TABLE org.verification_checks;
DROP TABLE org.leads;
DROP TABLE org.consent_events;
DROP TABLE org.student_guardians, org.students;
DROP FUNCTION IF EXISTS org.student_created_by_me(uuid);
DROP FUNCTION IF EXISTS org.my_student_ids();
DROP TABLE org.guardians;
