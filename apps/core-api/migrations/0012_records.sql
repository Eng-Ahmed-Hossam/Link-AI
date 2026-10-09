-- migrate:up
-- R3 records (docs/06 §6, FUP-REC): session records, entries, assessments, corrections, the
-- owner's correction requests (CF-34) and teacher notes. Only the teacher confirms a record
-- (BR-APR-01); once confirmed, its entries change only through corrections (INV-09), a score is
-- never above its maximum (INV-10, block never cap), and corrections are append-only (INV-02).
-- Every row carries centre_id (tenant); child rows copy it from their record (INV-12).
-- Writes go through core-api as the system after the caller's access was checked with RLS, so
-- app_user only reads: TEACHER (own groups) and CENTRE (staff of the centre).

CREATE TABLE records.session_records (
  id               uuid PRIMARY KEY,
  group_id         uuid NOT NULL,                     -- → market.groups
  centre_id        uuid NOT NULL,                     -- tenant
  teacher_id       uuid NOT NULL,                     -- (added) the group's teacher, for TEACHER RLS
  group_session_id uuid NOT NULL UNIQUE,              -- → market.group_sessions
  session_date     date NOT NULL,                     -- the session's Cairo day
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
  source           text NOT NULL DEFAULT 'tap' CHECK (source IN ('tap', 'voice', 'mixed')),
  group_observation text CHECK (char_length(group_observation) <= 1000),  -- "next time" for the group
  confirmed_by     uuid,
  confirmed_at     timestamptz,
  idempotency_key  text UNIQUE,                       -- the confirm's key (FUP-REC-07 AC3)
  created_by       uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'confirmed' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
);
CREATE INDEX session_records_group ON records.session_records (group_id, session_date);
CREATE INDEX session_records_centre ON records.session_records (centre_id, session_date);
CREATE TRIGGER session_records_touch BEFORE UPDATE ON records.session_records
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- A confirmed record never goes back to draft, and its key fields never move.
CREATE FUNCTION records.guard_record() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'confirmed' AND (NEW.status <> 'confirmed' OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
      OR NEW.group_id <> OLD.group_id OR NEW.group_session_id <> OLD.group_session_id) THEN
    RAISE EXCEPTION 'a confirmed record changes only through corrections'
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'record_confirmed';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER session_records_guard BEFORE UPDATE ON records.session_records
  FOR EACH ROW EXECUTE FUNCTION records.guard_record();

CREATE TABLE records.assessments (
  id                uuid PRIMARY KEY,
  group_id          uuid NOT NULL,
  centre_id         uuid NOT NULL,
  session_record_id uuid UNIQUE REFERENCES records.session_records (id),
  title             text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  series            text CHECK (char_length(series) <= 80),   -- comparable results share a series
  max_score         numeric(6,2) NOT NULL CHECK (max_score > 0),
  tagging_mode      text NOT NULL DEFAULT 'none' CHECK (tagging_mode IN ('none', 'whole_quiz', 'per_question')),
  taken_on          date NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assessments_series ON records.assessments (group_id, series, taken_on);

CREATE TABLE records.record_entries (
  id                uuid PRIMARY KEY,
  session_record_id uuid NOT NULL REFERENCES records.session_records (id),
  centre_id         uuid NOT NULL,
  student_id        uuid NOT NULL,                     -- → org.students (roster only, never guessed)
  attendance        text NOT NULL DEFAULT 'not_recorded' CHECK (attendance IN ('present', 'absent', 'late', 'not_recorded')),
  late_minutes      smallint CHECK (late_minutes BETWEEN 0 AND 600),
  homework          text NOT NULL DEFAULT 'not_recorded' CHECK (homework IN ('done', 'partial', 'missing', 'not_recorded')),
  assessment_id     uuid REFERENCES records.assessments (id),
  score             numeric(6,2),                      -- NULL = not entered; never 0 for an absence
  participation     text NOT NULL DEFAULT 'not_recorded' CHECK (participation IN ('low', 'normal', 'high', 'not_recorded')),
  observation       text CHECK (char_length(observation) <= 1000),   -- internal (BR-APR-13)
  observation_tag   text CHECK (observation_tag IN ('understanding', 'needs_revisit', 'behaviour', 'positive', 'absence_context')),
  source            text NOT NULL DEFAULT 'tap' CHECK (source IN ('tap', 'voice')),
  confidence        jsonb,
  source_spans      jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_record_id, student_id),
  CHECK (score IS NULL OR score >= 0),
  CHECK (score IS NULL OR attendance <> 'absent')
);
CREATE INDEX record_entries_student ON records.record_entries (student_id);
CREATE TRIGGER record_entries_touch BEFORE UPDATE ON records.record_entries
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- INV-12: an entry belongs to its record's centre. INV-10: a score never goes above its maximum
-- (block, never cap — BR-APR-09). INV-09: once the record is confirmed, an entry changes only in
-- the transaction that writes its correction (it sets app.correction_id first).
CREATE FUNCTION records.guard_entry() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE rec record; mx numeric;
BEGIN
  SELECT status, centre_id INTO rec FROM records.session_records WHERE id = NEW.session_record_id;
  NEW.centre_id := rec.centre_id;
  IF TG_OP = 'UPDATE' AND rec.status = 'confirmed'
     AND coalesce(current_setting('app.correction_id', true), '') = '' THEN
    RAISE EXCEPTION 'record % is confirmed: add a correction instead', NEW.session_record_id
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'record_confirmed';
  END IF;
  IF TG_OP = 'INSERT' AND rec.status = 'confirmed' THEN
    RAISE EXCEPTION 'record % is confirmed', NEW.session_record_id
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'record_confirmed';
  END IF;
  IF NEW.score IS NOT NULL THEN
    SELECT max_score INTO mx FROM records.assessments WHERE id = NEW.assessment_id;
    IF mx IS NULL THEN
      RAISE EXCEPTION 'a score needs an assessment with a maximum'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'assessment_required';
    END IF;
    IF NEW.score > mx THEN
      RAISE EXCEPTION 'score % is above the maximum %', NEW.score, mx
        USING ERRCODE = 'check_violation', CONSTRAINT = 'score_out_of_range';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER record_entries_guard BEFORE INSERT OR UPDATE ON records.record_entries
  FOR EACH ROW EXECUTE FUNCTION records.guard_entry();
