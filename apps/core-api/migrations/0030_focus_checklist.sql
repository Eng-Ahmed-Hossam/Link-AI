-- migrate:up
-- Database v2, group C (docs/plan/database-v2.md §2.C; D10 decided 2026-10-16): the weekly focus
-- checklist. The teacher drafts and approves a plan per student, group and week (docs/06 §9
-- focus_plans; the WhatsApp copy and `sent` come with messaging later). The student ticks items
-- of an approved plan; the teacher sees the ticks. A student or parent sees a plan only when it is
-- approved AND a guardian's latest `focus_plans` consent for that child is granted (never cached).
CREATE TABLE analytics.focus_plans (
  id          uuid PRIMARY KEY,
  student_id  uuid NOT NULL,
  group_id    uuid NOT NULL,
  centre_id   uuid NOT NULL,
  teacher_id  uuid NOT NULL,
  week_of     date NOT NULL CHECK (extract(isodow FROM week_of) = 1),   -- the Monday
  status      text NOT NULL DEFAULT 'drafted' CHECK (status IN ('drafted', 'approved', 'skipped')),
  draft       text CHECK (char_length(draft) <= 1000),
  approved_by uuid,
  approved_at timestamptz,
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, group_id, week_of),
  CHECK ((status = 'approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE TRIGGER focus_plans_touch BEFORE UPDATE ON analytics.focus_plans
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE analytics.focus_plan_items (
  id            uuid PRIMARY KEY,
  focus_plan_id uuid NOT NULL REFERENCES analytics.focus_plans (id),
  centre_id     uuid NOT NULL,
  topic_node_id uuid,                            -- → ref.topic_template_nodes
  text_ar       text NOT NULL CHECK (char_length(btrim(text_ar)) BETWEEN 1 AND 200),
  text_en       text CHECK (char_length(btrim(text_en)) BETWEEN 1 AND 200),
  position      smallint NOT NULL,
  ticked_at     timestamptz,                     -- the student's tick
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX focus_plan_items_plan ON analytics.focus_plan_items (focus_plan_id, position);
CREATE TRIGGER focus_plan_items_touch BEFORE UPDATE ON analytics.focus_plan_items
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- The plan's centre and teacher come from the group; an approved plan never goes back. Items:
-- text only while the plan is a draft; ticks only on an approved plan.
CREATE FUNCTION analytics.guard_focus() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE plan record;
BEGIN
  IF TG_TABLE_NAME = 'focus_plans' THEN
    SELECT centre_id, teacher_id INTO NEW.centre_id, NEW.teacher_id FROM market.groups WHERE id = NEW.group_id;
    IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND (NEW.status <> 'approved' OR NEW.draft IS DISTINCT FROM OLD.draft) THEN
      RAISE EXCEPTION 'an approved plan is locked' USING ERRCODE = 'restrict_violation', CONSTRAINT = 'focus_plan_locked';
    END IF;
    RETURN NEW;
  END IF;
  SELECT status, centre_id INTO plan FROM analytics.focus_plans WHERE id = NEW.focus_plan_id;
  NEW.centre_id := plan.centre_id;
  IF plan.status <> 'drafted' AND (TG_OP = 'INSERT' OR NEW.text_ar IS DISTINCT FROM OLD.text_ar
      OR NEW.text_en IS DISTINCT FROM OLD.text_en OR NEW.topic_node_id IS DISTINCT FROM OLD.topic_node_id
      OR NEW.position IS DISTINCT FROM OLD.position) THEN
    RAISE EXCEPTION 'an approved plan is locked' USING ERRCODE = 'restrict_violation', CONSTRAINT = 'focus_plan_locked';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.ticked_at IS DISTINCT FROM OLD.ticked_at AND plan.status <> 'approved' THEN
    RAISE EXCEPTION 'only an approved plan is ticked' USING ERRCODE = 'restrict_violation', CONSTRAINT = 'focus_plan_not_approved';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER focus_plans_guard BEFORE INSERT OR UPDATE ON analytics.focus_plans
  FOR EACH ROW EXECUTE FUNCTION analytics.guard_focus();
CREATE TRIGGER focus_plan_items_guard BEFORE INSERT OR UPDATE ON analytics.focus_plan_items
  FOR EACH ROW EXECUTE FUNCTION analytics.guard_focus();

-- D10: a guardian's latest focus_plans consent for this child is granted (read live, never cached).
CREATE FUNCTION org.focus_consent(p_student uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM org.student_guardians sg
    CROSS JOIN LATERAL (
      SELECT ce.granted FROM org.consent_events ce
      WHERE ce.guardian_id = sg.guardian_id AND ce.student_id = p_student AND ce.kind = 'focus_plans'
      ORDER BY ce.created_at DESC LIMIT 1) latest
    WHERE sg.student_id = p_student AND latest.granted)
$$;
REVOKE ALL ON FUNCTION org.focus_consent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION org.focus_consent(uuid) TO app_user, app_worker;

ALTER TABLE analytics.focus_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY fp_family ON analytics.focus_plans FOR SELECT TO app_user
  USING (status = 'approved' AND student_id IN (SELECT org.family_student_ids()) AND org.focus_consent(student_id));
CREATE POLICY fp_teacher ON analytics.focus_plans FOR SELECT TO app_user USING (teacher_id = platform.ctx_teacher_id());
CREATE POLICY fp_centre ON analytics.focus_plans FOR SELECT TO app_user USING (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY fp_system ON analytics.focus_plans TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY fp_ops ON analytics.focus_plans FOR SELECT TO app_ops USING (platform.ctx_is_ops());
ALTER TABLE analytics.focus_plan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY fpi_read ON analytics.focus_plan_items FOR SELECT TO app_user
  USING (focus_plan_id IN (SELECT id FROM analytics.focus_plans));
CREATE POLICY fpi_system ON analytics.focus_plan_items TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY fpi_ops ON analytics.focus_plan_items FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT ON analytics.focus_plans, analytics.focus_plan_items TO app_user, app_ops;
GRANT SELECT, INSERT, UPDATE ON analytics.focus_plans, analytics.focus_plan_items TO app_worker;

-- migrate:down
DROP TABLE analytics.focus_plan_items;
DROP TABLE analytics.focus_plans;
DROP FUNCTION analytics.guard_focus();
DROP FUNCTION org.focus_consent(uuid);
