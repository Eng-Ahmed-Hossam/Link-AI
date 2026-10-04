# What we learned about accuracy (Part B, 2026-10-05)

For Demo Day and the team. **Synthetic audio only:** 10 short teacher notes plus one 60-second note, written by us and read by the Windows Arabic (Egypt) text-to-speech voice. No real teacher has been recorded yet, and the recorded gold set (30 scripts, Codex track) is not in yet, so treat every number here as a smoke test, not a result.

## The paragraph

Local speech-to-text is good enough to start, but numbers are the weak spot. On our 10 synthetic notes, `large-v3-turbo` running on the laptop got most words right (about 1 word in 4 differs, and most differences are spelling: «دقائق» for «دقايق», «جداً» for «جدا»). The rules and the local LLM then caught **8 of 9 attendance facts** (absent, late, present), and kept most observations in the teacher's own words. But they caught **none of the 11 scores and late minutes**: the teacher says «سبعتاشر من عشرين» and Whisper writes «سبعة تاشر», and nothing yet turns spoken numbers into digits. That clean-up step is specified in docs/09 §2.3 and is being built in the NLP core. Two other risks showed up. A name can be misheard («ليلى» → «ليلة»), and the student is then simply missed. A name that is also a word («هنا») once pulled a sentence onto the wrong student. Nothing is saved without the teacher: every item is a proposal, LLM-only items are never pre-filled as sure, and an ambiguous name stops the record until the teacher picks the student. **Bottom line for the pilot:** voice notes save typing for attendance and observations today; scores should still be entered by tap until the number clean-up lands and the gold-set eval says otherwise.

## Details

| What | Result (audio → `large-v3-turbo` on the GPU → rules + `qwen3:8b`, prompt `extract-v3`) |
|---|---|
| Word error rate, short notes / 60-second note | 0.24 / 0.23 (`large-v3`: 0.22 / 0.18; Egyptian fine-tune: 0.20 / 0.32) |
| Attendance facts (absent, late, present) | 8 of 9 (missed: «ليلى» heard as «ليلة») |
| Scores and late minutes | 0 of 11 (spoken numbers not converted yet; the LLM may not invent a number that is not in the text) |
| Observations kept in the teacher's words | 7 of 9 |
| Wrong items | 3: a sentence pinned on «هنا» (the word, not the student); «بيتكلم كتير» read as high participation and "positive" |
| LLM failed (output not valid JSON twice) | 2 of 20 runs (10 text + 10 audio); the note then keeps the rule results only |
| Time per note | GPU: 4–14 s (66 s when the LLM fails twice). CPU only: speech-to-text about 43 s for a 60-second note; `qwen3:8b` on the CPU ran out of its 60 s on 7 of 10 notes |

What changed because of these runs: grounding (a number must be in the note, an observation must reuse the teacher's words, "present" must be said, contradictory values cancel out, one-word whole-class lines are dropped), the LLM confidence cap of 0.80, prompt v3, and one time budget for the whole LLM step (`AI_LLM_BUDGET_S`).

For the NLP core (Codex): spoken teens split in two («سبعة تاشر», «خمس تاشر», «تناشر»); «ى»/«ة» at the end of names («ليلى»/«ليلة»); names that are also common words («هنا», «نور»); «ماجاشا» for «ما جاش»; «ما عدا» lists ("everyone except…"). These would make good gold-set cases.

Reproduce: `pnpm ai:bench` (speech-to-text) and `uv --directory apps/ai-service run python -m ai_service.predict --gold <dir> --out <dir> [--mode audio --audio-dir apps/ai-service/bench/audio]`. Once the eval kit is merged: `pnpm ai:eval --mode text`, then `pnpm ai:eval --mode audio --models large-v3-turbo,egy-turbo-ft,large-v3`.
