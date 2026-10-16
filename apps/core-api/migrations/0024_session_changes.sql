-- migrate:up
-- Database v2, group B1: schedule changes (docs/plan/database-v2.md §2.B). A session can move
-- (new time), change hall (a one-off hall of the same centre) or be cancelled. A trigger on
-- market.group_sessions writes every change to market.session_changes (append-only, so no change
-- can skip the log) and, in the same transaction, one in-app notification per parent and per
-- student whose live enrolment covers the session (push comes later). Students and parents read
-- the sessions and changes of what they are enrolled in; nobody else's.

-- ── A one-off hall for one session; NULL = the booking's hall ─────────────────
ALTER TABLE market.group_sessions ADD COLUMN room_id uuid REFERENCES market.rooms (id);

-- The hall a session is in: its own override, else its booking's hall.
CREATE FUNCTION market.session_room(s market.group_sessions) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT COALESCE(s.room_id, (SELECT b.room_id FROM market.groups g
                              JOIN market.room_bookings b ON b.id = g.room_booking_id WHERE g.id = s.group_id))
$$;

-- A moved session or a hall change: the hall is the centre's own, and nothing else is in it then.
CREATE FUNCTION market.guard_session_hall() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE room uuid; clash uuid;
BEGIN
  IF NEW.status <> 'scheduled' THEN RETURN NEW; END IF;
  IF NEW.starts_at = OLD.starts_at AND NEW.ends_at = OLD.ends_at
     AND NEW.room_id IS NOT DISTINCT FROM OLD.room_id THEN RETURN NEW; END IF;
  IF NEW.room_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM market.rooms r WHERE r.id = NEW.room_id AND r.centre_id = NEW.centre_id AND r.archived_at IS NULL) THEN
    RAISE EXCEPTION 'hall % is not a hall of this centre', NEW.room_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'hall_not_of_centre';
  END IF;
  room := market.session_room(NEW);
  SELECT s.id INTO clash FROM market.group_sessions s
  WHERE s.id <> NEW.id AND s.centre_id = NEW.centre_id AND s.status = 'scheduled'
    AND tstzrange(s.starts_at, s.ends_at) && tstzrange(NEW.starts_at, NEW.ends_at)
    AND market.session_room(s) = room
  LIMIT 1;
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'the hall is taken then (session %)', clash
      USING ERRCODE = 'check_violation', CONSTRAINT = 'hall_taken';
  END IF;
  RETURN NEW;
END
$$;
-- Updates only: new sessions come from bookings, which never overlap (INV-06).
CREATE TRIGGER group_sessions_hall BEFORE UPDATE OF starts_at, ends_at, room_id ON market.group_sessions
  FOR EACH ROW EXECUTE FUNCTION market.guard_session_hall();

-- ── The change log ────────────────────────────────────────────────────────────
CREATE TABLE market.session_changes (
  id               uuid PRIMARY KEY,
  group_session_id uuid NOT NULL REFERENCES market.group_sessions (id),
  group_id         uuid NOT NULL REFERENCES market.groups (id),
  centre_id        uuid NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('moved', 'cancelled', 'room_changed')),
  old_starts_at    timestamptz NOT NULL,
  old_ends_at      timestamptz NOT NULL,
  new_starts_at    timestamptz NOT NULL,
  new_ends_at      timestamptz NOT NULL,
  old_room_id      uuid,
  new_room_id      uuid,
  reason           text CHECK (char_length(reason) <= 300),
  changed_by       uuid,                                   -- NULL = the system
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'cancelled' OR reason IS NOT NULL)
);
CREATE INDEX session_changes_session ON market.session_changes (group_session_id, created_at);
CREATE INDEX session_changes_group ON market.session_changes (group_id, created_at);
CREATE TRIGGER session_changes_append_only BEFORE UPDATE OR DELETE ON market.session_changes
  FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

-- ── In-app notifications (one row per person per event) ───────────────────────
CREATE TABLE messaging.in_app_notifications (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL,                     -- → identity.users
  kind        text NOT NULL CHECK (kind IN ('session_moved', 'session_cancelled', 'session_room_changed',
                'makeup_requested', 'makeup_decided', 'note_approved', 'homework_set')),
  object_type text NOT NULL CHECK (char_length(object_type) BETWEEN 1 AND 40),
  object_id   uuid NOT NULL,
  student_id  uuid,                              -- which child (for a parent)
  group_id    uuid,
  centre_id   uuid,
  event_id    uuid NOT NULL,                     -- the change that caused it
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id, kind)               -- once per person, even on a retry
);
CREATE INDEX in_app_notifications_user ON messaging.in_app_notifications (user_id, created_at DESC);

-- People to tell about a session: the parent and the student account of every live enrolment
-- that covers it. No text is stored: the app renders it from the IDs in the reader's language.
CREATE FUNCTION market.notify_session(p_session uuid, p_kind text, p_event uuid, p_object_type text, p_object uuid)
  RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  INSERT INTO messaging.in_app_notifications (id, user_id, kind, object_type, object_id, student_id, group_id, centre_id, event_id)
  SELECT platform.uuidv7(), who.user_id, p_kind, p_object_type, p_object, who.student_id, s.group_id, s.centre_id, p_event
  FROM market.group_sessions s
  JOIN market.enrolments e ON e.group_id = s.group_id
   AND e.status IN ('confirmed', 'awaiting_teacher', 'past_due')
   AND market.covers(e, s.id, market.session_day(s.starts_at))
  CROSS JOIN LATERAL (
    SELECT g.user_id, e.student_id FROM org.guardians g WHERE g.id = e.guardian_id AND g.user_id IS NOT NULL
    UNION
    SELECT sa.user_id, e.student_id FROM identity.student_accounts sa
    WHERE sa.student_id = e.student_id AND sa.status <> 'closed'
  ) who
  WHERE s.id = p_session
  ON CONFLICT DO NOTHING
