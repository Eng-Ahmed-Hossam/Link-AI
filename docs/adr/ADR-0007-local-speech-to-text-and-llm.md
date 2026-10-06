# ADR-0007 · Pilot voice: local speech-to-text (faster-whisper) and a local LLM (Ollama), behind a data-safety guard

- **Status:** Accepted for the concierge pilot and the demo (OD-50, OD-51). The production vendor choice (docs/09 §2.2, OD-26) stays open: it is re-decided on the recorded gold set.
- **Date:** 2026-10-05
- **Deciders:** Founder (task owner); implemented in `apps/ai-service`

## Context

Part B replaces the scripted transcript with real speech-to-text for the follow-up loop (V01 → V02). OD-51 says that during the pilot, real audio and transcripts never leave the pilot laptop; outside vendors may receive `synthetic` audio only. No paid provider and no cloud hosting may be used. The target is a 60-second note processed in under 60 seconds on the pilot laptop, and the time limit before "Type the note instead" is 3 minutes.

The NLP core (normalisation, roster name matching, `<S#>/<A#>/<U#>` tokenisation, rule extraction, the schema and its validator, confidence bands) is being built separately as `py/link_nlp` (Codex track). It was merged into `main` on 2026-10-05 (`f76110a`); ai-service now depends on it (uv path dependency) and the stand-in is deleted (see "Update: `link_nlp` round 1" below).

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **ai-service: Python 3.12, FastAPI, uv**, listening on 127.0.0.1 only and requiring a shared token that `pilot:start` / `pnpm demo` generate at random on each start. It writes nothing to the pilot store: results go back to the pilot server through a loopback-only callback (`/v1/internal/voice-results/:id`). | Matches ADR-0001 (Python AI service). Loopback plus a token means nothing on the centre Wi-Fi can call it. |
| 2 | **Speech-to-text: faster-whisper (CTranslate2), default model `large-v3-turbo`**, language `ar`, beam 5, VAD filter, the group's roster display names as the initial prompt. The device is chosen automatically: CUDA if it works (checked with a warm-up), else the CPU with int8. | The only model that meets the time target on a CPU-only laptop (table below), with accuracy close to `large-v3`. |
| 3 | **LLM: `qwen3:8b` through Ollama** (temperature 0, Ollama structured output with the extraction schema, thinking off, at most 800 output tokens, prompt `extract-v7`, decoding constrained to a per-note subset of the wire schema (`llm_schema`), 60 s per call and **one 90-second budget for the whole LLM step** (`AI_LLM_BUDGET_S`); a timeout is not retried). It runs **after** `rule_extract` and only for observations and for what the rules missed. Its output is validated against the schema and then **grounded**: a number must appear in the note; an observation must reuse the teacher's own words; "present" must be said in the student's clause; two different LLM values for one student and field cancel out; a one-word whole-class line is dropped; LLM confidence is capped at 0.80 (so it is always "check" or blank under OD-36, never pre-filled as sure); rules win on the same student and field. If validation fails twice, the note keeps the rule results only (docs/09 §9). | During tests, qwen3:8b without grounding invented a score of 0, observations that were not said, marked students "present" for doing homework, and once looped for 8 minutes. Nested retries (pipeline × gateway × 60 s) once held a note for 244 s, past the 3-minute limit: hence the single budget. |
| 4 | **Data-safety guard** (`ai_service/providers.py`). Each audio file and transcript is tagged `synthetic` or `consented_real`; no other value is accepted. Each provider declares `allows_real_data`, `trains_on_inputs` and `processing_region`. The gateway refuses `consented_real` data for any provider that is not on this device, does not allow real data, or trains on its inputs. It raises `DataSafetyError` (`data_safety_refused`) **before** any network call; nothing catches it to try another provider. The pilot server always sends `consented_real`; the demo always sends `synthetic`. | OD-51 enforced in code, with tests (`tests/test_guard.py`), not left to configuration. |
| 5 | **Gateway and versioning.** Every STT or LLM call goes through `Gateway`. It applies the guard, logs one usage line (task, provider, model, data class, seconds — no text, no names) to `ai-usage.jsonl`, and stamps `model_version` = `faster-whisper:<model>@<compute>/<device>` \| `link_nlp:<version>` \| `ollama:<model>+extract-v7`. Routing comes from `MODEL_ROUTING_CONFIG` (JSON or a file path). | docs/09 §5 (versioning on every proposal); switching the model is a configuration change. |
| 6 | **Groq Whisper is declared but not wired.** No key was given, so its free-tier terms were not checked. It is declared with conservative values (`allows_real_data: false`, `trains_on_inputs: true`, region `US`) so that even if it were wired, the guard would refuse real data. Before wiring it for a synthetic-only comparison: read and record its current free-tier terms here. | The task allows Groq only as an optional synthetic-only comparison, with its terms recorded first. |
| 7 | **Models are downloaded before going to the centre** (`pnpm ai:models`, resumable) and stored in `apps/ai-service/.models` (git-ignored). At the centre nothing needs the internet. | The centre Wi-Fi is not reliable enough for 2–11 GB. |

