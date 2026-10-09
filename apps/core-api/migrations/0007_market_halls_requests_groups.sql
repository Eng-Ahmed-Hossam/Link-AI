-- migrate:up
-- R2a marketplace (docs/06 §4): open slots, room requests, bookings (no double booking), groups
-- (seat cap ≤ hall), sessions, rating stats, and the PUBLIC views parents and teachers read.
-- Tenant tables carry centre_id and the CENTRE policy; TEACHER policies use app.teacher_id.

-- ── rooms (halls): a sample photo tile until uploads exist ────────────────────
ALTER TABLE market.rooms ADD COLUMN photo smallint NOT NULL DEFAULT 0 CHECK (photo BETWEEN 0 AND 3);

-- ── room_open_slots: the weekly grid a hall offers (C05) ──────────────────────
CREATE TABLE market.room_open_slots (
  id         uuid PRIMARY KEY,
  room_id    uuid NOT NULL REFERENCES market.rooms (id),
  centre_id  uuid NOT NULL,
  weekday    smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time time NOT NULL,
  end_time   time NOT NULL,
  minutes    int4range NOT NULL GENERATED ALWAYS AS (
    int4range((extract(epoch FROM start_time) / 60)::int, (extract(epoch FROM end_time) / 60)::int)) STORED,
  -- false = the owner keeps this slot closed (not offered to teachers).
  listed     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),
  EXCLUDE USING gist (room_id WITH =, weekday WITH =, minutes WITH &&)
);
CREATE INDEX room_open_slots_centre ON market.room_open_slots (centre_id);

-- ── teacher_applications: room requests (J02, J03, C06) ──────────────────────
CREATE TABLE market.teacher_applications (
  id                   uuid PRIMARY KEY,
  teacher_id           uuid NOT NULL,                -- → org.teachers
  centre_id            uuid NOT NULL,
  room_id              uuid NOT NULL REFERENCES market.rooms (id),
  subject_id           uuid NOT NULL,                -- → ref.subjects (one curriculum and year)
  requested_slots      jsonb NOT NULL,               -- [{weekday, start, end}]
  expected_students    int NOT NULL CHECK (expected_students > 0),
  starts_on            date NOT NULL,
  stage                text NOT NULL DEFAULT 'requested'
    CHECK (stage IN ('requested', 'phone_call', 'meeting', 'approved', 'declined', 'withdrawn', 'expired')),
  scheduled_contact_at timestamptz,
  decline_reason       text,
  auto_approved        boolean NOT NULL DEFAULT false,
  room_booking_id      uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (stage <> 'declined' OR decline_reason IS NOT NULL)
);
CREATE INDEX teacher_applications_centre ON market.teacher_applications (centre_id, stage);
CREATE INDEX teacher_applications_teacher ON market.teacher_applications (teacher_id, stage);
CREATE TRIGGER teacher_applications_touch BEFORE UPDATE ON market.teacher_applications
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- ── room_bookings + room_booking_slots: two live bookings never overlap ───────
CREATE TABLE market.room_bookings (
  id             uuid PRIMARY KEY,
  room_id        uuid NOT NULL REFERENCES market.rooms (id),
  centre_id      uuid NOT NULL,
  teacher_id     uuid NOT NULL,
  application_id uuid REFERENCES market.teacher_applications (id),
  weekly_slots   jsonb NOT NULL,                   -- [{weekday, start, end}]
  rent_rule      jsonb NOT NULL,                   -- snapshot at approval
  starts_on      date NOT NULL,
  ends_on        date,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ending', 'ended')),
  ended_by       uuid,
  end_reason     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on > starts_on)
);
CREATE INDEX room_bookings_centre ON market.room_bookings (centre_id);
CREATE INDEX room_bookings_teacher ON market.room_bookings (teacher_id);
CREATE TRIGGER room_bookings_touch BEFORE UPDATE ON market.room_bookings
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
ALTER TABLE market.teacher_applications
  ADD CONSTRAINT teacher_applications_booking FOREIGN KEY (room_booking_id) REFERENCES market.room_bookings (id);

CREATE TABLE market.room_booking_slots (
  booking_id   uuid NOT NULL REFERENCES market.room_bookings (id),
  room_id      uuid NOT NULL,
  centre_id    uuid NOT NULL,
  weekday      smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  minutes      int4range NOT NULL,
  active_dates daterange NOT NULL,
  PRIMARY KEY (booking_id, weekday),
  EXCLUDE USING gist (room_id WITH =, weekday WITH =, minutes WITH &&, active_dates WITH &&)
);

