# What we learned about accuracy (updated 2026-10-05, after `link_nlp` was merged)

For Demo Day and the team. **Synthetic only.** Two sets were used:
- **The 30 gold notes** (`evals/gold/synthetic`, Codex track). They were written and annotated by hand and read as **text**, so speech-to-text is not involved.
- **10 short notes and one 60-second note that we wrote,** read aloud by the **Windows Arabic text-to-speech voice**. This is *not representative of real speech*: a teacher in a classroom will be harder.

No real teacher has been recorded. Treat every number here as a check of the pipeline, not a result.

## The paragraph

The note-reading part is now strong; listening is the weak spot. Given a correct transcript of our 30 gold notes, the pipeline:
- never attached a fact to the wrong student (0 of 47 names);
- got **23 of 24 scores exactly right**;
- caught attendance with no false positives (F1 0.94).

Through speech-to-text it is a different picture, even on the clean text-to-speech voice. Whisper mishears about 1 word in 4, and its errors fall exactly on what matters: names («ليلى» heard as «ليلة») and spoken numbers («سبعتاشر» written as «سبعة تاشر», or even as 27). With audio, only **1–2 of 8 scores** came through. The system still did the safe thing: no fact went to the wrong student, a misheard 27/20 was flagged "out of range" and blocked, and a misheard name became "who is this?" instead of a guess.

**For the pilot:** voice saves typing for attendance and observations; every score from voice is shown as "check", never pre-filled. The next step is the team's 30 recordings (the audio eval), which decide the speech-to-text model and when scores can be trusted.

## Details

**Text only:** the 30 gold notes through the full pipeline, rules + `qwen3:8b`, prompt `extract-v7`. Reports: `evals/reports/2026-10-05-text-reference-*.md`.

| Metric | Rules only | Rules + qwen3:8b |
|---|---|---|
| Wrong students (automatic name assignments) | 0 / 47 | 0 / 47 |
| Score exact match | 19 / 24 | **23 / 24** |
| Attendance F1 (precision) | 0.87 (1.00) | 0.94 (1.00) |
| Late minutes F1 | 0.91 | 0.91 |
| Participation F1 (precision) | 0.73 (1.00) | 0.73 (1.00) — the LLM is not allowed to guess it |
| Observation / tag F1 | — | 0.08 / 0.16 (gold labels only 5; the teacher reviews every one) |
| Abstain rate (blank band) | 0 | 0 |
| Time per note (GPU) | 0.01 s | p50 10.9 s, p95 12.9 s |

**Windows TTS audio (not representative of real speech):** 10 notes, 20 structured facts, `apps/ai-service/bench/gold`.

| Whisper model (GPU) | WER | Names found | Score exact match | Attendance F1 (precision) | Wrong students |
|---|---|---|---|---|---|
| (reference text, no speech) | 0 | 0.77 | 5 / 8 | 0.94 (1.00) | 0 |
| large-v3-turbo | 0.24 | 0.65 | 1 / 8 | 0.80 (1.00) | 0 |
| egy-turbo-ft | 0.22 | 0.73 | 2 / 8 | 0.88 (1.00) | 0 |
| large-v3 | 0.21 | 0.65 | 2 / 8 (two others misheard as 27 and 29, flagged out of range) | 0.71 (1.00) | 0 |

**What changed because of these runs (Part C):**
- the LLM decodes to a strict per-note schema (invalid replies went from 15 of 30 to 0);
- the leak check matches names, not the words around them (false LLM blocks went from 10 of 30 to 0);
- the LLM may not fill participation (its precision was 0.38) and is not offered unknown spans;
- an LLM number must sit in the student's own clause (a misheard «ليلة» once moved her minutes to زياد);
- a self-correction is not a fact (the LLM once marked a corrected "present" as absent);
- pilot scores are always "check".

**Open for the NLP core:** 20 synthetic failure cases are listed in [docs/ai/handoff-to-codex.md](../ai/handoff-to-codex.md). The biggest groups:
- a verb after a first name is read as a surname («سيف ماجاشا», «يوسف تأخر»);
- teens split in two («سبعة تاشر»);
- names with a final «ى» heard as «ة».

**Reproduce:**

```
pnpm ai:eval --mode text
pnpm ai:eval --mode audio --gold apps/ai-service/bench/gold --audio-dir apps/ai-service/bench/audio --models large-v3-turbo,egy-turbo-ft,large-v3
```

On the team's recordings: `pnpm ai:eval --mode audio --models …` with the default gold folder.
