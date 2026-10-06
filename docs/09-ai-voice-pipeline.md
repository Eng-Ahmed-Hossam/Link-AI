# 09 · AI voice pipeline

The teacher speaks Egyptian Arabic after class. Link proposes a draft record. **The teacher confirms it.** Nothing is saved as a record without that confirmation (BR-APR-01).

Diagrams (Eraser): **04** Voice note → parent update, and the ai-service block of **01** System overview. Screens: V01, V02, T07, AN04.

## 1. Principles

| # | Principle |
|---|---|
| AI-01 | **Draft only.** The AI proposes. The teacher confirms. Analytics read only confirmed records. |
| AI-02 | **Never guess a student.** Names are matched against the group roster only. If two students are too close to call, ask the teacher (T07). No person name ever reaches the LLM (§2.4). |
| AI-03 | **Unsure → blank.** A field the AI is not confident about is left empty, never filled with a best guess. |
| AI-04 | **The transcript is a receipt.** It is shown only to the teacher who recorded it, for checking and undo. It is never shown to parents and never used in analytics (BR-APR-05). |
| AI-05 | **Missing ≠ absent.** Students not mentioned stay "not recorded" unless the teacher marks them (V02). |
| AI-06 | **Block, never cap.** A score above the maximum is flagged, not reduced. |
| AI-07 | **Traceable.** Every proposed field keeps the transcript span it came from and the model version. |
| AI-08 | **Measured.** Every release passes the evaluation gates in §6. Every call's cost is recorded per centre. |

## 2. Pipeline

| # | Stage | Where | Input → output |
|---|---|---|---|
| 1 | Capture | Teacher app | Hold-to-record audio → encrypted file in the offline queue |
| 2 | Upload | Teacher app → object storage | `POST /v1/voice-notes` → signed PUT URL (15 min) → upload (SSE-KMS) → `POST /v1/voice-notes/{id}/uploaded` → outbox `voice.uploaded` |
| 3 | Speech-to-text | ai-service → STT vendor (adapter) | Audio + roster names as hints → transcript with word timings and confidence |
| 4 | Clean-up | ai-service | Normalise Arabic; spoken numbers → digits; durations → minutes |
| 5 | Roster name match | ai-service (in-house, no LLM) | Name mentions → `student_id` or "ambiguous" or "unknown" |
| 6 | Extraction | ai-service → LLM (model gateway) | Cleaned transcript with names replaced by tokens → strict-JSON proposal with confidence |
| 7 | Proposal | ai-service → core-api (acting as the teacher) | Stored in `records.voice_extractions`; the session record stays `draft`; `voice.extracted` sent |
| 8 | Teacher review | Teacher app (V02, T07) | Accept / edit each item; resolve identities; choose what to do with unmentioned students |
| 9 | Confirm | core-api | Record confirmed (approval 1) → `record.confirmed` |
| 10 | Learn | core-api | The difference between proposal and confirmed record is stored as labels, with the model version (training use needs consent `ai_training_use`) |
| 11 | Clean-up job | workers | Audio deleted at `delete_after` (30 days); transcript deleted per OD-28 |

### 2.1 Capture and upload
- Audio: mono, 16 kHz, AAC (`.m4a`). Maximum length 5 minutes (configurable). The app shows a timer (V01).
- The offline queue lives in the app sandbox. Files are encrypted with a key held in the device's secure storage. The queue survives restarts and retries with back-off.
- The app generates the `voice_note_id`, so a retried upload never creates a second note.

### 2.2 Speech-to-text
- The vendor is chosen by benchmark on our evaluation set (§6). It sits behind `SttProvider`.
- Hints: the group's roster names (and teacher-added nicknames), subject terms and the assessment name.
- Language: Egyptian Arabic (`ar-EG`), with English subject words mixed in.

### 2.3 Clean-up
- Remove diacritics. Normalise alef forms (أ إ آ → ا), ta marbuta and alef maqsura for matching only. The original text is kept for display.
- Spoken numbers to digits: "اتناشر من عشرين" → `12/20`; "جاب ١٢ من ٢٠" → `12/20`.
- Durations: "ربع ساعة" → 15 minutes; "نص ساعة" → 30 minutes.
- Franco-Arabic and English terms are kept as they are.

