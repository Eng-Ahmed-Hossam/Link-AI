-- migrate:up
-- Database v2, group C (docs/plan/database-v2.md §2.C): the topic map per subject (a subject
-- already fixes the curriculum and school year): subject → unit → topic, as docs/06 §2
-- topic_templates / topic_template_nodes. Sessions record the topics they covered (locked with the
-- record), and quiz questions are tagged to topics (analytics.item_topics, docs/06 §9, no weight).

CREATE TABLE ref.topic_templates (
  id            uuid PRIMARY KEY,
  subject_id    uuid NOT NULL REFERENCES ref.subjects (id),
  academic_year text NOT NULL CHECK (academic_year ~ '^[0-9]{4}/[0-9]{2}$'),
  name_en       text NOT NULL CHECK (char_length(btrim(name_en)) BETWEEN 1 AND 120),
  name_ar       text NOT NULL CHECK (char_length(btrim(name_ar)) BETWEEN 1 AND 120),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  confirmed     boolean NOT NULL DEFAULT false,              -- false until OD-07 is decided
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX topic_templates_published ON ref.topic_templates (subject_id, academic_year) WHERE status = 'published';

CREATE TABLE ref.topic_template_nodes (
  id           uuid PRIMARY KEY,
  template_id  uuid NOT NULL REFERENCES ref.topic_templates (id),
  parent_id    uuid REFERENCES ref.topic_template_nodes (id),
  kind         text NOT NULL CHECK (kind IN ('unit', 'topic')),
  name_en      text NOT NULL CHECK (char_length(btrim(name_en)) BETWEEN 1 AND 120),
  name_ar      text NOT NULL CHECK (char_length(btrim(name_ar)) BETWEEN 1 AND 120),
  position     smallint NOT NULL,
  planned_week smallint CHECK (planned_week BETWEEN 1 AND 53),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'unit') = (parent_id IS NULL))
);
CREATE INDEX topic_template_nodes_template ON ref.topic_template_nodes (template_id, position);

-- A topic sits under a unit of the same map.
CREATE FUNCTION ref.guard_topic_node() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'topic' AND NOT EXISTS (
       SELECT 1 FROM ref.topic_template_nodes p
       WHERE p.id = NEW.parent_id AND p.kind = 'unit' AND p.template_id = NEW.template_id) THEN
    RAISE EXCEPTION 'a topic sits under a unit of the same map'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'topic_under_unit';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER topic_template_nodes_guard BEFORE INSERT OR UPDATE ON ref.topic_template_nodes
  FOR EACH ROW EXECUTE FUNCTION ref.guard_topic_node();

-- ── Topics a session covered (part of the record the teacher confirms) ────────
CREATE TABLE records.session_topics (
  session_record_id uuid NOT NULL REFERENCES records.session_records (id),
  topic_node_id     uuid NOT NULL,               -- → ref.topic_template_nodes (kind topic)
  centre_id         uuid NOT NULL,
  group_id          uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_record_id, topic_node_id)
);
CREATE INDEX session_topics_group ON records.session_topics (group_id, topic_node_id);

CREATE FUNCTION records.guard_session_topic() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE rec record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO rec FROM records.session_records WHERE id = OLD.session_record_id;
  ELSE
    SELECT status, centre_id, group_id INTO rec FROM records.session_records WHERE id = NEW.session_record_id;
    NEW.centre_id := rec.centre_id; NEW.group_id := rec.group_id;
    IF NOT EXISTS (SELECT 1 FROM ref.topic_template_nodes n WHERE n.id = NEW.topic_node_id AND n.kind = 'topic') THEN
      RAISE EXCEPTION 'not a topic of a topic map' USING ERRCODE = 'check_violation', CONSTRAINT = 'topic_unknown';
    END IF;
  END IF;
  IF rec.status = 'confirmed' AND coalesce(current_setting('app.correction_id', true), '') = '' THEN
    RAISE EXCEPTION 'the record is confirmed: add a correction instead'
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'record_confirmed';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;
CREATE TRIGGER session_topics_guard BEFORE INSERT OR UPDATE OR DELETE ON records.session_topics
  FOR EACH ROW EXECUTE FUNCTION records.guard_session_topic();