-- ── groups and group_sessions ─────────────────────────────────────────────────
CREATE TABLE market.groups (
  id                       uuid PRIMARY KEY,
  teacher_id               uuid NOT NULL,
  centre_id                uuid NOT NULL,
  room_booking_id          uuid NOT NULL UNIQUE REFERENCES market.room_bookings (id),
  subject_id               uuid NOT NULL,
  curriculum_id            uuid NOT NULL,
  school_year_id           uuid NOT NULL,
  weekdays                 smallint[] NOT NULL,
  start_time               time NOT NULL,
  end_time                 time NOT NULL,
  seat_cap                 int NOT NULL CHECK (seat_cap > 0),
  monthly_fee_pt           bigint NOT NULL CHECK (monthly_fee_pt > 0),
  session_fee_pt           bigint NOT NULL CHECK (session_fee_pt > 0),
  offers_monthly_recurring boolean NOT NULL DEFAULT true,
  status                   text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'closed')),
  starts_on                date NOT NULL,
  closed_at                timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
CREATE INDEX groups_centre ON market.groups (centre_id, status);
CREATE INDEX groups_teacher ON market.groups (teacher_id);
CREATE INDEX groups_search ON market.groups (curriculum_id, school_year_id, subject_id) WHERE status = 'published';
CREATE TRIGGER groups_touch BEFORE UPDATE ON market.groups FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- MKT-GRP-02 / CF-05: a group never has more seats than its hall. (The check against seats already
-- used by enrolments joins this trigger in R2b, with the enrolments table.)
CREATE FUNCTION market.check_seat_cap() RETURNS trigger
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
CREATE TRIGGER groups_seat_cap BEFORE INSERT OR UPDATE OF seat_cap, room_booking_id ON market.groups
  FOR EACH ROW EXECUTE FUNCTION market.check_seat_cap();

CREATE TABLE market.group_sessions (
  id                uuid PRIMARY KEY,
  group_id          uuid NOT NULL REFERENCES market.groups (id),
  centre_id         uuid NOT NULL,
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  status            text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'held', 'cancelled', 'not_held')),
  status_reason     text,
  status_changed_by uuid,
  status_changed_at timestamptz,
  rent_invoice_id   uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, starts_at),
  CHECK (ends_at > starts_at),
  CHECK (status NOT IN ('cancelled', 'not_held') OR status_reason IS NOT NULL)
);
CREATE INDEX group_sessions_centre ON market.group_sessions (centre_id, starts_at);
CREATE INDEX group_sessions_held_job ON market.group_sessions (status, ends_at);

