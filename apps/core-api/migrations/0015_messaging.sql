-- migrate:up
-- R3 parent messages (docs/06 §8, FUP-MSG): drafted only from confirmed facts, approved by staff
-- with `messages.approve` and the "I checked" tick (BR-APR-02), locked after approval, and moved
-- only by provider events (BR-APR-11): no message is queued or sent without `approved_by`
-- (INV-11). Inbound replies (STOP takes effect at once, BR-DAT-02) and the notification log.

CREATE TABLE messaging.messages (
  id                  uuid PRIMARY KEY,
  centre_id           uuid NOT NULL,
  case_id             uuid,                              -- → followup.cases
  focus_plan_id       uuid,                              -- Phase 3
  group_id            uuid,                              -- (added) the case's group, for TEACHER RLS
  guardian_id         uuid NOT NULL,
  student_id          uuid NOT NULL,
  purpose             text NOT NULL CHECK (purpose IN ('attendance_followup', 'score_followup', 'participation_followup', 'concern_followup')),
  draft               text NOT NULL CHECK (char_length(draft) <= 2000),
  final_text          text CHECK (char_length(final_text) <= 2000),
  tone                text NOT NULL DEFAULT 'warm' CHECK (tone IN ('warm', 'neutral', 'formal')),
  grounded_facts      jsonb NOT NULL DEFAULT '[]'::jsonb, -- record references the draft used
  template_code       text,
  language            text NOT NULL DEFAULT 'ar' CHECK (language IN ('ar', 'en')),
  channel             text CHECK (channel IN ('whatsapp', 'sms')),
  created_by          uuid NOT NULL,
  approved_by         uuid,
  approved_at         timestamptz,
  delivery_status     text NOT NULL DEFAULT 'draft'
    CHECK (delivery_status IN ('draft', 'approved', 'queued', 'sent', 'delivered', 'read', 'failed', 'not_sendable')),
  provider            text,
  provider_message_id text UNIQUE,
  failure_reason      text,
  reply               text,                              -- latest reply summary
  reply_intent        text,
  sent_manually_by    uuid,                              -- pilot / manual path (OD-56): an attempt, not a delivery
  sent_manually_at    timestamptz,
  revises_id          uuid REFERENCES messaging.messages (id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- INV-11: no message leaves without approval.
  CONSTRAINT messages_approved_before_send
    CHECK (delivery_status IN ('draft', 'not_sendable') OR (approved_by IS NOT NULL AND final_text IS NOT NULL)),
  CHECK ((sent_manually_by IS NULL) = (sent_manually_at IS NULL))
);
CREATE INDEX messages_centre ON messaging.messages (centre_id, created_at);
CREATE INDEX messages_case ON messaging.messages (case_id);
CREATE INDEX messages_guardian ON messaging.messages (guardian_id, delivery_status);
CREATE TRIGGER messages_touch BEFORE UPDATE ON messaging.messages FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- FUP-MSG-02 AC3: the approved text, its approver and its student/guardian never change.
CREATE FUNCTION messaging.lock_approved() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.approved_by IS NOT NULL AND (
       NEW.final_text IS DISTINCT FROM OLD.final_text OR NEW.draft IS DISTINCT FROM OLD.draft
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.guardian_id <> OLD.guardian_id OR NEW.student_id <> OLD.student_id OR NEW.tone <> OLD.tone) THEN
    RAISE EXCEPTION 'an approved message is locked'
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'message_locked';
  END IF;
  IF OLD.delivery_status <> 'draft' AND NEW.delivery_status = 'draft' THEN
    RAISE EXCEPTION 'an approved message never returns to draft'
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'message_locked';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER messages_lock BEFORE UPDATE ON messaging.messages FOR EACH ROW EXECUTE FUNCTION messaging.lock_approved();

-- (added) Status history, one row per change; provider events are deduplicated on their ID.
CREATE TABLE messaging.message_status_events (
  id                uuid PRIMARY KEY,
  message_id        uuid NOT NULL REFERENCES messaging.messages (id),
  centre_id         uuid NOT NULL,
  status            text NOT NULL CHECK (status IN ('draft', 'approved', 'queued', 'sent', 'delivered', 'read', 'failed', 'not_sendable')),
  provider_event_id text UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX message_status_events_message ON messaging.message_status_events (message_id, created_at);
CREATE TRIGGER message_status_events_append_only BEFORE UPDATE OR DELETE ON messaging.message_status_events
  FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

CREATE TABLE messaging.inbound_messages (
  id                  uuid PRIMARY KEY,
  centre_id           uuid NOT NULL,
  guardian_id         uuid NOT NULL,
  message_id          uuid REFERENCES messaging.messages (id),
  channel             text NOT NULL CHECK (channel IN ('whatsapp', 'sms')),
  body                text NOT NULL CHECK (char_length(body) <= 4000),   -- [PII]
  intent              text,
  summary             text,
  is_stop             boolean NOT NULL DEFAULT false,
  provider_message_id text NOT NULL UNIQUE,
  received_at         timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inbound_messages_message ON messaging.inbound_messages (message_id, received_at);

CREATE TABLE messaging.notification_log (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL,
  channel       text NOT NULL CHECK (channel IN ('sms', 'push', 'email', 'whatsapp')),
  template_code text NOT NULL,
  event_id      uuid NOT NULL,
  status        text NOT NULL,
  provider_ref  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id, channel)
);

ALTER TABLE messaging.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY ms_centre ON messaging.messages FOR SELECT TO app_user USING (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY ms_teacher ON messaging.messages FOR SELECT TO app_user
  USING (group_id IN (SELECT g.id FROM market.groups g WHERE g.teacher_id = platform.ctx_teacher_id()));
-- A parent reads only what staff approved and handed to the provider, for their own children.
CREATE POLICY ms_guardian ON messaging.messages FOR SELECT TO app_user
  USING (guardian_id = platform.ctx_guardian_id() AND delivery_status IN ('queued', 'sent', 'delivered', 'read'));
CREATE POLICY ms_system ON messaging.messages TO app_worker USING (true) WITH CHECK (true);
ALTER TABLE messaging.message_status_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY mse_read ON messaging.message_status_events FOR SELECT TO app_user
  USING (message_id IN (SELECT id FROM messaging.messages));
CREATE POLICY mse_system ON messaging.message_status_events TO app_worker USING (true) WITH CHECK (true);
ALTER TABLE messaging.inbound_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY im_centre ON messaging.inbound_messages FOR SELECT TO app_user USING (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY im_system ON messaging.inbound_messages TO app_worker USING (true) WITH CHECK (true);
ALTER TABLE messaging.notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY nl_self ON messaging.notification_log FOR SELECT TO app_user USING (user_id = platform.ctx_user_id());
CREATE POLICY nl_system ON messaging.notification_log TO app_worker USING (true) WITH CHECK (true);

GRANT SELECT ON messaging.messages, messaging.message_status_events, messaging.inbound_messages,
  messaging.notification_log TO app_user, app_ops;
GRANT SELECT, INSERT, UPDATE ON messaging.messages, messaging.notification_log TO app_worker;
GRANT SELECT, INSERT ON messaging.message_status_events, messaging.inbound_messages TO app_worker;

-- migrate:down
DROP TABLE IF EXISTS messaging.notification_log;
DROP TABLE IF EXISTS messaging.inbound_messages;
DROP TABLE IF EXISTS messaging.message_status_events;
DROP TABLE IF EXISTS messaging.messages;
DROP FUNCTION IF EXISTS messaging.lock_approved();