$$;

-- Moved, hall changed, cancelled: one log row per kind of change, and its notifications.
-- Who changed it: app.actor_id (set by core-api before the update), else status_changed_by.
CREATE FUNCTION market.log_session_change() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  actor uuid := COALESCE(NULLIF(current_setting('app.actor_id', true), '')::uuid, NEW.status_changed_by);
  why text := NULLIF(current_setting('app.change_reason', true), '');
  k text; id uuid;
BEGIN
  FOREACH k IN ARRAY ARRAY['moved', 'room_changed', 'cancelled'] LOOP
    CONTINUE WHEN k = 'moved' AND NEW.starts_at = OLD.starts_at AND NEW.ends_at = OLD.ends_at;
    CONTINUE WHEN k = 'room_changed' AND NEW.room_id IS NOT DISTINCT FROM OLD.room_id;
    CONTINUE WHEN k = 'cancelled' AND NOT (NEW.status = 'cancelled' AND OLD.status <> 'cancelled');
    id := platform.uuidv7();
    INSERT INTO market.session_changes (id, group_session_id, group_id, centre_id, kind, old_starts_at, old_ends_at,
      new_starts_at, new_ends_at, old_room_id, new_room_id, reason, changed_by)
    VALUES (id, NEW.id, NEW.group_id, NEW.centre_id, k, OLD.starts_at, OLD.ends_at, NEW.starts_at, NEW.ends_at,
      market.session_room(OLD), market.session_room(NEW),
      CASE WHEN k = 'cancelled' THEN COALESCE(NEW.status_reason, why) ELSE why END, actor);
    PERFORM market.notify_session(NEW.id, 'session_' || k, id, 'session_change', id);
  END LOOP;
  RETURN NEW;
END
$$;
CREATE TRIGGER group_sessions_change_log AFTER UPDATE OF starts_at, ends_at, room_id, status ON market.group_sessions
  FOR EACH ROW EXECUTE FUNCTION market.log_session_change();

-- ── What a student is enrolled in ─────────────────────────────────────────────
-- The sessions the caller's own student account covers (live or ended enrolments). SECURITY
-- DEFINER, so a student never reads enrolment rows (prices, payment plans) to get here.
CREATE FUNCTION market.my_student_sessions() RETURNS TABLE (session_id uuid, group_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT s.id, s.group_id
  FROM market.enrolments e
  JOIN market.group_sessions s ON s.group_id = e.group_id
  WHERE e.student_id = platform.ctx_student_id()
    AND e.status IN ('confirmed', 'awaiting_teacher', 'past_due', 'ended')
    AND market.covers(e, s.id, market.session_day(s.starts_at))
$$;
REVOKE ALL ON FUNCTION market.my_student_sessions(), market.notify_session(uuid, text, uuid, text, uuid),
  market.session_room(market.group_sessions) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION market.my_student_sessions(), market.session_room(market.group_sessions) TO app_user, app_worker, app_ops;
GRANT EXECUTE ON FUNCTION market.notify_session(uuid, text, uuid, text, uuid) TO app_worker;

CREATE POLICY gs_student ON market.group_sessions FOR SELECT TO app_user
  USING (id IN (SELECT session_id FROM market.my_student_sessions()));
CREATE POLICY groups_student ON market.groups FOR SELECT TO app_user
  USING (id IN (SELECT group_id FROM market.my_student_sessions()));

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE market.session_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY sc_student ON market.session_changes FOR SELECT TO app_user
  USING (group_session_id IN (SELECT session_id FROM market.my_student_sessions()));
CREATE POLICY sc_guardian ON market.session_changes FOR SELECT TO app_user
  USING (group_id IN (SELECT e.group_id FROM market.enrolments e WHERE e.guardian_id = platform.ctx_guardian_id()));
CREATE POLICY sc_teacher ON market.session_changes FOR SELECT TO app_user
  USING (group_id IN (SELECT g.id FROM market.groups g WHERE g.teacher_id = platform.ctx_teacher_id()));
CREATE POLICY sc_centre ON market.session_changes FOR SELECT TO app_user USING (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY sc_system ON market.session_changes TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY sc_ops ON market.session_changes FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT ON market.session_changes TO app_user, app_ops;
GRANT SELECT, INSERT ON market.session_changes TO app_worker;

ALTER TABLE messaging.in_app_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY ian_self ON messaging.in_app_notifications TO app_user
  USING (user_id = platform.ctx_user_id()) WITH CHECK (user_id = platform.ctx_user_id());
CREATE POLICY ian_system ON messaging.in_app_notifications TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT, UPDATE (read_at) ON messaging.in_app_notifications TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON messaging.in_app_notifications TO app_worker;   -- retention: 90 days

-- migrate:down
DROP POLICY groups_student ON market.groups;
DROP POLICY gs_student ON market.group_sessions;
DROP TRIGGER group_sessions_change_log ON market.group_sessions;
DROP FUNCTION market.log_session_change();
DROP FUNCTION market.notify_session(uuid, text, uuid, text, uuid);
DROP TABLE messaging.in_app_notifications;
DROP TABLE market.session_changes;
DROP FUNCTION market.my_student_sessions();
DROP TRIGGER group_sessions_hall ON market.group_sessions;
DROP FUNCTION market.guard_session_hall();
DROP FUNCTION market.session_room(market.group_sessions);
ALTER TABLE market.group_sessions DROP COLUMN room_id;