-- ── review_stats: public ratings (derived; reviews themselves arrive in R2b) ──
CREATE TABLE market.review_stats (
  target_type  text NOT NULL CHECK (target_type IN ('centre', 'teacher')),
  target_id    uuid NOT NULL,
  -- Published public reviews by stars: [5, 4, 3, 2, 1].
  distribution int[] NOT NULL DEFAULT '{0,0,0,0,0}' CHECK (cardinality(distribution) = 5),
  tag_counts   jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_type, target_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE market.room_open_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY ros_centre ON market.room_open_slots TO app_user
  USING (centre_id = ANY (platform.ctx_centre_ids())) WITH CHECK (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY ros_system ON market.room_open_slots TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY ros_ops ON market.room_open_slots FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT, INSERT, UPDATE, DELETE ON market.room_open_slots TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON market.room_open_slots TO app_worker;
GRANT SELECT ON market.room_open_slots TO app_ops;

ALTER TABLE market.teacher_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY ta_teacher ON market.teacher_applications TO app_user
  USING (teacher_id = platform.ctx_teacher_id()) WITH CHECK (teacher_id = platform.ctx_teacher_id());
CREATE POLICY ta_centre ON market.teacher_applications TO app_user
  USING (centre_id = ANY (platform.ctx_centre_ids())) WITH CHECK (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY ta_system ON market.teacher_applications TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY ta_ops ON market.teacher_applications FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT, INSERT, UPDATE ON market.teacher_applications TO app_user, app_worker;
GRANT SELECT ON market.teacher_applications TO app_ops;

ALTER TABLE market.room_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY rb_teacher ON market.room_bookings FOR SELECT TO app_user USING (teacher_id = platform.ctx_teacher_id());
-- Bookings are made by the centre's approval (or an auto-approval, which runs as the system).
CREATE POLICY rb_centre ON market.room_bookings TO app_user
  USING (centre_id = ANY (platform.ctx_centre_ids())) WITH CHECK (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY rb_system ON market.room_bookings TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY rb_ops ON market.room_bookings FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT, INSERT, UPDATE ON market.room_bookings TO app_user, app_worker;
GRANT SELECT ON market.room_bookings TO app_ops;

ALTER TABLE market.room_booking_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY rbs_centre ON market.room_booking_slots TO app_user
  USING (centre_id = ANY (platform.ctx_centre_ids())) WITH CHECK (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY rbs_system ON market.room_booking_slots TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON market.room_booking_slots TO app_user, app_worker;

ALTER TABLE market.groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY groups_teacher ON market.groups TO app_user
  USING (teacher_id = platform.ctx_teacher_id()) WITH CHECK (teacher_id = platform.ctx_teacher_id());
CREATE POLICY groups_centre ON market.groups FOR SELECT TO app_user USING (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY groups_system ON market.groups TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY groups_ops ON market.groups FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT, INSERT, UPDATE ON market.groups TO app_user, app_worker;
GRANT SELECT ON market.groups TO app_ops;

ALTER TABLE market.group_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY gs_teacher ON market.group_sessions TO app_user
  USING (group_id IN (SELECT g.id FROM market.groups g WHERE g.teacher_id = platform.ctx_teacher_id()))
  WITH CHECK (group_id IN (SELECT g.id FROM market.groups g WHERE g.teacher_id = platform.ctx_teacher_id()));
CREATE POLICY gs_centre ON market.group_sessions FOR SELECT TO app_user USING (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY gs_system ON market.group_sessions TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY gs_ops ON market.group_sessions FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT, INSERT ON market.group_sessions TO app_user;
GRANT SELECT, INSERT, UPDATE ON market.group_sessions TO app_worker;
GRANT SELECT ON market.group_sessions TO app_ops;

ALTER TABLE market.review_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY rs_read ON market.review_stats FOR SELECT TO app_user USING (true);  -- public ratings
CREATE POLICY rs_system ON market.review_stats TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT ON market.review_stats TO app_user;
GRANT SELECT, INSERT, UPDATE ON market.review_stats TO app_worker;


-- CF-44: an owner's moved pin is under review until Link ops verify it — enforced here, so every
-- path that moves a pin gets it (ops verify by setting `verified` without moving the pin).
CREATE FUNCTION org.location_review() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.location IS DISTINCT FROM OLD.location THEN
    NEW.location_status := 'under_review';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER centres_location_review BEFORE UPDATE OF location ON org.centres
  FOR EACH ROW EXECUTE FUNCTION org.location_review();

-- ── PUBLIC views (docs/06 §0): only public rows and columns ───────────────────
-- Views run as their owner, so they read across tenants; every row they show is public by rule:
-- verified centres (a pending centre from C01 is hidden), active teachers (an invited or
-- incomplete profile is hidden), listed halls, published groups.
CREATE VIEW market.public_centres AS
  SELECT c.id, c.slug, c.name, c.about_en, c.about_ar, c.governorate, c.area, c.address,
         c.location, c.location_status, c.hours, jsonb_array_length(c.photos) AS photo_count
  FROM org.centres c
  WHERE c.verification = 'verified' AND c.archived_at IS NULL;

CREATE VIEW market.public_teachers AS
  SELECT t.id, t.slug, t.display_name, t.bio_en, t.bio_ar, t.years_experience,
         t.verification = 'verified' AS verified, t.open_to_slots
  FROM org.teachers t
  WHERE t.profile_status = 'active';

CREATE VIEW market.public_rooms AS
  SELECT r.id, r.centre_id, r.name, r.capacity, r.facilities, r.rent_rule, r.photo
  FROM market.rooms r JOIN market.public_centres c ON c.id = r.centre_id
  WHERE r.listed AND r.archived_at IS NULL;

CREATE VIEW market.public_room_slots AS
  SELECT s.room_id, s.weekday, s.start_time, s.end_time,
         -- Taken: a live booking of this hall overlaps the slot on that weekday, now or later.
         EXISTS (SELECT 1 FROM market.room_booking_slots b JOIN market.room_bookings rb ON rb.id = b.booking_id
                 WHERE b.room_id = s.room_id AND b.weekday = s.weekday AND b.minutes && s.minutes
                   AND rb.status <> 'ended'
                   AND b.active_dates && daterange((now() AT TIME ZONE 'Africa/Cairo')::date, NULL)) AS taken
  FROM market.room_open_slots s JOIN market.public_rooms r ON r.id = s.room_id
  WHERE s.listed;

CREATE VIEW market.public_groups AS
  SELECT g.id, g.teacher_id, g.centre_id, g.room_booking_id, g.subject_id, g.curriculum_id, g.school_year_id,
         g.weekdays, g.start_time, g.end_time, g.seat_cap, g.monthly_fee_pt, g.session_fee_pt,
         g.offers_monthly_recurring, g.starts_on, b.room_id, r.name AS room_name
  FROM market.groups g
  JOIN market.room_bookings b ON b.id = g.room_booking_id
  JOIN market.rooms r ON r.id = b.room_id
  JOIN market.public_centres c ON c.id = g.centre_id
  JOIN market.public_teachers t ON t.id = g.teacher_id
  WHERE g.status = 'published';

CREATE VIEW market.public_group_sessions AS
  SELECT s.id, s.group_id, s.starts_at, s.ends_at, s.status
  FROM market.group_sessions s JOIN market.public_groups g ON g.id = s.group_id;

-- Centre staff see who asks for their halls (C06) even before that teacher is public; teachers
-- see the centres they deal with. Only the caller's own relations pass.
CREATE VIEW market.teachers_seen_by_centre WITH (security_barrier) AS
  SELECT t.id, t.display_name, t.verification = 'verified' AS verified, t.created_at
  FROM org.teachers t
  WHERE t.id IN (SELECT a.teacher_id FROM market.teacher_applications a WHERE a.centre_id = ANY (platform.ctx_centre_ids())
                 UNION SELECT b.teacher_id FROM market.room_bookings b WHERE b.centre_id = ANY (platform.ctx_centre_ids()));

CREATE VIEW market.centres_seen_by_teacher WITH (security_barrier) AS
  SELECT c.id, c.name, c.area, c.verification
  FROM org.centres c
  WHERE c.id IN (SELECT a.centre_id FROM market.teacher_applications a WHERE a.teacher_id = platform.ctx_teacher_id()
                 UNION SELECT b.centre_id FROM market.room_bookings b WHERE b.teacher_id = platform.ctx_teacher_id());

CREATE VIEW market.rooms_seen_by_teacher WITH (security_barrier) AS
  SELECT r.id, r.centre_id, r.name, r.capacity, r.rent_rule
  FROM market.rooms r
  WHERE r.id IN (SELECT a.room_id FROM market.teacher_applications a WHERE a.teacher_id = platform.ctx_teacher_id()
                 UNION SELECT b.room_id FROM market.room_bookings b WHERE b.teacher_id = platform.ctx_teacher_id());

GRANT SELECT ON market.public_centres, market.public_teachers, market.public_rooms, market.public_room_slots,
  market.public_groups, market.public_group_sessions, market.teachers_seen_by_centre, market.centres_seen_by_teacher,
  market.rooms_seen_by_teacher
  TO app_user, app_worker, app_ops;

-- migrate:down
DROP TRIGGER IF EXISTS centres_location_review ON org.centres;
DROP FUNCTION IF EXISTS org.location_review();
DROP VIEW IF EXISTS market.rooms_seen_by_teacher, market.centres_seen_by_teacher, market.teachers_seen_by_centre, market.public_group_sessions,
  market.public_groups, market.public_room_slots, market.public_rooms, market.public_teachers, market.public_centres;
DROP TABLE market.review_stats;
DROP TABLE market.group_sessions;
DROP TABLE market.groups;
DROP FUNCTION market.check_seat_cap();
DROP TABLE market.room_booking_slots;
ALTER TABLE market.teacher_applications DROP CONSTRAINT teacher_applications_booking;
DROP TABLE market.room_bookings;
DROP TABLE market.teacher_applications;
DROP TABLE market.room_open_slots;
ALTER TABLE market.rooms DROP COLUMN photo;
