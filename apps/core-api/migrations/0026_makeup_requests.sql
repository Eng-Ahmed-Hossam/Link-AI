-- migrate:up
-- Database v2, group B2 (docs/plan/database-v2.md §2.B; decision of 2026-10-16): make-up requests.
-- A student (or the parent) asks to make up a missed session; the parent sees it; the centre
-- accepts (naming one session) or declines. An accepted make-up holds ONE seat in that single
-- session and counts toward its seat cap (INV-05): no enrolment row, no payment, no ledger entry.
-- A full session can't be accepted (seat_cap_exceeded). Every change is audited by core-api in
-- the same transaction.
CREATE TABLE market.makeup_requests (
  id                   uuid PRIMARY KEY,
  student_id           uuid NOT NULL,                      -- → org.students
  guardian_id          uuid NOT NULL,                      -- → org.guardians
  group_id             uuid NOT NULL REFERENCES market.groups (id),
  centre_id            uuid NOT NULL,
  missed_session_id    uuid NOT NULL REFERENCES market.group_sessions (id),
  requested_by_user_id uuid NOT NULL,
  requested_by         text NOT NULL CHECK (requested_by IN ('student', 'parent')),
  note                 text CHECK (char_length(note) <= 300),
  status               text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'accepted', 'declined', 'withdrawn')),
  parent_seen_at       timestamptz,
  decided_by           uuid,
  decided_at           timestamptz,
  decision_note        text CHECK (char_length(decision_note) <= 300),
  makeup_session_id    uuid REFERENCES market.group_sessions (id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK ((status IN ('accepted', 'declined')) = (decided_at IS NOT NULL AND decided_by IS NOT NULL)),
  CHECK ((status = 'accepted') = (makeup_session_id IS NOT NULL))
);
CREATE UNIQUE INDEX makeup_requests_live ON market.makeup_requests (student_id, missed_session_id)
  WHERE status IN ('requested', 'accepted');
CREATE INDEX makeup_requests_centre ON market.makeup_requests (centre_id, status, created_at);
CREATE INDEX makeup_requests_session ON market.makeup_requests (makeup_session_id) WHERE status = 'accepted';
CREATE TRIGGER makeup_requests_touch BEFORE UPDATE ON market.makeup_requests
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- The missed session is the group's; the make-up session is a scheduled future session of the
-- same centre, for the same subject and school year. A decided request never changes again.
CREATE FUNCTION market.guard_makeup() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE g record; m record;
BEGIN
  SELECT centre_id, subject_id, school_year_id INTO g FROM market.groups WHERE id = NEW.group_id;
  NEW.centre_id := g.centre_id;
  IF NOT EXISTS (SELECT 1 FROM market.group_sessions s WHERE s.id = NEW.missed_session_id AND s.group_id = NEW.group_id) THEN
    RAISE EXCEPTION 'the missed session is not a session of this group'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'makeup_missed_session';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('accepted', 'declined', 'withdrawn') AND
     (NEW.status <> OLD.status OR NEW.makeup_session_id IS DISTINCT FROM OLD.makeup_session_id) THEN
    RAISE EXCEPTION 'a decided make-up request does not change'
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'makeup_decided';
  END IF;
  IF NEW.makeup_session_id IS NOT NULL THEN
    SELECT s.status, s.starts_at, gg.centre_id, gg.subject_id, gg.school_year_id INTO m
    FROM market.group_sessions s JOIN market.groups gg ON gg.id = s.group_id WHERE s.id = NEW.makeup_session_id;
    IF m.status <> 'scheduled' OR m.starts_at <= now() OR m.centre_id <> g.centre_id
       OR m.subject_id <> g.subject_id OR m.school_year_id IS DISTINCT FROM g.school_year_id THEN
      RAISE EXCEPTION 'the make-up must be a future session of the same centre, subject and school year'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'makeup_session_invalid';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER makeup_requests_guard BEFORE INSERT OR UPDATE ON market.makeup_requests
  FOR EACH ROW EXECUTE FUNCTION market.guard_makeup();

