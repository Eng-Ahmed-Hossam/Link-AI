-- migrate:up
-- R2b: enrolments (the 8 states of docs/08 §4) and the waitlist (docs/06 §4).
-- Seats are counted per group_session (BR-ENR-02). Checkout holds live only in Redis; this
-- database guards what it stores: committed enrolments + offered waitlist entries ≤ seat_cap in
-- every covered session (INV-05), checked by a trigger that locks the group row.

CREATE SEQUENCE market.enrolment_reference_seq START 20900;

CREATE TABLE market.enrolments (
  id                   uuid PRIMARY KEY,
  -- Human reference shown to the parent (MKT-ENR-06), e.g. LNK-20931. LTR isolate in the UI.
  reference            text NOT NULL UNIQUE DEFAULT 'LNK-' || nextval('market.enrolment_reference_seq'),
  student_id           uuid NOT NULL,              -- → org.students
  guardian_id          uuid NOT NULL,              -- → org.guardians (the payer)
  group_id             uuid NOT NULL REFERENCES market.groups (id),
  centre_id            uuid NOT NULL,              -- tenant
  teacher_id           uuid NOT NULL,              -- copied from the group
  status               text NOT NULL CHECK (status IN ('pending_payment', 'awaiting_teacher', 'confirmed',
                         'past_due', 'cancelled', 'expired', 'declined', 'ended')),
  payment_plan         text NOT NULL CHECK (payment_plan IN ('monthly_recurring', 'single_month', 'per_session')),
  method               text CHECK (method IN ('card', 'fawry', 'wallet')),
  price_pt             bigint NOT NULL CHECK (price_pt > 0),   -- fee snapshot (OD-39)
  first_session_id     uuid NOT NULL REFERENCES market.group_sessions (id),
  session_id           uuid REFERENCES market.group_sessions (id),   -- per_session only
  current_period_start date,                       -- monthly and single-month plans
  current_period_end   date,                       -- exclusive: the same day next month (BR-PMT-04)
  hold_expires_at      timestamptz,
  -- The teacher's reviewEachEnrolment when the parent reserved (07 P-7, OD-08).
  teacher_reviews      boolean NOT NULL DEFAULT false,
  waitlist_entry_id    uuid,
  phone_shared         boolean NOT NULL DEFAULT false,
  consent_event_id     uuid,
  idempotency_key      text UNIQUE,
  plan_cancelled_at    timestamptz,                -- BR-PMT-05: no further renewals
  status_changed_at    timestamptz NOT NULL DEFAULT now(),
  cancelled_at         timestamptz,
  cancel_reason        text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK ((payment_plan = 'per_session') = (session_id IS NOT NULL)),
  CHECK (payment_plan = 'per_session' OR (current_period_start IS NOT NULL AND current_period_end > current_period_start)),
  CHECK (status <> 'pending_payment' OR hold_expires_at IS NOT NULL)
);
-- BR-ENR-08: one live enrolment per student and group.
CREATE UNIQUE INDEX enrolments_one_live ON market.enrolments (student_id, group_id)
  WHERE status IN ('pending_payment', 'awaiting_teacher', 'confirmed', 'past_due');
CREATE INDEX enrolments_group ON market.enrolments (group_id, status);
CREATE INDEX enrolments_guardian ON market.enrolments (guardian_id);
CREATE INDEX enrolments_teacher ON market.enrolments (teacher_id, status);
CREATE INDEX enrolments_hold ON market.enrolments (hold_expires_at) WHERE status = 'pending_payment';
CREATE TRIGGER enrolments_touch BEFORE UPDATE ON market.enrolments FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE market.waitlist_entries (
  id               uuid PRIMARY KEY,
  group_id         uuid NOT NULL REFERENCES market.groups (id),
  centre_id        uuid NOT NULL,
  student_id       uuid NOT NULL,
  guardian_id      uuid NOT NULL,
  status           text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'offered', 'converted', 'expired', 'left')),
  offered_at       timestamptz,
  offer_expires_at timestamptz,                    -- 24 h (OD-23)
  offered_sessions uuid[],                         -- the sessions the offered seat covers
  enrolment_id     uuid REFERENCES market.enrolments (id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'offered' OR (offer_expires_at IS NOT NULL AND cardinality(offered_sessions) > 0))
);
CREATE UNIQUE INDEX waitlist_one_open ON market.waitlist_entries (group_id, student_id) WHERE status IN ('waiting', 'offered');
CREATE INDEX waitlist_line ON market.waitlist_entries (group_id, status, created_at);
CREATE TRIGGER waitlist_touch BEFORE UPDATE ON market.waitlist_entries FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- ── Which sessions an enrolment covers (BR-ENR-13) ─────────────────────────────
-- Monthly and single-month plans: every session of the paid period [start, end). A live recurring
-- plan also covers the next period until its renewal succeeds or fails, so a renewal never finds
-- its own seat taken. A per-session plan: its one session.
CREATE FUNCTION market.session_day(starts_at timestamptz) RETURNS date
  LANGUAGE sql IMMUTABLE AS $$ SELECT (starts_at AT TIME ZONE 'Africa/Cairo')::date $$;

