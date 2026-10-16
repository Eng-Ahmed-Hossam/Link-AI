-- migrate:up
-- Database v2, group B2–B3 (docs/plan/database-v2.md §2.B): "what you missed" and homework.
-- The session record gains what was covered and what homework was set (from the voice note as a
-- draft, then confirmed by the teacher with the record). Homework items per session, and a status
-- per student (set, handed in, late) that the teacher marks in a later session record. All of it
-- is locked with its record: after confirmation it changes only through a correction
-- (records.record_corrections, append-only). Students and parents see confirmed data only, their
-- own entry only, through records.student_session_summaries and the homework policies.

ALTER TABLE records.session_records
  ADD COLUMN topic_covered text CHECK (char_length(btrim(topic_covered)) BETWEEN 1 AND 300),
  ADD COLUMN homework_set text CHECK (char_length(btrim(homework_set)) BETWEEN 1 AND 500);

-- The record lock (0012) now also covers what was covered and the homework set.
CREATE OR REPLACE FUNCTION records.guard_record() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'confirmed' AND (NEW.status <> 'confirmed' OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
      OR NEW.group_id <> OLD.group_id OR NEW.group_session_id <> OLD.group_session_id) THEN
    RAISE EXCEPTION 'a confirmed record changes only through corrections'
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'record_confirmed';
  END IF;
  IF OLD.status = 'confirmed' AND (NEW.topic_covered IS DISTINCT FROM OLD.topic_covered
      OR NEW.homework_set IS DISTINCT FROM OLD.homework_set)
     AND coalesce(current_setting('app.correction_id', true), '') = '' THEN
    RAISE EXCEPTION 'record % is confirmed: add a correction instead', OLD.id
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'record_confirmed';
  END IF;
  RETURN NEW;
END
$$;

