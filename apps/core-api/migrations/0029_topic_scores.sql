-- migrate:up
-- Database v2, group C (docs/plan/database-v2.md §2.C; CF-58 decided 2026-10-16): ONE topic score
-- for every role. analytics.student_topic_scores is the only place it is computed, so the student,
-- the parent, the teacher and the centre always read the same number:
--   quiz_count    = assessments with a confirmed mark for the student on a question tagged to the topic
--   score         = the average over those assessments of Σ marks ÷ Σ max marks × 100 (tagged questions);
--                   NULL under 2 quizzes (hidden here, so no endpoint can show it)
--   score_display = round(score), half up
--   band          = mastered (≥ 80) · improving (60–79) · needs_practice (< 60), from score_display;
--                   not_taught_yet when no confirmed record of the group covers the topic and no
--                   confirmed quiz is tagged to it; not_enough_data otherwise under 2 quizzes.
-- Per student × group × topic, so one centre never sees another centre's marks. The weighted
-- version (ANL-SCR-01: recency × precision, 3+ results) replaces this for everyone at once, later.
-- Never a class average, rank or another student's row for a family reader.

-- The topic map a group follows: the newest published map of its subject.
CREATE FUNCTION analytics.group_topic_map(p_group uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT t.id FROM market.groups g
  JOIN ref.topic_templates t ON t.subject_id = g.subject_id AND t.status = 'published'
  WHERE g.id = p_group ORDER BY t.academic_year DESC LIMIT 1
$$;

-- Who may read a (student, group, centre) row: the family, the group's teacher, the centre, ops,
-- and the system role.
CREATE FUNCTION analytics.may_read_scores(p_student uuid, p_group uuid, p_centre uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT p_student IN (SELECT org.family_student_ids())
      OR EXISTS (SELECT 1 FROM market.groups g WHERE g.id = p_group AND g.teacher_id = platform.ctx_teacher_id())
      OR p_centre = ANY (platform.ctx_centre_ids())
      OR platform.ctx_is_ops()
      OR session_user = 'app_worker'          -- the system: the monthly snapshot job
$$;

CREATE VIEW analytics.student_topic_scores WITH (security_barrier) AS
  WITH roster AS (
    SELECT DISTINCT e.student_id, e.group_id, e.centre_id
    FROM market.enrolments e
    WHERE e.status IN ('confirmed', 'awaiting_teacher', 'past_due', 'ended')
  ),
  quiz AS (               -- one value per assessment, from confirmed records only
    -- Per question: Σ marks ÷ Σ max marks on the questions tagged to the topic.
    SELECT sc.student_id, a.group_id, it.topic_node_id, a.id AS assessment_id,
           sum(sc.marks) * 100.0 / sum(ai.max_marks) AS pct
    FROM records.item_scores sc
    JOIN records.assessment_items ai ON ai.id = sc.assessment_item_id
    JOIN analytics.item_topics it ON it.assessment_item_id = ai.id
    JOIN records.assessments a ON a.id = ai.assessment_id AND a.tagging_mode = 'per_question'
    JOIN records.session_records sr ON sr.id = a.session_record_id AND sr.status = 'confirmed'
    GROUP BY sc.student_id, a.group_id, it.topic_node_id, a.id
    UNION ALL
    -- Whole quiz (its one item covers the quiz): the student's score ÷ the quiz maximum.
    SELECT re.student_id, a.group_id, it.topic_node_id, a.id, re.score * 100.0 / a.max_score
    FROM records.assessments a
    JOIN records.session_records sr ON sr.id = a.session_record_id AND sr.status = 'confirmed'
    JOIN records.assessment_items ai ON ai.assessment_id = a.id
    JOIN analytics.item_topics it ON it.assessment_item_id = ai.id
    JOIN records.record_entries re ON re.assessment_id = a.id AND re.score IS NOT NULL
    WHERE a.tagging_mode = 'whole_quiz'
  ),
  agg AS (
    SELECT student_id, group_id, topic_node_id, count(*)::int AS quiz_count, avg(pct) AS score
    FROM quiz GROUP BY student_id, group_id, topic_node_id
  ),
  covered AS (
    SELECT DISTINCT st.group_id, st.topic_node_id
    FROM records.session_topics st
    JOIN records.session_records sr ON sr.id = st.session_record_id AND sr.status = 'confirmed'
  ),
  base AS (
    SELECT r.student_id, r.group_id, r.centre_id, n.id AS topic_node_id, n.parent_id AS unit_node_id,
           coalesce(a.quiz_count, 0) AS quiz_count,
           CASE WHEN coalesce(a.quiz_count, 0) >= 2 THEN round(a.score, 2) END AS score,
           (c.topic_node_id IS NOT NULL OR coalesce(a.quiz_count, 0) > 0) AS taught
    FROM roster r
    JOIN ref.topic_template_nodes n ON n.template_id = analytics.group_topic_map(r.group_id) AND n.kind = 'topic'
    LEFT JOIN agg a ON a.student_id = r.student_id AND a.group_id = r.group_id AND a.topic_node_id = n.id
    LEFT JOIN covered c ON c.group_id = r.group_id AND c.topic_node_id = n.id
  )
  SELECT b.student_id, b.group_id, b.centre_id, b.topic_node_id, b.unit_node_id, b.quiz_count, b.score,
         round(b.score)::smallint AS score_display,
         CASE WHEN NOT b.taught THEN 'not_taught_yet'
              WHEN b.quiz_count < 2 THEN 'not_enough_data'
              WHEN round(b.score) >= 80 THEN 'mastered'
              WHEN round(b.score) >= 60 THEN 'improving'
              ELSE 'needs_practice' END AS band
  FROM base b
  WHERE analytics.may_read_scores(b.student_id, b.group_id, b.centre_id);
GRANT SELECT ON analytics.student_topic_scores TO app_user, app_worker, app_ops;

-- Monthly snapshots for the "last month" comparison (append-only; written on the 1st, Cairo time,
-- for the month that ended).
CREATE TABLE analytics.topic_score_snapshots (
  id            uuid PRIMARY KEY,
  student_id    uuid NOT NULL,
  group_id      uuid NOT NULL,
  centre_id     uuid NOT NULL,
  topic_node_id uuid NOT NULL,
  month         date NOT NULL CHECK (extract(day FROM month) = 1),
  score         numeric(5,2),
  score_display smallint CHECK (score_display BETWEEN 0 AND 100),
  band          text NOT NULL CHECK (band IN ('mastered', 'improving', 'needs_practice', 'not_enough_data', 'not_taught_yet')),
  quiz_count    smallint NOT NULL CHECK (quiz_count >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, group_id, topic_node_id, month),
  CHECK ((score IS NULL) = (quiz_count < 2))
);
CREATE TRIGGER topic_score_snapshots_append_only BEFORE UPDATE OR DELETE ON analytics.topic_score_snapshots
  FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
ALTER TABLE analytics.topic_score_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY tss_read ON analytics.topic_score_snapshots FOR SELECT TO app_user
  USING (analytics.may_read_scores(student_id, group_id, centre_id));
CREATE POLICY tss_system ON analytics.topic_score_snapshots TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY tss_ops ON analytics.topic_score_snapshots FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT ON analytics.topic_score_snapshots TO app_user, app_ops;
GRANT SELECT, INSERT ON analytics.topic_score_snapshots TO app_worker;

REVOKE ALL ON FUNCTION analytics.group_topic_map(uuid), analytics.may_read_scores(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.group_topic_map(uuid), analytics.may_read_scores(uuid, uuid, uuid)
  TO app_user, app_worker, app_ops;

-- migrate:down
DROP TABLE analytics.topic_score_snapshots;
DROP VIEW analytics.student_topic_scores;
DROP FUNCTION analytics.may_read_scores(uuid, uuid, uuid);
DROP FUNCTION analytics.group_topic_map(uuid);