-- ── Quiz questions tagged to topics ──────────────────────────────────────────
CREATE TABLE analytics.item_topics (
  assessment_item_id uuid NOT NULL,              -- → records.assessment_items
  topic_node_id      uuid NOT NULL,              -- → ref.topic_template_nodes (kind topic)
  centre_id          uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assessment_item_id, topic_node_id)
);
CREATE INDEX item_topics_topic ON analytics.item_topics (topic_node_id);

CREATE FUNCTION analytics.guard_item_topic() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  SELECT centre_id INTO NEW.centre_id FROM records.assessment_items WHERE id = NEW.assessment_item_id;
  IF NEW.centre_id IS NULL THEN
    RAISE EXCEPTION 'unknown question' USING ERRCODE = 'check_violation', CONSTRAINT = 'item_unknown';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ref.topic_template_nodes n WHERE n.id = NEW.topic_node_id AND n.kind = 'topic') THEN
    RAISE EXCEPTION 'not a topic of a topic map' USING ERRCODE = 'check_violation', CONSTRAINT = 'topic_unknown';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER item_topics_guard BEFORE INSERT OR UPDATE ON analytics.item_topics
  FOR EACH ROW EXECUTE FUNCTION analytics.guard_item_topic();

-- The topics a student or parent may see as covered: confirmed records the child has an entry in.
CREATE VIEW records.student_session_topics WITH (security_barrier) AS
  SELECT st.session_record_id, sr.group_session_id, st.topic_node_id, re.student_id
  FROM records.session_topics st
  JOIN records.session_records sr ON sr.id = st.session_record_id AND sr.status = 'confirmed'
  JOIN records.record_entries re ON re.session_record_id = sr.id
  WHERE re.student_id IN (SELECT org.family_student_ids());
GRANT SELECT ON records.student_session_topics TO app_user;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE ref.topic_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tt_read ON ref.topic_templates FOR SELECT TO app_user USING (status = 'published');
CREATE POLICY tt_system ON ref.topic_templates TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY tt_ops ON ref.topic_templates TO app_ops USING (platform.ctx_is_ops()) WITH CHECK (platform.ctx_is_ops());
ALTER TABLE ref.topic_template_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY ttn_read ON ref.topic_template_nodes FOR SELECT TO app_user
  USING (template_id IN (SELECT id FROM ref.topic_templates));
CREATE POLICY ttn_system ON ref.topic_template_nodes TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY ttn_ops ON ref.topic_template_nodes TO app_ops USING (platform.ctx_is_ops()) WITH CHECK (platform.ctx_is_ops());
GRANT SELECT ON ref.topic_templates, ref.topic_template_nodes TO app_user;
GRANT SELECT, INSERT, UPDATE ON ref.topic_templates, ref.topic_template_nodes TO app_worker, app_ops;

ALTER TABLE records.session_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY st_read ON records.session_topics FOR SELECT TO app_user
  USING (session_record_id IN (SELECT id FROM records.session_records));
CREATE POLICY st_system ON records.session_topics TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY st_ops ON records.session_topics FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT ON records.session_topics TO app_user, app_ops;
GRANT SELECT, INSERT, DELETE ON records.session_topics TO app_worker;

ALTER TABLE analytics.item_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY it_read ON analytics.item_topics FOR SELECT TO app_user
  USING (assessment_item_id IN (SELECT id FROM records.assessment_items));
CREATE POLICY it_system ON analytics.item_topics TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY it_ops ON analytics.item_topics FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT ON analytics.item_topics TO app_user, app_ops;
GRANT SELECT, INSERT, DELETE ON analytics.item_topics TO app_worker;
-- Re-tagging a quiz of a DRAFT record replaces its questions (core-api checks the draft).
GRANT DELETE ON records.assessment_items, records.item_scores TO app_worker;

-- migrate:down
REVOKE DELETE ON records.assessment_items, records.item_scores FROM app_worker;
DROP VIEW records.student_session_topics;
DROP TABLE analytics.item_topics;
DROP FUNCTION analytics.guard_item_topic();
DROP TABLE records.session_topics;
DROP FUNCTION records.guard_session_topic();
DROP TABLE ref.topic_template_nodes;
DROP FUNCTION ref.guard_topic_node();
DROP TABLE ref.topic_templates;
