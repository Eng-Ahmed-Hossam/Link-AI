-- migrate:up
-- R3 follow-up (docs/06 §7, FUP-RUL, FUP-CAS): rules with versions (staff propose, the owner
-- approves — BR-APR-12), signals (one open flag per rule, student, group and topic — INV-08),
-- cases with their timeline, and contact attempts (append-only; an attempt is not a resolution,
-- BR-APR-10). Only the followup module evaluates these rules (FUP-RUL-03); it writes as the system.

CREATE TABLE followup.rules (
  id                    uuid PRIMARY KEY,
  centre_id             uuid NOT NULL,
  teacher_id            uuid,                            -- teacher-level subscribers (OD-34); NULL for a centre rule
  code                  text NOT NULL CHECK (code IN ('consecutive_absences', 'score_decline', 'low_participation',
                                                      'repeated_concern', 'score_decline_class_adjusted')),
  evaluated_by          text NOT NULL DEFAULT 'followup' CHECK (evaluated_by IN ('followup', 'trend_worker')),
  definition            jsonb NOT NULL,                  -- {params, scope}: the version in force
  active                boolean NOT NULL,
  current_version       int NOT NULL CHECK (current_version >= 1),
  default_assignee_role text NOT NULL DEFAULT 'reception' CHECK (default_assignee_role IN ('reception', 'owner')),
  due_in_days           int NOT NULL DEFAULT 0 CHECK (due_in_days BETWEEN 0 AND 30),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK ((code = 'score_decline_class_adjusted') = (evaluated_by = 'trend_worker'))
);
CREATE UNIQUE INDEX rules_one ON followup.rules (centre_id, teacher_id, code) NULLS NOT DISTINCT;
CREATE TRIGGER rules_touch BEFORE UPDATE ON followup.rules FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE followup.rule_versions (
  id                      uuid PRIMARY KEY,
  rule_id                 uuid NOT NULL REFERENCES followup.rules (id),
  centre_id               uuid NOT NULL,
  version                 int NOT NULL CHECK (version >= 1),
  definition              jsonb NOT NULL,
  active                  boolean NOT NULL,
  explanation_template_en text NOT NULL,
  explanation_template_ar text NOT NULL,
  proposed_by             uuid,
  approved_by             uuid,
  approved_at             timestamptz,
  status                  text NOT NULL CHECK (status IN ('proposed', 'approved', 'rejected', 'superseded')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('approved', 'superseded') OR approved_at IS NOT NULL)
);
-- One row per version number; a rejected proposal frees its number for the next one.
CREATE UNIQUE INDEX rule_versions_one ON followup.rule_versions (rule_id, version) WHERE status <> 'rejected';
CREATE UNIQUE INDEX rule_versions_one_proposal ON followup.rule_versions (rule_id) WHERE status = 'proposed';

CREATE TABLE followup.signals (
  id             uuid PRIMARY KEY,
  rule_id        uuid NOT NULL REFERENCES followup.rules (id),
  rule_code      text NOT NULL,
  rule_version   int NOT NULL,
  student_id     uuid NOT NULL,
  group_id       uuid NOT NULL,
  centre_id      uuid NOT NULL,
  topic_id       uuid,                                   -- Phase 3
  evidence       jsonb NOT NULL,                         -- {recordIds, numbers…} (BR-APR-04)
  params         jsonb NOT NULL,                         -- the rule version's parameters when it fired
  explanation_en text NOT NULL,
  explanation_ar text NOT NULL,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'case_opened', 'dismissed', 'resolved_by_correction')),
  raised_at      timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- INV-08: at most one open flag per rule, student, group and topic (topic NULL before Phase 3).
CREATE UNIQUE INDEX signals_one_open ON followup.signals (rule_id, student_id, group_id, topic_id) NULLS NOT DISTINCT
  WHERE status IN ('open', 'case_opened');