### 2.4 Roster name match (never guess)
1. Candidates come **only** from the group's roster for that session (plus teacher-defined nicknames). Never from other groups, never from the open vocabulary.
2. Score each mention against each roster student: normalised Arabic string similarity + phonetic similarity + first-name / full-name rules.
3. **Unique match** only if the top score is ≥ the match threshold **and** beats the second-best by at least the margin (starting values 0.85 and 0.15, tuned on the evaluation set).
4. Otherwise:
   - Two or more close candidates → `ambiguous` → T07 "Check the student". Nothing is saved until the teacher picks one.
   - No candidate above the threshold → `unknown` → shown as "Who is this?". It is never attached to a student automatically.
5. **Every detected person-name span is replaced with a token before extraction** — not only the matched ones:

   | Token | Span | What happens to items on it |
   |---|---|---|
   | `<S1>`, `<S2>` … | Unique roster match | Normal review in V02 |
   | `<A1>`, `<A2>` … | Ambiguous (two or more close roster candidates) | Blocking T07 "Check the student"; never saved to a student until the teacher picks one |
   | `<U1>`, `<U2>` … | Unknown (no roster candidate above the threshold) | Shown as "Who is this?"; never saved to a student |

   Name spans are detected by the roster matcher's candidate search plus a name detector (an Egyptian first-name list and an Arabic person-name tagger). A span that looks like a name but matches nobody still becomes a `<U…>` token. So **no person name reaches the LLM** — not students, not guardians, not teachers. The token map stays in ai-service and is never sent to a vendor.

### 2.5 Extraction
- An LLM call with a **strict JSON schema** (below), temperature 0, through the model gateway.
- Inputs: the cleaned, tokenised transcript (no names, §2.4); the list of tokens (`<S…>`, `<A…>`, `<U…>`); the session context (assessment name and maximum); allowed values.
- Instructions: only facts that were said; `null` for anything not said; no comments about students who were not mentioned; never invent a token.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "VoiceExtraction",
  "type": "object",
  "required": ["items"],
  "additionalProperties": false,
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["student", "field", "value", "confidence", "span"],
        "additionalProperties": false,
        "properties": {
          "student":    { "type": "string", "pattern": "^<[SAU][0-9]+>$" },
          "field":      { "enum": ["attendance", "late_minutes", "score", "participation", "homework", "observation", "observation_tag", "topic"] },
          "value":      { "type": ["string", "number", "null"] },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
          "span":       { "type": "object", "required": ["start", "end"], "properties": { "start": { "type": "integer" }, "end": { "type": "integer" } } }
        }
      }
    },
    "unassigned": { "type": "array", "items": { "type": "string" }, "description": "Statements that could not be tied to one student" }
  }
}
```

Validation after the call (in ai-service, before the proposal is stored):
- The output must parse against the schema. Otherwise retry once, then fall back to "Type the note instead".
- Every token in the output must be one that was sent. Items on `<A…>` tokens go to T07; items on `<U…>` tokens go to "Who is this?". Neither is ever saved to a student without the teacher choosing one (AI-02).
- `attendance ∈ {present, absent, late}`; `participation ∈ {low, normal, high}`; `observation_tag ∈ {understanding, needs_revisit, behaviour, positive, absence_context}`.
- `score` must be between 0 and the assessment maximum. Otherwise keep the value, mark it `out_of_range`, and show it as a blocking error (AI-06).
- `topic` is kept only in Phase 3, and only if it matches a topic in the teacher's topic map (CF-07).

### 2.6 As built for the pilot and the demo (Part B, ADR-0007; `link_nlp` merged 2026-10-05)
- **NLP core:** `py/link_nlp` (Codex track; [docs/ai/link-nlp.md](ai/link-nlp.md)) owns normalisation, roster matching (0.85 / margin 0.15), tokens, rules, the wire schema and `validate_extraction`. ai-service depends on it as a uv path dependency; its own code is the order below, the LLM step, grounding and the proposal.
- **Order** (`apps/ai-service/ai_service/pipeline.py`):
  1. `clean_transcript`;
  2. `find_name_mentions`, with the session roster only;
  3. `tokenise`;
  4. contact redaction: phones and emails masked, length-preserving (a shim until `link_nlp` ships one);
  5. **leak check:** if a roster name, nickname or detected name is still in the text meant for the LLM, the LLM step is skipped, the rule results are kept, and the event is logged without text;
  6. `rule_extract`, itself validated;
  7. the LLM, only for what the rules did not cover;
  8. `validate_extraction`, all-or-nothing; one retry, then rules only;
  9. the merge: **rules win** on attendance, late minutes and scores;
  10. `detokenise_items`;
  11. `confidence_band`;
  12. the proposal.
- **The LLM step:**
  - The model decodes to a per-note subset of the wire schema (`llm_schema`): per-field value types and enums, only the `<S#>`/`<A#>` tokens that were sent, no spans, at most 12 items. Spans are computed locally, then the reply is checked against the full schema.
  - The LLM never fills **participation**: on the gold set its precision was 0.38, against 1.00 for the explicit-phrase rules.
  - It is not offered `<U#>` spans: those produced blocking "Who is this?" items on words that were not people.