CREATE FUNCTION market.covers(e market.enrolments, s_id uuid, s_day date) RETURNS boolean
  LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN e.payment_plan = 'per_session' THEN e.session_id = s_id
    ELSE s_day >= e.current_period_start
         AND (s_day < e.current_period_end
              OR (e.payment_plan = 'monthly_recurring' AND e.plan_cancelled_at IS NULL
                  AND e.status IN ('confirmed', 'awaiting_teacher', 'past_due')
                  AND s_day < (e.current_period_end + interval '1 month')::date))
  END
$$;

-- Committed seats per session: live enrolments that cover it (counts only, so any caller may ask;
-- "seats left" is public). Holds and offers come on top (08 §4).
CREATE FUNCTION market.seats_committed(p_sessions uuid[]) RETURNS TABLE (session_id uuid, committed int)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT s.id, count(e.id)::int
  FROM market.group_sessions s
  LEFT JOIN market.enrolments e ON e.group_id = s.group_id
   AND e.status IN ('confirmed', 'awaiting_teacher', 'past_due')
   AND market.covers(e, s.id, market.session_day(s.starts_at))
  WHERE s.id = ANY (p_sessions)
  GROUP BY s.id
$$;
-- Offered waitlist entries per session (they count as holds, BR-ENR-10).
CREATE FUNCTION market.seats_offered(p_session uuid) RETURNS int
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT count(*)::int FROM market.waitlist_entries w
  WHERE w.status = 'offered' AND p_session = ANY (w.offered_sessions) AND w.offer_expires_at > now()
$$;

-- INV-05: refuse a change that would put more committed seats than seat_cap in any session.
CREATE FUNCTION market.guard_seats() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE cap int; s record; used int;
BEGIN
  IF TG_TABLE_NAME = 'enrolments' THEN
    IF NEW.status NOT IN ('confirmed', 'awaiting_teacher', 'past_due') THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('confirmed', 'awaiting_teacher', 'past_due')
       AND OLD.current_period_start IS NOT DISTINCT FROM NEW.current_period_start
       AND OLD.current_period_end IS NOT DISTINCT FROM NEW.current_period_end THEN RETURN NEW; END IF;
  ELSE
    IF NEW.status <> 'offered' OR (TG_OP = 'UPDATE' AND OLD.status = 'offered') THEN RETURN NEW; END IF;
  END IF;
  -- One writer per group at a time: concurrent confirms of the last seat queue here.
  SELECT seat_cap INTO cap FROM market.groups WHERE id = NEW.group_id FOR UPDATE;
  FOR s IN SELECT gs.id, gs.starts_at FROM market.group_sessions gs WHERE gs.group_id = NEW.group_id
             AND gs.starts_at > now() - interval '1 day' LOOP
    IF TG_TABLE_NAME = 'enrolments' THEN
      CONTINUE WHEN NOT market.covers(NEW::market.enrolments, s.id, market.session_day(s.starts_at));
    ELSE
      CONTINUE WHEN NOT (s.id = ANY (NEW.offered_sessions));
    END IF;
    used := (SELECT committed FROM market.seats_committed(ARRAY[s.id])) + market.seats_offered(s.id);
    IF used > cap THEN
      RAISE EXCEPTION 'session % would have % seats used (seat_cap %)', s.id, used, cap
        USING ERRCODE = 'check_violation', CONSTRAINT = 'seat_cap_exceeded';
    END IF;
  END LOOP;
  RETURN NEW;
END
$$;
CREATE CONSTRAINT TRIGGER enrolments_guard_seats AFTER INSERT OR UPDATE ON market.enrolments
  FOR EACH ROW EXECUTE FUNCTION market.guard_seats();
CREATE CONSTRAINT TRIGGER waitlist_guard_seats AFTER INSERT OR UPDATE ON market.waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION market.guard_seats();

-- MKT-GRP-02: the seat cap stays within the hall, and never below the seats already used in a
-- future session (committed enrolments + offered waitlist entries).
CREATE OR REPLACE FUNCTION market.check_seat_cap() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE cap int; most int;
BEGIN
  SELECT r.capacity INTO cap FROM market.room_bookings b JOIN market.rooms r ON r.id = b.room_id
  WHERE b.id = NEW.room_booking_id;
  IF NEW.seat_cap > cap THEN
    RAISE EXCEPTION 'seat_cap % is above the hall capacity %', NEW.seat_cap, cap
      USING ERRCODE = 'check_violation', CONSTRAINT = 'seat_cap_above_hall';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.seat_cap < OLD.seat_cap THEN
    SELECT max(c.committed + market.seats_offered(c.session_id)) INTO most
    FROM market.seats_committed(ARRAY(SELECT s.id FROM market.group_sessions s
                                      WHERE s.group_id = NEW.id AND s.starts_at > now())) c;
    IF coalesce(most, 0) > NEW.seat_cap THEN
      RAISE EXCEPTION 'seat_cap % is below the % seats already taken', NEW.seat_cap, most
        USING ERRCODE = 'check_violation', CONSTRAINT = 'seat_cap_below_taken';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- Teacher and front desk: who enrolled, once paid (BR-ENR-07: name and school year; the guardian's
-- phone only with consent, never shown here). Only the caller's own groups or centres pass.
CREATE VIEW market.enrolment_people WITH (security_barrier) AS
  SELECT e.id AS enrolment_id, e.group_id, e.centre_id, e.teacher_id,
         st.display_name AS student_name, st.school_year_id, u.name AS guardian_name
  FROM market.enrolments e
  JOIN org.students st ON st.id = e.student_id
  JOIN org.guardians g ON g.id = e.guardian_id
  LEFT JOIN identity.users u ON u.id = g.user_id
  WHERE e.status IN ('awaiting_teacher', 'confirmed', 'past_due', 'ended', 'declined')
    AND (e.teacher_id = platform.ctx_teacher_id() OR e.centre_id = ANY (platform.ctx_centre_ids()));
