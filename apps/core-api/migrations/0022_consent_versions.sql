-- migrate:up
-- Database v2, group A: consent per person and per child, with versions (docs/10 §3). The register
-- of consent texts: every label in use, whether the text is approved (OD-60) and a hash of the
-- exact text shown. core-api registers the labels of its consent pack at start-up
-- (identity/consent-pack.ts; labels are configurable, CONSENT_VERSIONS), so it is not a foreign key.
-- New consent kind `student_account`: the guardian agrees that this child gets a student account.
CREATE TABLE org.consent_versions (
  kind         text NOT NULL CHECK (char_length(kind) BETWEEN 1 AND 40),
  version      text NOT NULL CHECK (char_length(version) BETWEEN 1 AND 40),
  text_sha256  bytea CHECK (length(text_sha256) = 32),
  approved     boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT now(),
  retired_at   timestamptz,
  PRIMARY KEY (kind, version)
);
INSERT INTO org.consent_versions (kind, version, approved)
SELECT DISTINCT kind, version, false FROM org.consent_events ON CONFLICT DO NOTHING;

ALTER TABLE org.consent_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY cv_read ON org.consent_versions FOR SELECT TO app_user USING (true);   -- public texts
CREATE POLICY cv_system ON org.consent_versions TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY cv_ops ON org.consent_versions TO app_ops
  USING (platform.ctx_is_ops()) WITH CHECK (platform.ctx_is_ops());
GRANT SELECT ON org.consent_versions TO app_user;
GRANT SELECT, INSERT, UPDATE ON org.consent_versions TO app_worker, app_ops;

ALTER TABLE org.consent_events
  DROP CONSTRAINT consent_events_kind_check,
  ADD CONSTRAINT consent_events_kind_check CHECK (kind IN ('terms', 'privacy', 'child_data_processing',
    'share_phone_with_teacher', 'whatsapp_updates', 'sms_updates', 'focus_plans', 'ai_training_use',
    'student_account')),
  DROP CONSTRAINT consent_events_source_check,
  ADD CONSTRAINT consent_events_source_check CHECK (source IN ('signup', 'add_child', 'checkout', 'settings',
    'whatsapp_stop', 'import', 'ops', 'student_account'));

-- migrate:down
-- Local only: the sample `student_account` rows go first (consent events are append-only, so the
-- trigger is paused inside this transaction), then the old checks come back.
ALTER TABLE org.consent_events DISABLE TRIGGER consent_events_append_only;
DELETE FROM org.consent_events WHERE kind = 'student_account' OR source = 'student_account';
ALTER TABLE org.consent_events ENABLE TRIGGER consent_events_append_only;
ALTER TABLE org.consent_events
  DROP CONSTRAINT consent_events_source_check,
  ADD CONSTRAINT consent_events_source_check CHECK (source IN ('signup', 'add_child', 'checkout', 'settings',
    'whatsapp_stop', 'import', 'ops')),
  DROP CONSTRAINT consent_events_kind_check,
  ADD CONSTRAINT consent_events_kind_check CHECK (kind IN ('terms', 'privacy', 'child_data_processing',
    'share_phone_with_teacher', 'whatsapp_updates', 'sms_updates', 'focus_plans', 'ai_training_use'));
DROP TABLE org.consent_versions;
