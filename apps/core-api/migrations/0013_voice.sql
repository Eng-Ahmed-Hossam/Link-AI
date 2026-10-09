-- migrate:up
-- R3 voice notes (docs/06 §6, FUP-VOI, docs/09): the audio is an object in encrypted storage
-- (aws-local S3 locally, SSE), referenced by key only. The transcript is a receipt for the teacher
-- (BR-APR-05): never shown to parents, never used in analytics. Audio is deleted 30 days after
-- upload (BR-DAT-04) and the transcript after 90 days (OD-28) by the worker's retention job.
-- `data_class` is set on upload: `consented_real` audio never reaches a provider that is not local
-- (ADR-0007, OD-51). Proposals are drafts: nothing becomes a record until the teacher confirms.

CREATE TABLE records.voice_notes (
  id                      uuid PRIMARY KEY,
  session_record_id       uuid NOT NULL REFERENCES records.session_records (id),
  centre_id               uuid NOT NULL,
  teacher_id              uuid NOT NULL,                   -- the author (TEACHER RLS)
  created_by              uuid NOT NULL,
  idempotency_key         text UNIQUE,                     -- the device's queue ID (FUP-VOI-01 AC4)
  audio_key               text,                            -- object key; NULL once deleted
  audio_mime              text,
  audio_bytes             int CHECK (audio_bytes > 0),
  duration_s              int NOT NULL CHECK (duration_s BETWEEN 1 AND 900),
  transcript              text,                            -- receipt only (BR-APR-05)
  status                  text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'uploaded', 'transcribing', 'extracting', 'ready', 'failed', 'audio_deleted')),
  failure_code            text,
  eta_seconds             int,
  uploaded_at             timestamptz,
  submitted_at            timestamptz,                     -- handed to ai-service
  delete_after            timestamptz,                     -- uploaded_at + 30 days (BR-DAT-04)
  transcript_delete_after timestamptz,                     -- uploaded_at + 90 days (OD-28)
  stt_provider            text,
  model_version           text,
  data_class              text NOT NULL CHECK (data_class IN ('synthetic', 'consented_real')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX voice_notes_record ON records.voice_notes (session_record_id);
CREATE INDEX voice_notes_retention ON records.voice_notes (delete_after) WHERE status <> 'audio_deleted';
CREATE TRIGGER voice_notes_touch BEFORE UPDATE ON records.voice_notes FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE records.voice_extractions (
  id            uuid PRIMARY KEY,
  voice_note_id uuid NOT NULL UNIQUE REFERENCES records.voice_notes (id),
  centre_id     uuid NOT NULL,
  proposal      jsonb,                                     -- ai-service's items (docs/09 schema); NULL until ready
  model_version text,
  -- itemId → the student the teacher chose (T07, FUP-VOI-04: never guessed)
  resolved      jsonb NOT NULL DEFAULT '{}'::jsonb,
  discarded     text[] NOT NULL DEFAULT '{}',              -- items the teacher dropped: never saved
  status        text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'clarification_needed', 'accepted', 'superseded')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER voice_extractions_touch BEFORE UPDATE ON records.voice_extractions
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

ALTER TABLE records.voice_notes ENABLE ROW LEVEL SECURITY;
-- The author reads their notes; the centre's owner and staff see that a note exists (the API
-- never returns its audio or transcript to them).
CREATE POLICY vn_teacher ON records.voice_notes FOR SELECT TO app_user USING (teacher_id = platform.ctx_teacher_id());
CREATE POLICY vn_centre ON records.voice_notes FOR SELECT TO app_user USING (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY vn_system ON records.voice_notes TO app_worker USING (true) WITH CHECK (true);
ALTER TABLE records.voice_extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY vx_teacher ON records.voice_extractions FOR SELECT TO app_user
  USING (voice_note_id IN (SELECT id FROM records.voice_notes WHERE teacher_id = platform.ctx_teacher_id()));
CREATE POLICY vx_system ON records.voice_extractions TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT ON records.voice_notes, records.voice_extractions TO app_user;
GRANT SELECT, INSERT, UPDATE ON records.voice_notes, records.voice_extractions TO app_worker;

-- migrate:down
DROP TABLE IF EXISTS records.voice_extractions;
DROP TABLE IF EXISTS records.voice_notes;
