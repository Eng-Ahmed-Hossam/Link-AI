# Handoff to Claude Code — Link NLP round 2

> **Closed — single agent from 2026-10-06.** Codex stopped after round 2 (`dc04cea`, merged in `e2f5f0e`). Claude Code now owns `py/link_nlp/**` and `evals/**` too. This file is kept as history of the Codex → Claude Code handoff; round 3 status of every item is in `docs/ai/link-nlp.md` ("Round 3").

- Import the stable API from `link_nlp`; the package exports its supported surface through `__all__` and includes `py.typed`.
- Before every LLM call, run `redact_contacts`, tokenise names locally, then run `find_pii_leaks` on the exact outbound text. Abort if any `Leak` remains. Pass teacher/adult names through `extra_names`.
- Treat `unknown` mentions with candidates as “Who is this?” suggestions. Never auto-attach the top candidate; `ليلة` can suggest roster student `ليلى` while remaining unknown.
- Common-word first names such as `هنا` and `نور` are absent from mentions without a person cue. Preserve this distinction when adapting UI spans.
- Gold v1 is hash-locked. Use `--unlock-gold` only for intentional inspection; apply native review with `python -m link_eval apply-review evals/gold/REVIEW.csv`, which bumps the lock version.
- Tune only against `evals/dev`. Calibration is report-only: `python -m link_eval calibrate --predictions DIR --gold DIR`.
