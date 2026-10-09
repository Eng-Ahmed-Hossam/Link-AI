-- migrate:up
-- R2b: reviews (docs/06 §4, BR-REV). Only verified parents review (BR-REV-01, checked by the API);
-- targets reply or report and can never delete, edit or hide (BR-REV-06): no DELETE grant at all.
-- The centre where the enrolment is (the tenant) sees and answers its reviews, teacher reviews
-- included, as C04 shows them (CF-51).

CREATE TABLE market.reviews (
  id           uuid PRIMARY KEY,
  enrolment_id uuid NOT NULL REFERENCES market.enrolments (id),
  guardian_id  uuid NOT NULL,
  target_type  text NOT NULL CHECK (target_type IN ('centre', 'teacher')),
  target_id    uuid NOT NULL,
  centre_id    uuid NOT NULL,                     -- tenant: the enrolment's centre
  term_id      uuid,                              -- → ref.academic_terms (NULL outside any term)
  school_year_id uuid NOT NULL,                   -- "Verified parent • <school year>"
  stars        smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  tags         text[] NOT NULL DEFAULT '{}',
  body         text NOT NULL DEFAULT '' CHECK (char_length(body) <= 600),
  visibility   text NOT NULL CHECK (visibility IN ('public', 'private')),
  status       text NOT NULL CHECK (status IN ('pending_checks', 'published', 'held', 'needs_edit', 'hidden')),
  flags        text[] NOT NULL DEFAULT '{}',
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
-- BR-REV-02: one review per enrolment, target and term (a NULL term still counts as one).
CREATE UNIQUE INDEX reviews_once ON market.reviews (enrolment_id, target_type, target_id, term_id) NULLS NOT DISTINCT;
CREATE INDEX reviews_target ON market.reviews (target_type, target_id, status);
CREATE INDEX reviews_centre ON market.reviews (centre_id, created_at);
CREATE TRIGGER reviews_touch BEFORE UPDATE ON market.reviews FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE market.review_replies (
  id             uuid PRIMARY KEY,
  review_id      uuid NOT NULL UNIQUE REFERENCES market.reviews (id),
  centre_id      uuid NOT NULL,
  author_user_id uuid NOT NULL,
  body           text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 600),
  status         text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE market.review_reports (
  id          uuid PRIMARY KEY,
  review_id   uuid NOT NULL REFERENCES market.reviews (id),
  centre_id   uuid NOT NULL,
  reported_by uuid NOT NULL,
  reason      text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 600),
  resolved_at timestamptz,
  resolution  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_reports_review ON market.review_reports (review_id);

-- BR-REV-07: the public rating counts published public reviews. The stats move by the change of
-- each review, so the seeded sample ratings stay as they are.
CREATE FUNCTION market.review_stats_delta() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE was boolean := false; now_counts boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN was := OLD.status = 'published' AND OLD.visibility = 'public'; END IF;
  now_counts := NEW.status = 'published' AND NEW.visibility = 'public';
  IF was = now_counts THEN RETURN NEW; END IF;
  INSERT INTO market.review_stats (target_type, target_id) VALUES (NEW.target_type, NEW.target_id)
    ON CONFLICT DO NOTHING;
  UPDATE market.review_stats
     SET distribution[6 - NEW.stars] = distribution[6 - NEW.stars] + CASE WHEN now_counts THEN 1 ELSE -1 END,
         tag_counts = (
           SELECT coalesce(jsonb_agg(jsonb_build_object('tag', t.tag, 'count', t.n) ORDER BY t.n DESC, t.tag), '[]'::jsonb)
           FROM (
             SELECT tag, sum(n)::int AS n FROM (
               SELECT x->>'tag' AS tag, (x->>'count')::int AS n FROM jsonb_array_elements(tag_counts) x
               UNION ALL
               SELECT tg, CASE WHEN now_counts THEN 1 ELSE -1 END FROM unnest(NEW.tags) tg
             ) all_tags GROUP BY tag HAVING sum(n) > 0
           ) t),
         updated_at = now()
   WHERE target_type = NEW.target_type AND target_id = NEW.target_id;
  RETURN NEW;
END
$$;
CREATE TRIGGER reviews_stats AFTER INSERT OR UPDATE OF status, visibility ON market.reviews
  FOR EACH ROW EXECUTE FUNCTION market.review_stats_delta();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE market.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY rv_public ON market.reviews FOR SELECT TO app_user USING (visibility = 'public' AND status = 'published');
CREATE POLICY rv_author ON market.reviews TO app_user
  USING (guardian_id = platform.ctx_guardian_id()) WITH CHECK (guardian_id = platform.ctx_guardian_id());
CREATE POLICY rv_teacher ON market.reviews FOR SELECT TO app_user
  USING (target_type = 'teacher' AND target_id = platform.ctx_teacher_id());
CREATE POLICY rv_centre ON market.reviews FOR SELECT TO app_user USING (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY rv_system ON market.reviews TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY rv_ops ON market.reviews FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT, INSERT ON market.reviews TO app_user;
GRANT SELECT, INSERT, UPDATE ON market.reviews TO app_worker;
GRANT SELECT, UPDATE ON market.reviews TO app_ops;   -- ops moderate (hide, needs_edit), never delete

ALTER TABLE market.review_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY rr_read ON market.review_replies FOR SELECT TO app_user
  USING (status = 'published' OR centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY rr_centre_write ON market.review_replies FOR INSERT TO app_user
  WITH CHECK (centre_id = ANY (platform.ctx_centre_ids()) AND author_user_id = platform.ctx_user_id());
CREATE POLICY rr_teacher_write ON market.review_replies FOR INSERT TO app_user
  WITH CHECK (author_user_id = platform.ctx_user_id()
              AND review_id IN (SELECT r.id FROM market.reviews r WHERE r.target_type = 'teacher' AND r.target_id = platform.ctx_teacher_id()));
CREATE POLICY rr_system ON market.review_replies TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY rr_ops ON market.review_replies FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT, INSERT ON market.review_replies TO app_user;
GRANT SELECT, INSERT, UPDATE ON market.review_replies TO app_worker;
GRANT SELECT, UPDATE ON market.review_replies TO app_ops;

ALTER TABLE market.review_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY rp_centre ON market.review_reports TO app_user
  USING (centre_id = ANY (platform.ctx_centre_ids()))
  WITH CHECK (centre_id = ANY (platform.ctx_centre_ids()) AND reported_by = platform.ctx_user_id());
CREATE POLICY rp_teacher ON market.review_reports TO app_user
  USING (reported_by = platform.ctx_user_id()) WITH CHECK (reported_by = platform.ctx_user_id());
CREATE POLICY rp_system ON market.review_reports TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY rp_ops ON market.review_reports TO app_ops USING (platform.ctx_is_ops()) WITH CHECK (platform.ctx_is_ops());
GRANT SELECT, INSERT ON market.review_reports TO app_user;
GRANT SELECT, INSERT, UPDATE ON market.review_reports TO app_worker;
GRANT SELECT, UPDATE ON market.review_reports TO app_ops;

-- migrate:down
DROP TABLE IF EXISTS market.review_reports, market.review_replies, market.reviews;
DROP FUNCTION IF EXISTS market.review_stats_delta();