CREATE TRIGGER record_entries_no_delete BEFORE DELETE ON records.record_entries
  FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

-- Per-question marks (Phase 3 tagging); kept with the scores so they live in one place.
CREATE TABLE records.assessment_items (
  id            uuid PRIMARY KEY,
  assessment_id uuid NOT NULL REFERENCES records.assessments (id),
  centre_id     uuid NOT NULL,
  label         text NOT NULL,
  max_marks     numeric(6,2) NOT NULL CHECK (max_marks > 0),
  position      smallint NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE records.item_scores (
  id                 uuid PRIMARY KEY,
  assessment_item_id uuid NOT NULL REFERENCES records.assessment_items (id),
  student_id         uuid NOT NULL,
  centre_id          uuid NOT NULL,
  marks              numeric(6,2) NOT NULL CHECK (marks >= 0),
  record_entry_id    uuid REFERENCES records.record_entries (id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_item_id, student_id)
);

-- FUP-REC-08: append-only; the original value stays in history.
CREATE TABLE records.corrections (
  id              uuid PRIMARY KEY,
  record_entry_id uuid NOT NULL REFERENCES records.record_entries (id),
  session_record_id uuid NOT NULL REFERENCES records.session_records (id),
  centre_id       uuid NOT NULL,
  student_id      uuid NOT NULL,
  field           text NOT NULL CHECK (field IN ('attendance', 'score', 'participation', 'observation')),
  old_value       text,
  new_value       text,
  reason          text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  corrected_by    uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX corrections_record ON records.corrections (session_record_id, created_at);
CREATE TRIGGER corrections_append_only BEFORE UPDATE OR DELETE ON records.corrections
  FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

-- CF-34: the owner asks; only the teacher corrects.
CREATE TABLE records.correction_requests (
  id                uuid PRIMARY KEY,
  session_record_id uuid NOT NULL REFERENCES records.session_records (id),
  centre_id         uuid NOT NULL,
  group_id          uuid NOT NULL,
  student_id        uuid,                              -- NULL: the whole record
  text              text NOT NULL CHECK (char_length(btrim(text)) BETWEEN 1 AND 500),
  requested_by      uuid NOT NULL,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  done_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'open' OR done_at IS NOT NULL)
);
CREATE INDEX correction_requests_record ON records.correction_requests (session_record_id);

-- FUP-REC-10: internal notes (BR-APR-13); "suggested" goes to staff, never to a parent directly.
CREATE TABLE records.notes (
  id                uuid PRIMARY KEY,
  student_id        uuid NOT NULL,
  centre_id         uuid NOT NULL,
  group_id          uuid NOT NULL,
  author_id         uuid NOT NULL,
  tag               text NOT NULL CHECK (tag IN ('understanding', 'needs_revisit', 'behaviour', 'positive', 'absence_context')),
  body              text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  visibility        text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal', 'suggested_for_parent')),
  session_record_id uuid REFERENCES records.session_records (id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notes_student ON records.notes (student_id, created_at);
CREATE TRIGGER notes_touch BEFORE UPDATE ON records.notes FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE records.session_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY sr_teacher ON records.session_records FOR SELECT TO app_user USING (teacher_id = platform.ctx_teacher_id());
CREATE POLICY sr_centre ON records.session_records FOR SELECT TO app_user USING (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY sr_system ON records.session_records TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY sr_ops ON records.session_records FOR SELECT TO app_ops USING (platform.ctx_is_ops());

-- Child tables: visible exactly when their record is (the record's policy runs in the subquery).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['record_entries', 'corrections', 'correction_requests'] LOOP
    EXECUTE format('ALTER TABLE records.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON records.%I FOR SELECT TO app_user USING (session_record_id IN (SELECT id FROM records.session_records))', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON records.%I TO app_worker USING (true) WITH CHECK (true)', t || '_system', t);
    EXECUTE format('CREATE POLICY %I ON records.%I FOR SELECT TO app_ops USING (platform.ctx_is_ops())', t || '_ops', t);
  END LOOP;
END $$;

ALTER TABLE records.assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY as_read ON records.assessments FOR SELECT TO app_user
  USING (centre_id = ANY (platform.ctx_centre_ids())
         OR group_id IN (SELECT g.id FROM market.groups g WHERE g.teacher_id = platform.ctx_teacher_id()));
CREATE POLICY as_system ON records.assessments TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY as_ops ON records.assessments FOR SELECT TO app_ops USING (platform.ctx_is_ops());

ALTER TABLE records.assessment_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_read ON records.assessment_items FOR SELECT TO app_user
  USING (assessment_id IN (SELECT id FROM records.assessments));
CREATE POLICY ai_system ON records.assessment_items TO app_worker USING (true) WITH CHECK (true);
ALTER TABLE records.item_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY is_read ON records.item_scores FOR SELECT TO app_user
  USING (assessment_item_id IN (SELECT id FROM records.assessment_items));
CREATE POLICY is_system ON records.item_scores TO app_worker USING (true) WITH CHECK (true);

ALTER TABLE records.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY notes_read ON records.notes FOR SELECT TO app_user
  USING (centre_id = ANY (platform.ctx_centre_ids())
         OR group_id IN (SELECT g.id FROM market.groups g WHERE g.teacher_id = platform.ctx_teacher_id()));
CREATE POLICY notes_system ON records.notes TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY notes_ops ON records.notes FOR SELECT TO app_ops USING (platform.ctx_is_ops());

GRANT SELECT ON records.session_records, records.record_entries, records.assessments, records.assessment_items,
  records.item_scores, records.corrections, records.correction_requests, records.notes TO app_user, app_ops;
GRANT SELECT, INSERT, UPDATE ON records.session_records, records.record_entries, records.assessments,
  records.assessment_items, records.item_scores, records.correction_requests, records.notes TO app_worker;
GRANT SELECT, INSERT ON records.corrections TO app_worker;

-- Students the caller may name (teacher of the group, or staff of the centre): anyone who held a
-- paid seat there. The follow-up roster of a session is the paid seats that cover it (BR-ENR-13).
CREATE VIEW records.known_students WITH (security_barrier) AS
  SELECT DISTINCT e.student_id, e.group_id, e.centre_id, st.display_name
  FROM market.enrolments e
  JOIN org.students st ON st.id = e.student_id
  WHERE e.status IN ('confirmed', 'past_due', 'ended')
    AND (e.teacher_id = platform.ctx_teacher_id() OR e.centre_id = ANY (platform.ctx_centre_ids()));
GRANT SELECT ON records.known_students TO app_user, app_worker, app_ops;

-- migrate:down
DROP VIEW IF EXISTS records.known_students;
DROP TABLE IF EXISTS records.notes;
DROP TABLE IF EXISTS records.correction_requests;
DROP TABLE IF EXISTS records.corrections;
DROP TABLE IF EXISTS records.item_scores;
DROP TABLE IF EXISTS records.assessment_items;
DROP TABLE IF EXISTS records.record_entries;
DROP FUNCTION IF EXISTS records.guard_entry();
DROP TABLE IF EXISTS records.assessments;
DROP TABLE IF EXISTS records.session_records;
DROP FUNCTION IF EXISTS records.guard_record();