CREATE INDEX signals_student ON followup.signals (student_id, status);
CREATE TRIGGER signals_touch BEFORE UPDATE ON followup.signals FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE followup.cases (
  id             uuid PRIMARY KEY,
  signal_id      uuid NOT NULL UNIQUE REFERENCES followup.signals (id),
  centre_id      uuid NOT NULL,
  student_id     uuid NOT NULL,
  group_id       uuid NOT NULL,                          -- (added) the signal's group, for TEACHER RLS
  assignee_id    uuid NOT NULL,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'awaiting_confirmation', 'resolved', 'dismissed')),
  due_on         date NOT NULL,
  outcome        text,
  dismiss_reason text,
  closed_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'dismissed' OR dismiss_reason IS NOT NULL)
);
CREATE INDEX cases_centre ON followup.cases (centre_id, status, due_on);
CREATE TRIGGER cases_touch BEFORE UPDATE ON followup.cases FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE followup.case_attempts (
  id           uuid PRIMARY KEY,
  case_id      uuid NOT NULL REFERENCES followup.cases (id),
  centre_id    uuid NOT NULL,
  channel      text NOT NULL CHECK (channel IN ('phone', 'whatsapp', 'whatsapp_manual', 'sms', 'meeting')),
  result       text NOT NULL CHECK (result IN ('reached', 'no_answer', 'wrong_number', 'message_sent', 'replied')),
  learned      text CHECK (char_length(learned) <= 1000),
  next_action  text CHECK (char_length(next_action) <= 500),
  follow_up_on date,
  message_id   uuid,
  created_by   uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_attempts_case ON followup.case_attempts (case_id, created_at);
CREATE TRIGGER case_attempts_append_only BEFORE UPDATE OR DELETE ON followup.case_attempts
  FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

-- (added) The case timeline (A03): flag raised, assigned, message drafted / approved, parent
-- replied, seat checked, outcome, dismissed, reopened. Append-only; texts carry no phone numbers.
CREATE TABLE followup.case_events (
  id         uuid PRIMARY KEY,
  case_id    uuid NOT NULL REFERENCES followup.cases (id),
  centre_id  uuid NOT NULL,
  kind       text NOT NULL CHECK (char_length(kind) BETWEEN 1 AND 40),
  text_en    text NOT NULL,
  text_ar    text NOT NULL,
  actor_id   uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_events_case ON followup.case_events (case_id, created_at);
CREATE TRIGGER case_events_append_only BEFORE UPDATE OR DELETE ON followup.case_events
  FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

-- ── RLS: CENTRE reads everything of its centre; the group's teacher reads its own groups' flags.
ALTER TABLE followup.rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY ru_centre ON followup.rules FOR SELECT TO app_user USING (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY ru_teacher ON followup.rules FOR SELECT TO app_user USING (teacher_id = platform.ctx_teacher_id());
CREATE POLICY ru_system ON followup.rules TO app_worker USING (true) WITH CHECK (true);
ALTER TABLE followup.rule_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY rv_centre ON followup.rule_versions FOR SELECT TO app_user USING (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY rv_system ON followup.rule_versions TO app_worker USING (true) WITH CHECK (true);
ALTER TABLE followup.signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY sg_centre ON followup.signals FOR SELECT TO app_user USING (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY sg_teacher ON followup.signals FOR SELECT TO app_user
  USING (group_id IN (SELECT g.id FROM market.groups g WHERE g.teacher_id = platform.ctx_teacher_id()));
CREATE POLICY sg_system ON followup.signals TO app_worker USING (true) WITH CHECK (true);
ALTER TABLE followup.cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY cs_centre ON followup.cases FOR SELECT TO app_user USING (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY cs_teacher ON followup.cases FOR SELECT TO app_user
  USING (group_id IN (SELECT g.id FROM market.groups g WHERE g.teacher_id = platform.ctx_teacher_id()));
CREATE POLICY cs_system ON followup.cases TO app_worker USING (true) WITH CHECK (true);
ALTER TABLE followup.case_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY ca_read ON followup.case_attempts FOR SELECT TO app_user USING (case_id IN (SELECT id FROM followup.cases));
CREATE POLICY ca_system ON followup.case_attempts TO app_worker USING (true) WITH CHECK (true);
ALTER TABLE followup.case_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY ce_read ON followup.case_events FOR SELECT TO app_user USING (case_id IN (SELECT id FROM followup.cases));
CREATE POLICY ce_system ON followup.case_events TO app_worker USING (true) WITH CHECK (true);

GRANT SELECT ON followup.rules, followup.rule_versions, followup.signals, followup.cases,
  followup.case_attempts, followup.case_events TO app_user, app_ops;
GRANT SELECT, INSERT, UPDATE ON followup.rules, followup.rule_versions, followup.signals, followup.cases TO app_worker;
GRANT SELECT, INSERT ON followup.case_attempts, followup.case_events TO app_worker;

-- migrate:down
DROP TABLE IF EXISTS followup.case_events;
DROP TABLE IF EXISTS followup.case_attempts;
DROP TABLE IF EXISTS followup.cases;
DROP TABLE IF EXISTS followup.signals;
DROP TABLE IF EXISTS followup.rule_versions;
DROP TABLE IF EXISTS followup.rules;