- **Grounding:**
  - A score must appear as `N/M`, and late minutes as `N min`, **in that student's clause**.
  - An observation must reuse the teacher's own words.
  - "present" must be said.
  - Two different LLM values for one student and field cancel out.
  - Whole-class lines (`unassigned`) may not contain a token, Latin text or redacted data, and must be two or more words.
  - LLM confidence is capped at 0.80, so an LLM item is never pre-filled as sure.
- **Bands:** `prefill/check/blank` → high/medium/low. **Pilot safety:** a voice-extracted score is never pre-filled; it is always "check" (`AI_SCORE_PREFILL`, off by default; only `pnpm demo` turns it on). This holds until the audio eval on the team's recordings shows score exact match ≥ 95 %. The value is still kept as said, and an out-of-range score still blocks.
- **T07 candidates:** the students within the matcher's margin (0.15) of the best score.
- **Limits:** prompt `extract-v7`, temperature 0, at most 800 output tokens, thinking off. One time budget for the whole LLM step (`AI_LLM_BUDGET_S`, 90 s); a timeout is not retried. The whole note is given up after 3 minutes ("Type the note instead", with the audio kept for "Try again").
- **Model version** on every result: `faster-whisper:<model>@<compute>/<device>|link_nlp@<version>|ollama:<model>+extract-v7`.

## 3. Confidence handling

Starting thresholds (OD-36), tuned on the evaluation set:

| Confidence | What the teacher sees (V02) |
|---|---|
| ≥ 0.85 | Pre-filled, with a ✓ |
| 0.60 – 0.85 | Pre-filled and highlighted **check** |
| < 0.60 | Left **blank**. The source words are shown so the teacher can fill it in. |
| Ambiguous student | Blocking "Check the student" (T07) |
| Out-of-range score | Blocking error: "21 exceeds the maximum of 20" |

Students not mentioned: "N students weren't mentioned." The teacher chooses "Mark N present" or "Leave not recorded". There is no default.

## 4. Other AI tasks in ai-service

| Task | Phase | Input | Output | Guardrails |
|---|---|---|---|---|
| Parent message drafter | 2 | Confirmed facts for one student + purpose + tone | Egyptian Arabic draft + list of facts used | Confirmed records only; internal notes only if explicitly suggested and reviewed; no diagnosis or ability labels; staff approve (BR-APR-02) |
| Reply triage | 2 | Inbound reply text | Intent, short summary, suggested next steps | Suggestions never change a case's status (BR-APR-10) |
| Ask Link assistant | 2 | User request (text or voice) | Read answers / drafts / proposed actions | Calls core-api **as the user**; tool tiers Read / Draft / Act + approval; grounded answers only |
| Focus-plan writer | 3 | Weakest 1–2 topics, strongest topic, teacher notes, approved tips | Arabic plan + evidence links | Confirmed records only; no ability labels; no comparison with other students; teacher approves (BR-APR-03) |
| Review moderation | 1 (flag) | Review text (Arabic, Franco-Arabic, English) | Flags: personal attack, contact details, possible fake | Flags only; ops decide (BR-REV-04) |
| Search helper | 1 (flag) | Parent's free-text query | Structured filters (curriculum, year, subject, area) | Never changes results beyond the filters |

## 5. Model gateway

Inside ai-service. Every STT and LLM call goes through it.