## Licences

| Component | Licence | Notes |
|---|---|---|
| OpenAI Whisper weights (`large-v3`, `large-v3-turbo`) | MIT | |
| CTranslate2 conversions: `Systran/faster-whisper-large-v3`, `mobiuslabsgmbh/faster-whisper-large-v3-turbo` | MIT | |
| `egy-turbo-ft`: `mohmedbj/whisper-large-v3-turbo-arabic-dialect-ct2` (CT2 conversion of `oddadmix/whisper-large-v3-turbo-arabic-dialectal`) | Apache-2.0 (both) | Fine-tuned on Arabic dialects, including Egyptian; the training data is private; the authors report a WER of 0.344 on their own test set. Commercial use allowed. |
| faster-whisper, CTranslate2 | MIT | |
| Ollama | MIT | |
| Qwen3 (`qwen3:8b`, `qwen3:4b`) | Apache-2.0 | |

## Benchmark (this laptop, 2026-10-05)

Hardware: Intel i7-9750H (6 cores / 12 threads, 2.6 GHz), 15.9 GB RAM, NVIDIA RTX 2070 8 GB, Windows 11. CUDA runs use float16; CPU runs use int8.

Audio: **synthetic only.** Ten short teacher notes (8–15 s) and one 63.7-second note, read by the Windows ar-EG text-to-speech voice (`bench/sentences.json`; `pnpm ai:bench`). TTS speech is cleaner than a teacher in a classroom, so these WERs are optimistic and are **not** the accuracy eval: that is the recorded gold set (Codex track, `pnpm ai:eval`). WER is a quick word-level score after normalisation (lower is better).

| Model | Device | Short notes: seconds (RTF) | Short notes: mean WER | 60-s note: seconds | 60-s note: WER | Meets "60-s note < 60 s"? |
|---|---|---|---|---|---|---|
| large-v3-turbo | RTX 2070 | 0.5–1.0 (0.04–0.12) | 0.24 | 2.7 | 0.23 | yes |
| large-v3-turbo | CPU | 12.4–15.0 (0.86–1.71) | 0.24 | **43.1** | 0.23 | **yes** |
| egy-turbo-ft | RTX 2070 | 0.4–0.7 (0.04–0.06) | 0.20 | 2.4 | 0.32 | yes |
| egy-turbo-ft | CPU | 12.4–16.2 (0.95–1.77) | 0.25 | 68.6 | 0.30 | no |
| large-v3 | RTX 2070 | 1.0–2.0 (0.12–0.15) | 0.22 | 8.0 | 0.18 | yes |
| large-v3 | CPU | 19.7–26.9 (1.75–2.60) | 0.21 | 85.2 | 0.18 | no |

Short notes have a fixed cost of about 12 s on the CPU (model start-up per call and the 30-second Whisper window), so their RTF looks worse than the long note's.

LLM step (`qwen3:8b`, prompt v3, same 10 notes as text): RTX 2070 3–14 s per note (about 65 s in the 2 of 20 runs where the output was invalid twice). **CPU only** (Ollama `num_gpu: 0`): 42–53 s when it answers, and it ran out of its 60 s on 7 of 10 notes, so on a CPU-only laptop a 60-second note takes about 43 s + up to 60 s ≈ **1 min 45 s**, mostly with rule results only. That is inside the 3-minute limit but over the 60-second target.

End to end on the pilot stack (`PILOT_E2E_VOICE=1`, `apps/pilot/e2e/voice.spec.ts`): a 9-second synthetic note recorded in Chromium, encrypted upload, Whisper on the CPU, the LLM on the GPU, back on V02 in **about 27 s** (model loading included), then reviewed and confirmed.

Per-note extraction results and the lessons are in [docs/pilot/accuracy.md](../pilot/accuracy.md).

**Choice: `large-v3-turbo`.** It is the only model under the time target on the CPU, with a WER close to `large-v3` on these notes. On a laptop with an NVIDIA GPU all three meet the target; `large-v3` was slightly more accurate on the long note, so it is the first candidate to re-test on the gold audio. The Egyptian fine-tune was not more accurate on synthetic TTS audio; TTS is not Egyptian speech, so it stays in the audio eval. The choice is re-made on the recorded gold set: `pnpm ai:eval --mode audio --models large-v3-turbo,egy-turbo-ft,large-v3`.

