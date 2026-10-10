-- migrate:up
-- Ship job S2: the ops console (MKT-OPS-01..04, -08, -09) and data-subject requests (PDPL, 10 §3).
-- Ops requests run as app_ops with `link_ops` in app.roles (platform.ctx_is_ops()); core-api checks
-- the permission (ops.verify / ops.moderate / ops.finance, OD-37) before it opens the transaction.
-- Money paths (refund approval) stay SYSTEM, like every other ledger write.

-- ── L01 pipeline (MKT-OPS-01 AC1): New → Call scheduled → Visit booked → Live | Rejected ──────
-- Live and Rejected are the centre's `verification`; the two steps before it are this column.
ALTER TABLE org.centres
  ADD COLUMN ops_stage text NOT NULL DEFAULT 'new' CHECK (ops_stage IN ('new', 'call_scheduled', 'visit_booked'));
GRANT UPDATE (ops_stage, verification, verified_at, location_status) ON org.centres TO app_ops;
GRANT UPDATE (verification, verified_at) ON org.teachers TO app_ops;

-- ── Internal notes (MKT-OPS-01 AC3): ops only, append-only ───────────────────────────────────
CREATE TABLE org.ops_notes (
  id           uuid PRIMARY KEY,
  subject_type text NOT NULL CHECK (subject_type IN ('centre', 'teacher', 'lead', 'refund', 'review', 'data_request')),
  subject_id   uuid NOT NULL,
  author_id    uuid NOT NULL,                  -- → identity.users (a link_ops user)
  body         text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ops_notes_subject ON org.ops_notes (subject_type, subject_id, created_at);
CREATE TRIGGER ops_notes_append_only BEFORE UPDATE OR DELETE ON org.ops_notes
  FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
ALTER TABLE org.ops_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_notes_ops ON org.ops_notes TO app_ops
  USING (platform.ctx_is_ops()) WITH CHECK (platform.ctx_is_ops() AND author_id = platform.ctx_user_id());
GRANT SELECT, INSERT ON org.ops_notes TO app_ops;

-- ── Data-subject requests (MKT-OPS-09, BR-DAT, PDPL Law 151/2020) ─────────────────────────────
-- A person asks for a copy of their data, a correction or deletion (POST /v1/me/data-requests);
-- ops complete it and record what was exported, corrected or anonymised.
CREATE TABLE identity.data_requests (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL,                  -- → identity.users: who asked (about themselves)
  kind         text NOT NULL CHECK (kind IN ('access', 'correction', 'deletion')),
  details      text NOT NULL DEFAULT '' CHECK (char_length(details) <= 2000),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'rejected')),
  outcome      text CHECK (outcome IS NULL OR char_length(outcome) <= 2000),
  completed_by uuid,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'open') = (completed_at IS NULL))
);
-- One open request of each kind per person (a second click is the same request).
CREATE UNIQUE INDEX data_requests_one_open ON identity.data_requests (user_id, kind) WHERE status = 'open';
CREATE INDEX data_requests_status ON identity.data_requests (status, created_at);
CREATE TRIGGER data_requests_touch BEFORE UPDATE ON identity.data_requests
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
ALTER TABLE identity.data_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY dr_self ON identity.data_requests TO app_user
  USING (user_id = platform.ctx_user_id()) WITH CHECK (user_id = platform.ctx_user_id() AND status = 'open');
CREATE POLICY dr_ops ON identity.data_requests TO app_ops USING (platform.ctx_is_ops()) WITH CHECK (platform.ctx_is_ops());
CREATE POLICY dr_system ON identity.data_requests FOR SELECT TO app_worker USING (true);
GRANT SELECT, INSERT ON identity.data_requests TO app_user;
GRANT SELECT, UPDATE (status, outcome, completed_by, completed_at) ON identity.data_requests TO app_ops;
GRANT SELECT ON identity.data_requests TO app_worker;

-- ── What an ops decision writes in its own transaction ────────────────────────────────────────
-- The audit row (MKT-OPS-08 AC2) and the event (outbox), like any request.
CREATE POLICY audit_insert_ops ON audit.audit_events FOR INSERT TO app_ops WITH CHECK (platform.ctx_is_ops());
GRANT INSERT ON audit.audit_events TO app_ops;
GRANT INSERT ON platform.outbox_events TO app_ops;
-- L02: ops decide a review (publish, hide, ask for an edit) and close its reports (BR-REV-05).
CREATE POLICY rv_ops_decide ON market.reviews FOR UPDATE TO app_ops
  USING (platform.ctx_is_ops()) WITH CHECK (platform.ctx_is_ops());

-- migrate:down
DROP POLICY rv_ops_decide ON market.reviews;
REVOKE INSERT ON platform.outbox_events FROM app_ops;
REVOKE INSERT ON audit.audit_events FROM app_ops;
DROP POLICY audit_insert_ops ON audit.audit_events;
DROP TABLE identity.data_requests;
DROP TABLE org.ops_notes;
REVOKE UPDATE (ops_stage, location_status) ON org.centres FROM app_ops;
ALTER TABLE org.centres DROP COLUMN ops_stage;