| Concern | How |
|---|---|
| Routing | Per task: vendor + model + version from configuration. Fallback vendor per task. |
| Resilience | Timeout, retries with back-off, circuit breaker per vendor (05 §6). |
| Redaction | Phone numbers are removed and every detected person name is tokenised (`<S…>`, `<A…>`, `<U…>`, §2.4) before any LLM call. |
| Prompt caching | The system prompt and tool definitions are marked cacheable on the provider side. |
| Versioning | `model_version` = vendor + model + prompt version. It is stored on every proposal, audit event and snapshot. |
| Cost tracking | Writes one `platform.ai_usage` row per call (§7). |

## 6. Evaluation set and release gates

**Early start — epic E15** ([12](12-backlog-phase1.md)). A parallel track from M0, off the Phase 1 critical path, answers "how accurate is voice on real teacher notes?" early: E15-01 consent pack and collection, E15-02 eval harness and gold set v0, E15-03 benchmark 2–3 STT vendors plus the extraction prompt, written up as an ADR. Scripted recordings start at once. Consented real notes, and any vendor outside Egypt, wait for OD-26.

**Gold set**
- Real voice notes from pilot centres, used **only with recorded consent**, plus scripted recordings by Egyptian Arabic speakers covering accents, noise (classroom, street, fan) and code-switching.
- Each item has a gold transcript (by the annotation team) and a gold structured record.
- Includes hard cases: two students with the same first name, nicknames, numbers said many ways, students not mentioned, scores above the maximum.
- **Locked:** it is never used for training or prompt tuning. It is versioned. A separate dev set is used for tuning.

**Metrics**

| Metric | Stage |
|---|---|
| Word error rate (WER) and character error rate on Egyptian Arabic | STT |
| Name-match precision and recall; **wrong-student rate** | Name match |
| Field-level precision / recall / F1 (attendance, score, participation, tag) | Extraction |
| Exact match on scores | Extraction |
| Abstain rate (fields left blank) | Extraction |
| End-to-end p95 latency per 1-minute note | Pipeline |
| Cost per note | Pipeline |

**Release gates**
1. **Wrong-student rate must be 0** on the gold set for any auto-matched name. A single wrong match blocks the release.
2. A new vendor, model or prompt must not be worse than the current one on any metric above, beyond an agreed tolerance.
3. Absolute targets are set after the first benchmark and recorded in an ADR.
4. Results are stored per `model_version` in the eval harness and linked from the release.

## 7. Cost tracking per centre

- Every call writes `platform.ai_usage`: centre, teacher, feature (`stt` \| `extract` \| `draft` \| `triage` \| `focus` \| `moderate` \| `assistant`), provider, model, input/output units, audio seconds, cost, latency and trace ID.
- OpenTelemetry spans carry the same cost attributes.
- Dashboards: cost per note, per centre per month and per feature. Budgets per centre alert ops at 80% and 100%.
- These numbers feed the paid-extras pricing decision (OD-05).

## 8. Privacy and data residency

- **Blocked on OD-26:** no student audio or text goes to a vendor outside Egypt until legal approves the transfer basis (PDPL cross-border rules), or until the vendor runs in an approved region.
- The STT vendor necessarily hears names in the audio. Contracts must forbid training on our data and require deletion.
- No person name reaches the LLM: every detected name span is tokenised as `<S…>`, `<A…>` or `<U…>` (§2.4), and guardian contact data is redacted.
- Audio: encrypted, signed URLs only, deleted after 30 days (BR-DAT-04). Transcripts: per OD-28.
- Teacher corrections are used as training labels **only** for data covered by the `ai_training_use` consent.
- **Data classes (Part B, OD-51):** every audio file and transcript is `synthetic` or `consented_real`. Each provider declares `allows_real_data`, `trains_on_inputs` and `processing_region`; the gateway refuses `consented_real` for anything but a local provider that allows real data and does not train on it — an error, never a fallback to another provider (`apps/ai-service/tests/test_guard.py`).

## 9. Failure modes

| Failure | Behaviour |
|---|---|
| No connection | Note stays in the offline queue; the teacher can finish the record by tap |
| STT down or slow | "Type the note instead" (graceful degradation); the note stays queued and is processed later |
| LLM output invalid twice | Proposal contains attendance from name matches only; the rest must be typed |
| Ambiguous names | Blocking clarification (T07); nothing saved |
| Save fails | T08: the draft is kept; no rules or messages triggered; retry with the same idempotency key |