-- Committed seats per session now include accepted make-ups (one seat in that one session).
CREATE OR REPLACE FUNCTION market.seats_committed(p_sessions uuid[]) RETURNS TABLE (session_id uuid, committed int)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT s.id, (count(e.id) + (SELECT count(*) FROM market.makeup_requests m
                               WHERE m.makeup_session_id = s.id AND m.status = 'accepted'))::int
  FROM market.group_sessions s
  LEFT JOIN market.enrolments e ON e.group_id = s.group_id
   AND e.status IN ('confirmed', 'awaiting_teacher', 'past_due')
   AND market.covers(e, s.id, market.session_day(s.starts_at))
  WHERE s.id = ANY (p_sessions)
  GROUP BY s.id
$$;

-- INV-05 for make-ups: accepting one may not put the session above its seat cap. The group row
-- is locked first, the same queue enrolments and waitlist offers use.
CREATE FUNCTION market.guard_makeup_seat() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE cap int; used int; grp uuid;
BEGIN
  IF NEW.status <> 'accepted' OR (TG_OP = 'UPDATE' AND OLD.status = 'accepted') THEN RETURN NEW; END IF;
  SELECT group_id INTO grp FROM market.group_sessions WHERE id = NEW.makeup_session_id;
  SELECT seat_cap INTO cap FROM market.groups WHERE id = grp FOR UPDATE;
  used := (SELECT committed FROM market.seats_committed(ARRAY[NEW.makeup_session_id]))
          + market.seats_offered(NEW.makeup_session_id);
  IF used > cap THEN
    RAISE EXCEPTION 'session % would have % seats used (seat_cap %)', NEW.makeup_session_id, used, cap
      USING ERRCODE = 'check_violation', CONSTRAINT = 'seat_cap_exceeded';
  END IF;
  RETURN NEW;
END
$$;
CREATE CONSTRAINT TRIGGER makeup_requests_guard_seat AFTER INSERT OR UPDATE ON market.makeup_requests
  FOR EACH ROW EXECUTE FUNCTION market.guard_makeup_seat();

-- A student also sees the session their accepted make-up is in.
CREATE OR REPLACE FUNCTION market.my_student_sessions() RETURNS TABLE (session_id uuid, group_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT s.id, s.group_id
  FROM market.enrolments e
  JOIN market.group_sessions s ON s.group_id = e.group_id
  WHERE e.student_id = platform.ctx_student_id()
    AND e.status IN ('confirmed', 'awaiting_teacher', 'past_due', 'ended')
    AND market.covers(e, s.id, market.session_day(s.starts_at))
  UNION
  SELECT s.id, s.group_id
  FROM market.makeup_requests m JOIN market.group_sessions s ON s.id = m.makeup_session_id
  WHERE m.student_id = platform.ctx_student_id() AND m.status = 'accepted'
$$;

ALTER TABLE market.makeup_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY mr_family ON market.makeup_requests FOR SELECT TO app_user
  USING (student_id IN (SELECT org.family_student_ids()));
CREATE POLICY mr_teacher ON market.makeup_requests FOR SELECT TO app_user
  USING (group_id IN (SELECT g.id FROM market.groups g WHERE g.teacher_id = platform.ctx_teacher_id()));
CREATE POLICY mr_centre ON market.makeup_requests FOR SELECT TO app_user USING (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY mr_system ON market.makeup_requests TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY mr_ops ON market.makeup_requests FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT ON market.makeup_requests TO app_user, app_ops;
GRANT SELECT, INSERT, UPDATE ON market.makeup_requests TO app_worker;

-- migrate:down
CREATE OR REPLACE FUNCTION market.my_student_sessions() RETURNS TABLE (session_id uuid, group_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT s.id, s.group_id
  FROM market.enrolments e
  JOIN market.group_sessions s ON s.group_id = e.group_id
  WHERE e.student_id = platform.ctx_student_id()
    AND e.status IN ('confirmed', 'awaiting_teacher', 'past_due', 'ended')
    AND market.covers(e, s.id, market.session_day(s.starts_at))
$$;
CREATE OR REPLACE FUNCTION market.seats_committed(p_sessions uuid[]) RETURNS TABLE (session_id uuid, committed int)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT s.id, count(e.id)::int
  FROM market.group_sessions s
  LEFT JOIN market.enrolments e ON e.group_id = s.group_id
   AND e.status IN ('confirmed', 'awaiting_teacher', 'past_due')
   AND market.covers(e, s.id, market.session_day(s.starts_at))
  WHERE s.id = ANY (p_sessions)
  GROUP BY s.id
$$;
DROP TABLE market.makeup_requests;
DROP FUNCTION market.guard_makeup_seat();
DROP FUNCTION market.guard_makeup();
