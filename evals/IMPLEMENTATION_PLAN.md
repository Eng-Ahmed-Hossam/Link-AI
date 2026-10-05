# Arabic NLP and evaluation implementation plan

The supplied task brief and docs/09 are the approved specification. Work exclusively on codex/nlp-eval, with production code under py/link_nlp, evaluation assets under evals, and API documentation at docs/ai/link-nlp.md.

- [x] Write failing contract tests, then implement reversible Arabic cleanup with source ranges, roster-only matching, and tokenisation. Conservative matching abstains on uncertain surnames and non-student roles.
- [x] Copy the exact docs/09 JSON schema; validate semantic values and sent tokens. Keep range flags outside the strict wire schema. Extract only explicit attendance, lateness, score and participation patterns.
- [x] Independently annotate 30 fictional scripts and validate references against the roster and wire schema. Keep real data and all audio ignored.
- [x] Test and implement occurrence-aware evaluation, fail the release on any wrong identity, expose missing predictions and honest sample counts, compare reports, and verify perfect/broken selftests.
- [x] Run Python 3.12 ruff, strict mypy, full pytest and eval selftest; review scope and integration, then make small Conventional Commits. Add the documentation changelog only at the end.

Review focus: unknown names near known surnames; guardian/teacher role cues; negation and self-correction; offset transformations and duplicate name occurrences; missing/malformed predictions and empty metric denominators. Confidence constants are initial conservative heuristics, not empirically calibrated probabilities. No synthetic result is a measurement of recorded speech.

Verification: Python 3.12.13; 311 tests passed; package/evaluation Ruff and strict mypy passed; evaluator selftest perfect PASS / deliberately broken FAIL on 30 notes. Wheel resources verified. Actual reference-text matching gate passes; no recorded speech, speaker accuracy or model latency is claimed.