What fits which laptop:
- **NVIDIA GPU with 6–8 GB:** any of the three Whisper models plus qwen3:8b (Whisper about 1.5–3 GB of VRAM, qwen3:8b about 5.5 GB; Ollama moves layers to the CPU if both do not fit).
- **CPU only, 16 GB RAM:** see the CPU-only profile below. Two options: rules only (37 s per 60-second note) or `qwen3:4b` (about 95 s); `qwen3:8b` does not fit the time.
- **8 GB RAM:** not recommended.

## Update: `link_nlp` round 1 (2026-10-05)

- **Merged and integrated.**
  - `codex/nlp-eval` was merged at `f76110a` (ruff, strict mypy, 311 tests and the `link_eval` selftest pass on `main`).
  - ai-service depends on `py/link_nlp`, and the stand-in is deleted.
  - The order and the guards are in docs/09 §2.6.
  - Requests and failure cases for the NLP core are in `docs/ai/handoff-to-codex.md`.
- **What the first eval changed:**
  - The LLM now decodes to a per-note schema: field enums, only the S/A tokens that were sent, no spans, at most 12 items. Invalid replies went from 15 of 30 to 0.
  - The leak check now matches names, not context words. False blocks went from 10 of 30 to 0.
  - The LLM no longer fills participation (precision 0.38).
  - An LLM number must be in the student's own clause.
  - Self-corrections are not facts (prompt `extract-v7`).
  - Pilot scores are always "check" (`AI_SCORE_PREFILL`).
- **Text-only eval** (30 gold notes, reference text, `evals/reports/2026-10-05-text-reference-*`): 0 of 47 wrong students; score exact match 23/24 with `qwen3:8b` (19/24 rules only); attendance F1 0.94 at precision 1.00; abstain rate 0.
- **Windows-TTS audio** (10 notes; not representative of real speech): 0 wrong students and attendance precision 1.00 with every Whisper model. Score exact match was only 1–2 of 8, because Whisper writes spoken teens apart («سبعة تاشر») or as other numbers (27). The NLP core (handoff B10–B12) and the team's recordings decide the next step.

### CPU-only laptop profile (this laptop with the GPU switched off for both Whisper and Ollama)

Time is for the 63.7-second synthetic note (`bench/time_note.py`), warm; loading Whisper adds about 15 s once at start. Accuracy is from the 30 gold texts (extraction only) and the 10 TTS clips (end to end).

| Configuration | Time per 60-second note | LLM answered in time | Gold text: score exact / attendance F1 / observations | TTS audio: score exact / attendance F1 |
|---|---|---|---|---|
| `large-v3-turbo` (CPU) + **rules only** | **37 s** ✓ under 60 s | — | 19/24 / 0.87 / none | 1/8 / 0.80 |
| `large-v3-turbo` (CPU) + **`qwen3:4b`** (CPU) | **95 s** (37 + 57; the cold first note timed out) ✗ over 60 s, inside the 3-minute limit | 21 of 30 gold notes (9 hit the 60 s limit) | 22/24 / 0.87 / F1 0.22 | 1/8 / 0.80 (same as rules) |
| `large-v3-turbo` (CPU) + `qwen3:8b` (CPU), for reference | 98 s; the LLM timed out on every 60-second note | 0 of 2 | — | — |
| For comparison: RTX 2070, `large-v3-turbo` + `qwen3:8b` | about 3 s + 11 s | 30 of 30 | 23/24 / 0.94 / F1 0.08 | 1/8 / 0.80 |

Both CPU options make 0 wrong-student assignments, and neither adds a wrong fact. What the LLM adds on the CPU is mostly observations, plus 3 more exact scores on the gold text, at about one extra minute per note. **Choice left to the founder once the pilot laptop's hardware is known:**
- rules only, which meets the 60-second target (`MODEL_ROUTING_CONFIG={"llm":{"provider":"none"}}`);
- or `qwen3:4b`, which is about 1.5 minutes per note and gives observations (`MODEL_ROUTING_CONFIG={"llm":{"model":"qwen3:4b"}}`).

## Consequences

- ✅ Real audio never leaves the laptop, and the guard proves it with tests; no paid service, no cloud.
- ✅ Switching models is a configuration change, and every proposal records the model version.
- ⚠️ Accuracy is measured on synthetic audio only until the team records the gold scripts. The confidence thresholds (OD-55) are tuned after that eval.
- ✅ ai-service runs on the real `link_nlp` (merged 2026-10-05); requests for it go to `docs/ai/handoff-to-codex.md`.
- ⚠️ Voice-extracted scores are never pre-filled in the pilot (`AI_SCORE_PREFILL` off) until the audio eval on the team's recordings shows score exact match ≥ 95 %.
- ⚠️ On a CPU-only laptop, notes queue one at a time; two teachers finishing together wait for each other (the app shows an estimate).
