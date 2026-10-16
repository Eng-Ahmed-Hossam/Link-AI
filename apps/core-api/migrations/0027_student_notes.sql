-- migrate:up
-- Database v2, group B4 (docs/plan/database-v2.md §2.B): teacher notes for the student. The same
-- flow as parent messages: the teacher drafts and submits; a centre user holding
-- `messages.approve` (or the owner) approves or rejects. The student and the parent see a note
-- only once it is approved, and an approved note never changes (locked).
CREATE TABLE records.student_notes (
  id                uuid PRIMARY KEY,
  student_id        uuid NOT NULL,                 -- → org.students
  group_id          uuid NOT NULL,                 -- → market.groups
  centre_id         uuid NOT NULL,
  teacher_id        uuid NOT NULL,
  author_id         uuid NOT NULL,                 -- the teacher's user
  body              text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  session_record_id uuid REFERENCES records.session_records (id),
  submitted_at      timestamptz,
  approved_by       uuid,
  approved_at       timestamptz,
  rejected_by       uuid,
  rejected_at       timestamptz,
  rejected_reason   text CHECK (char_length(rejected_reason) <= 300),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK (status <> 'rejected' OR (rejected_by IS NOT NULL AND rejected_at IS NOT NULL)),
  CHECK (status = 'draft' OR submitted_at IS NOT NULL)
);
CREATE INDEX student_notes_student ON records.student_notes (student_id, created_at DESC);
CREATE INDEX student_notes_centre ON records.student_notes (centre_id, status, created_at);
CREATE TRIGGER student_notes_touch BEFORE UPDATE ON records.student_notes
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- Locked once approved; approved only by someone who may approve messages at that centre (the
-- owner, or staff with messages.approve) — checked here too, not only in the API.
CREATE FUNCTION records.guard_student_note() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  SELECT centre_id, teacher_id INTO NEW.centre_id, NEW.teacher_id FROM market.groups WHERE id = NEW.group_id;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN
    RAISE EXCEPTION 'an approved note is locked'
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'note_locked';
  END IF;
  IF NEW.status = 'approved' AND NOT EXISTS (
       SELECT 1 FROM identity.role_assignments ra
       WHERE ra.user_id = NEW.approved_by AND ra.centre_id = NEW.centre_id AND ra.status = 'active'
         AND (ra.role = 'centre_owner' OR (ra.role = 'centre_staff' AND 'messages.approve' = ANY (ra.permissions)))) THEN
    RAISE EXCEPTION 'only the owner or staff with messages.approve approve a student note'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'note_approver';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER student_notes_guard BEFORE INSERT OR UPDATE ON records.student_notes
  FOR EACH ROW EXECUTE FUNCTION records.guard_student_note();
CREATE TRIGGER student_notes_no_delete BEFORE DELETE ON records.student_notes
  FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

ALTER TABLE records.student_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY sn_family ON records.student_notes FOR SELECT TO app_user
  USING (status = 'approved' AND student_id IN (SELECT org.family_student_ids()));
CREATE POLICY sn_teacher ON records.student_notes FOR SELECT TO app_user USING (teacher_id = platform.ctx_teacher_id());
CREATE POLICY sn_centre ON records.student_notes FOR SELECT TO app_user
  USING (centre_id = ANY (platform.ctx_centre_ids()) AND status <> 'draft');
CREATE POLICY sn_system ON records.student_notes TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY sn_ops ON records.student_notes FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT ON records.student_notes TO app_user, app_ops;
GRANT SELECT, INSERT, UPDATE ON records.student_notes TO app_worker;

-- migrate:down
DROP TABLE records.student_notes;
DROP FUNCTION records.guard_student_note();