GRANT SELECT ON market.enrolment_people TO app_user, app_worker, app_ops;

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Sessions: everyone reads published groups' sessions through public_group_sessions; a parent
-- also reads the sessions of the groups their children are enrolled in, published or not.
CREATE POLICY gs_guardian ON market.group_sessions FOR SELECT TO app_user
  USING (group_id IN (SELECT e.group_id FROM market.enrolments e WHERE e.guardian_id = platform.ctx_guardian_id()));
-- The same for the group row itself (a closed group still shows on the parent's own enrolment).
CREATE POLICY groups_guardian ON market.groups FOR SELECT TO app_user
  USING (id IN (SELECT e.group_id FROM market.enrolments e WHERE e.guardian_id = platform.ctx_guardian_id()));

ALTER TABLE market.enrolments ENABLE ROW LEVEL SECURITY;
CREATE POLICY enr_guardian ON market.enrolments TO app_user
  USING (guardian_id = platform.ctx_guardian_id() OR student_id IN (SELECT org.my_student_ids()))
  WITH CHECK (guardian_id = platform.ctx_guardian_id() AND student_id IN (SELECT org.my_student_ids()));
CREATE POLICY enr_teacher ON market.enrolments TO app_user
  USING (teacher_id = platform.ctx_teacher_id()) WITH CHECK (teacher_id = platform.ctx_teacher_id());
CREATE POLICY enr_centre ON market.enrolments FOR SELECT TO app_user USING (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY enr_system ON market.enrolments TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY enr_ops ON market.enrolments FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT, INSERT, UPDATE ON market.enrolments TO app_user;
GRANT SELECT, INSERT, UPDATE ON market.enrolments TO app_worker;
GRANT SELECT ON market.enrolments TO app_ops;
GRANT USAGE ON SEQUENCE market.enrolment_reference_seq TO app_user, app_worker;

ALTER TABLE market.waitlist_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY wl_guardian ON market.waitlist_entries TO app_user
  USING (guardian_id = platform.ctx_guardian_id())
  WITH CHECK (guardian_id = platform.ctx_guardian_id() AND student_id IN (SELECT org.my_student_ids()));
CREATE POLICY wl_centre ON market.waitlist_entries FOR SELECT TO app_user USING (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY wl_system ON market.waitlist_entries TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY wl_ops ON market.waitlist_entries FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT, INSERT, UPDATE ON market.waitlist_entries TO app_user;
GRANT SELECT, INSERT, UPDATE ON market.waitlist_entries TO app_worker;
GRANT SELECT ON market.waitlist_entries TO app_ops;

-- migrate:down
DROP POLICY IF EXISTS gs_guardian ON market.group_sessions;
DROP POLICY IF EXISTS groups_guardian ON market.groups;
DROP VIEW IF EXISTS market.enrolment_people;
CREATE OR REPLACE FUNCTION market.check_seat_cap() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE cap int;
BEGIN
  SELECT r.capacity INTO cap FROM market.room_bookings b JOIN market.rooms r ON r.id = b.room_id
  WHERE b.id = NEW.room_booking_id;
  IF NEW.seat_cap > cap THEN
    RAISE EXCEPTION 'seat_cap % is above the hall capacity %', NEW.seat_cap, cap
      USING ERRCODE = 'check_violation', CONSTRAINT = 'seat_cap_above_hall';
  END IF;
  RETURN NEW;
END
$$;
DROP TABLE IF EXISTS market.waitlist_entries;
DROP FUNCTION IF EXISTS market.covers(market.enrolments, uuid, date);
DROP TABLE IF EXISTS market.enrolments;
DROP FUNCTION IF EXISTS market.guard_seats();
DROP FUNCTION IF EXISTS market.seats_committed(uuid[]);
DROP FUNCTION IF EXISTS market.seats_offered(uuid);
DROP FUNCTION IF EXISTS market.session_day(timestamptz);
DROP SEQUENCE IF EXISTS market.enrolment_reference_seq;
