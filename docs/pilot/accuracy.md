# What we learned about accuracy (updated 2026-10-06, `link_nlp` round 3)

For Demo Day and the team. **Synthetic only.** Two sets were used:
- **Gold v1:** 35 notes written and annotated by hand (`evals/gold/synthetic`, locked), read as **text**, so speech-to-text is not involved.
- **Our 10 bench notes,** read aloud by the **Windows Arabic text-to-speech voice**. This is *not representative of real speech*: a teacher in a classroom will be harder.

No real teacher has been recorded. Treat every number as a check of the pipeline, not a result.

## The paragraph

Reading a note is now strong; listening is the open question. On the 35 gold notes, given a correct transcript, the pipeline:
- never attached a fact to the wrong student (0 of 51 names);
- got **every score exactly right (25 of 25)**;
- caught attendance with no false positives.

Through speech-to-text, on the clean text-to-speech voice, it got **6 of 8 scores exactly right** (it was 1 of 8 before round 3 taught it how Whisper writes Egyptian numbers and names), still with no fact on a wrong student. A misheard name now becomes "Who is this?" with the likely student as a suggestion, never a guess.

**For the pilot:** voice is off by default and switched on per teacher, and every score from voice is shown as "check". The team's recordings decide when either can change (the gate below).

## The gate (decided by the team's recordings, not by these numbers)

Measured with `pnpm ai:eval --mode audio` on the team's recordings of the gold v1 scripts (`pnpm ai:ingest-recordings <folder>` first):

| To allow … | Needs, on the team's recordings |
|---|---|
| **Voice notes for a teacher** (the owner's per-teacher switch) | **0 wrong students** (`wrong_student_count` = 0 and `unsafe_item_identity_count` = 0, gate PASS) |
| **Pre-filled scores** (`AI_SCORE_PREFILL=1`) | **0 wrong students** and **score exact match ≥ 95%** |

Until then:
- voice is used only with the founder's go-ahead per teacher;
- scores always show "check" (`AI_SCORE_PREFILL` off).

The calibration report (`--calibrate`, report only) informs any later change to the confidence thresholds (OD-55); nothing changes automatically.

## Details

**Text only** (gold v1, reference transcripts; `evals/reports/2026-10-06-text-reference-*-gold-r3.md`):

| Metric | Rules only | Rules + qwen3:8b (GPU) | Rules + qwen3:4b (CPU) |
|---|---|---|---|
| Wrong students | 0 / 51 | 0 / 51 | 0 / 51 |
| Score exact match | 25 / 25 | 25 / 25 | 25 / 25 |
| Attendance F1 (precision) | 0.95 (1.00) | 0.95 (1.00) | 0.95 (1.00) |
| Late minutes F1 | 1.00 | 1.00 | 1.00 |
| Participation F1 | 1.00 | 1.00 | 1.00 |
| Unknown-name rate | 33% | 33% | 33% |
| LLM time per note | — | p50 10 s (GPU) | p50 24 s, p95 60 s; answered 20 of 35 |

The rules alone now carry the structured facts. The LLM adds observations for the teacher to review.

**Windows TTS audio** (not representative of real speech; `large-v3-turbo` on the CPU; `evals/reports/2026-10-06-audio-*-windows-tts-cpu-r3.md`):

| Metric | Round 2 | Round 3 |
|---|---|---|
| Wrong students | 0 / 17 | 0 / 20 |
| Score exact match | 1 / 8 | **6 / 8** |
| Attendance F1 (precision) | 0.80 (1.00) | 0.88 (1.00) |
| Late minutes F1 | 0.50 | 0.80 |
| Participation F1 | 0.00 | 1.00 |
| Names found | 0.65 | 0.77 |
| Unknown-name rate | 37% | 13% |
| Word error rate | 0.25 | 0.25 (same speech-to-text) |

**What made the difference:**
- names end before a verb («سيف ماجاشا», «يوسف تأخر»);
- split teens («سبعة تاشر», «7 تاشر»);
- participation phrases;
- self-corrections handled in code;
- bounded unknown names.

The full list, with every failure case, is in [docs/ai/link-nlp.md](../ai/link-nlp.md) ("Round 3").

**Caveats:**
- Some round-3 fixes came from failures seen on the original 30 gold texts, so part of the text gain is in-sample.
- The fail-closed leak check skips the LLM when a student's name is also an everyday word in the note («هنا», «نور»). Those notes keep the rule results only.

**Reproduce:**

```
pnpm ai:eval --mode text
pnpm ai:eval --mode audio --gold apps/ai-service/bench/gold --audio-dir apps/ai-service/bench/audio --models large-v3-turbo
pnpm ai:ingest-recordings <folder> && pnpm ai:eval --mode audio --models large-v3-turbo,egy-turbo-ft,large-v3 --calibrate
```