-- Record-level corrections (records.corrections is per student entry). Append-only.
CREATE TABLE records.record_corrections (
  id                uuid PRIMARY KEY,
  session_record_id uuid NOT NULL REFERENCES records.session_records (id),
  centre_id         uuid NOT NULL,
  field             text NOT NULL CHECK (field IN ('topic_covered', 'homework_set', 'homework_item',
                                                   'homework_status', 'session_topics')),
  object_id         uuid,                          -- the homework item or the student's status row
  old_value         text,
  new_value         text,
  reason            text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  corrected_by      uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX record_corrections_record ON records.record_corrections (session_record_id, created_at);
CREATE TRIGGER record_corrections_append_only BEFORE UPDATE OR DELETE ON records.record_corrections
  FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

-- ── Homework ──────────────────────────────────────────────────────────────────
CREATE TABLE records.homework_items (
  id                uuid PRIMARY KEY,
  session_record_id uuid NOT NULL REFERENCES records.session_records (id),
  group_id          uuid NOT NULL,
  group_session_id  uuid NOT NULL,
  centre_id         uuid NOT NULL,
  teacher_id        uuid NOT NULL,
  title             text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  details           text CHECK (char_length(details) <= 500),
  due_session_id    uuid,                          -- default: the group's next session
  source            text NOT NULL DEFAULT 'tap' CHECK (source IN ('tap', 'voice')),
  source_spans      jsonb,
  created_by        uuid NOT NULL,
  archived_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX homework_items_group ON records.homework_items (group_id, created_at);
CREATE TRIGGER homework_items_touch BEFORE UPDATE ON records.homework_items
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE records.homework_statuses (
  homework_item_id    uuid NOT NULL REFERENCES records.homework_items (id),
  student_id          uuid NOT NULL,
  centre_id           uuid NOT NULL,
  status              text NOT NULL DEFAULT 'set' CHECK (status IN ('set', 'handed_in', 'late')),
  marked_in_record_id uuid REFERENCES records.session_records (id),
  marked_by           uuid,
  marked_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (homework_item_id, student_id),
  CHECK ((status = 'set') = (marked_in_record_id IS NULL)),
  CHECK ((marked_in_record_id IS NULL) = (marked_at IS NULL))
);
CREATE INDEX homework_statuses_student ON records.homework_statuses (student_id);
CREATE TRIGGER homework_statuses_touch BEFORE UPDATE ON records.homework_statuses
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- Items follow their record (centre copied; changes only while it is a draft, or with a
-- correction); a mark follows the record it was marked in.
CREATE FUNCTION records.guard_homework() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE rec record; correcting boolean := coalesce(current_setting('app.correction_id', true), '') <> '';
BEGIN
  IF TG_TABLE_NAME = 'homework_items' THEN
    SELECT status, centre_id, group_id, group_session_id, teacher_id INTO rec
    FROM records.session_records WHERE id = NEW.session_record_id;
    NEW.centre_id := rec.centre_id; NEW.group_id := rec.group_id;
    NEW.group_session_id := rec.group_session_id; NEW.teacher_id := rec.teacher_id;
    IF rec.status = 'confirmed' AND NOT correcting THEN
      RAISE EXCEPTION 'record % is confirmed: add a correction instead', NEW.session_record_id
        USING ERRCODE = 'restrict_violation', CONSTRAINT = 'record_confirmed';
    END IF;
  ELSE
    SELECT centre_id INTO NEW.centre_id FROM records.homework_items WHERE id = NEW.homework_item_id;
    IF TG_OP = 'UPDATE' AND OLD.marked_in_record_id IS NOT NULL AND NOT correcting
       AND (SELECT status FROM records.session_records WHERE id = OLD.marked_in_record_id) = 'confirmed' THEN
      RAISE EXCEPTION 'this mark is in a confirmed record: add a correction instead'
        USING ERRCODE = 'restrict_violation', CONSTRAINT = 'record_confirmed';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER homework_items_guard BEFORE INSERT OR UPDATE ON records.homework_items
  FOR EACH ROW EXECUTE FUNCTION records.guard_homework();
CREATE TRIGGER homework_statuses_guard BEFORE INSERT OR UPDATE ON records.homework_statuses
  FOR EACH ROW EXECUTE FUNCTION records.guard_homework();
CREATE TRIGGER homework_items_no_delete BEFORE DELETE ON records.homework_items
  FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
CREATE TRIGGER homework_statuses_no_delete BEFORE DELETE ON records.homework_statuses
  FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

-- ── What a student or parent sees of a session ────────────────────────────────
-- Confirmed records only; the caller's own (or own child's) entry only; never another student's
-- entry, the internal observation, participation, confidence, spans or any transcript.
CREATE VIEW records.student_session_summaries WITH (security_barrier) AS
  SELECT sr.id AS session_record_id, sr.group_session_id, sr.group_id, sr.centre_id, sr.session_date,
         sr.topic_covered, sr.homework_set, re.student_id, re.attendance
  FROM records.session_records sr
  JOIN records.record_entries re ON re.session_record_id = sr.id
  WHERE sr.status = 'confirmed' AND re.student_id IN (SELECT org.family_student_ids());
GRANT SELECT ON records.student_session_summaries TO app_user;

-- A student's or parent's homework list: items of confirmed records only; a mark shows only once
-- the record it was marked in is confirmed (until then the item is still "set"). An unmarked
-- item stays "set" after its due session: "Not marked yet", never "missing".
CREATE VIEW records.student_homework WITH (security_barrier) AS
  SELECT i.id AS homework_item_id, i.group_id, i.group_session_id, i.centre_id, i.title, i.details,
         i.due_session_id, i.created_at AS set_at, h.student_id,
         CASE WHEN mr.status = 'confirmed' THEN h.status ELSE 'set' END AS status,
         CASE WHEN mr.status = 'confirmed' THEN h.marked_at END AS marked_at
  FROM records.homework_statuses h
  JOIN records.homework_items i ON i.id = h.homework_item_id AND i.archived_at IS NULL
  JOIN records.session_records sr ON sr.id = i.session_record_id AND sr.status = 'confirmed'
  LEFT JOIN records.session_records mr ON mr.id = h.marked_in_record_id
  WHERE h.student_id IN (SELECT org.family_student_ids());
GRANT SELECT ON records.student_homework TO app_user;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE records.record_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY rc_read ON records.record_corrections FOR SELECT TO app_user
  USING (session_record_id IN (SELECT id FROM records.session_records));
CREATE POLICY rc_system ON records.record_corrections TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY rc_ops ON records.record_corrections FOR SELECT TO app_ops USING (platform.ctx_is_ops());

-- Items and statuses: the record's readers (teacher, centre). Students and parents read
-- records.student_homework (above), never these tables.
ALTER TABLE records.homework_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY hi_staff ON records.homework_items FOR SELECT TO app_user
  USING (session_record_id IN (SELECT id FROM records.session_records));
CREATE POLICY hi_system ON records.homework_items TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY hi_ops ON records.homework_items FOR SELECT TO app_ops USING (platform.ctx_is_ops());

ALTER TABLE records.homework_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY hs_staff ON records.homework_statuses FOR SELECT TO app_user
  USING (homework_item_id IN (SELECT id FROM records.homework_items i
                              WHERE i.session_record_id IN (SELECT id FROM records.session_records)));
CREATE POLICY hs_system ON records.homework_statuses TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY hs_ops ON records.homework_statuses FOR SELECT TO app_ops USING (platform.ctx_is_ops());

GRANT SELECT ON records.record_corrections, records.homework_items, records.homework_statuses TO app_user, app_ops;
GRANT SELECT, INSERT ON records.record_corrections TO app_worker;
GRANT SELECT, INSERT, UPDATE ON records.homework_items, records.homework_statuses TO app_worker;

-- migrate:down
DROP VIEW records.student_homework;
DROP VIEW records.student_session_summaries;
DROP TABLE records.homework_statuses;
DROP TABLE records.homework_items;
DROP FUNCTION records.guard_homework();
DROP TABLE records.record_corrections;
CREATE OR REPLACE FUNCTION records.guard_record() RETURNS trigger
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
ALTER TABLE records.session_records DROP COLUMN homework_set, DROP COLUMN topic_covered;
