# Link Arabic NLP and evaluation kit

This package turns Egyptian Arabic text into **drafts for teacher review**. It makes no model calls and downloads no models. It is separate from STT and the local LLM; reference-only evaluation is not evidence of voice accuracy.

## Install and run

Python **3.12** and uv are required. From `py/link_nlp`:

```powershell
uv sync --python 3.12
uv run ruff check
uv run mypy --strict
uv run pytest
uv run python -m link_eval selftest
uv run python -m link_eval run --gold ../../evals/gold/synthetic --predictions ../../evals/predictions/my-run --out ../../evals/reports/2026-10-04-my-run.md
uv run python -m link_eval compare ../../evals/reports/first.md ../../evals/reports/second.md
```

A development path dependency installs `link_eval` from `evals`. To lint its sources too, run `uv run ruff check ../../evals/link_eval ../../evals/tests`. Tests run offline after installation. Set `UV_CACHE_DIR` to a writable local directory when necessary. The lockfile pins the checked environment.

Runtime dependency: `jsonschema` validates the exact Draft 2020-12 wire schema. No fuzzy/metric dependency is needed: matching uses Python `difflib`, and evaluation uses edit distance in the standard library. Development dependencies are pytest (contracts), ruff (lint/format), mypy and types-jsonschema (strict typing), plus the local evaluation package. Dependencies are installed during setup only.

## Processing order and API

### Stable public API since round 2

Import the supported surface from `link_nlp`; `__all__` is authoritative and the package ships `py.typed`. These signatures and shapes are stable since round 2:

- `normalize_digits(str) -> str`, `normalize_for_match(str) -> str`, and `clean_transcript(str) -> CleanedTranscript`.
- `CleanedTranscript(display: str, clean: str, offset_map: tuple[tuple[int, int], ...])`, with `display_span(start, end) -> tuple[int, int]`.
- `RosterStudent(id: str, display_name: str, nicknames: tuple[str, ...] = ())`.
- `NameMention(start: int, end: int, text: str, status: Literal['unique', 'ambiguous', 'unknown'], student_id: str | None, candidates: tuple[tuple[str, float], ...])` and `find_name_mentions(clean_text, roster, threshold=.85, margin=.15) -> list[NameMention]`.
- `RedactedSpan(start: int, end: int, text: str, replacement: str, kind: Literal['mobile', 'landline', 'email', 'handle'])`; coordinates refer to the input. `Redacted(text: str, spans: tuple[RedactedSpan, ...])` is returned by `redact_contacts(text)`.
- `Leak(start: int, end: int, text: str, kind: Literal['roster_name', 'nickname', 'first_name', 'extra_name', 'contact'])` and `find_pii_leaks(text, roster, extra_names=()) -> list[Leak]`.
- `Tokenised(text: str, token_map: dict[str, NameMention], offset_map: tuple[tuple[int, int], ...])`, with `clean_span(start, end)`; `tokenise(clean_text, mentions) -> Tokenised`.
- `ResolvedItem(status: Literal['resolved', 'needs_identity', 'who_is_this', 'rejected'], student_id: str | None, candidates: tuple[tuple[str, float], ...], item: dict[str, Any], mention: NameMention | None = None, reason: str | None = None)`; `detokenise_items(items, token_map) -> list[ResolvedItem]`.
- `RuleItem` is a `dict[str, Any]` with local boolean `.out_of_range`; `rule_extract(tokenised_text, assessment_max) -> list[RuleItem]`.
- `VOICE_EXTRACTION_SCHEMA: dict[str, Any]` is the packaged Draft 2020-12 schema.
- `ValidationResult(valid: bool, items: list[dict[str, Any]], errors: tuple[str, ...], out_of_range: tuple[int, ...] = (), dropped_topics: int = 0, unassigned: tuple[str, ...] = ())`; `validate_extraction(obj, sent_tokens, assessment_max) -> ValidationResult`.
- `confidence_band(c, high=.85, low=.60) -> Literal['prefill', 'check', 'blank']`.

No round-1 public signature was removed or changed, so there is no deprecation in round 2.

```python
from link_nlp.normalize import clean_transcript
from link_nlp.roster import RosterStudent, find_name_mentions
from link_nlp.tokens import tokenise, detokenise_items
from link_nlp.rules import rule_extract
from link_nlp.schema import validate_extraction, confidence_band

roster = [RosterStudent('s1', 'أحمد سمير'), RosterStudent('s2', 'أحمد سامي')]
cleaned = clean_transcript('أحمد سمير جاب اتناشر من عشرين')
mentions = find_name_mentions(cleaned.clean, roster)
tokens = tokenise(cleaned.clean, mentions)
assert tokens.text == '<S1> جاب 12/20'
wire_items = rule_extract(tokens.text, assessment_max=20)
validation = validate_extraction({'items': wire_items}, set(tokens.token_map), 20)
assert validation.valid
resolved = detokenise_items(validation.items, tokens.token_map)
assert resolved[0].student_id == 's1'
```

Always validate an LLM response before detokenising. On invalid output, retry once or use the supported rule draft; never save invalid output. Merge LLM and rule items only with explicit conflict review, preserving source spans. Conflicting assertions need teacher resolution; neither stage is authoritative.

- `normalize_digits(text: str) -> str`: Arabic-Indic and Persian digits become ASCII; other text is retained.
- `normalize_for_match(text: str) -> str`: strip diacritics/tatweel; normalize أ/إ/آ to ا, ة to ه, ى to ي; normalize digits, collapse whitespace, casefold Latin. Use for matching/metrics, not display.
- `clean_transcript(text: str) -> CleanedTranscript`: `.display` preserves the transcript except digit glyphs; `.clean` converts recognized Egyptian cardinals (0–100), explicit fractions in score context, `X من Y` ratios, and durations. It preserves English/Franco terms and nonnumeric Arabic spelling. Ordinals are not scores.
- `.offset_map`: one `(display_start, display_end)` source range per clean character. `display_span(start, end)` maps a nonempty half-open clean span back to display. Replacement characters share the source phrase range.
- `RosterStudent(id, display_name, nicknames=())` and `NameMention(start, end, text, status, student_id, candidates)` are frozen dataclasses. Mention coordinates are in `.clean`; candidate tuples contain roster IDs and descending scores.
- `find_name_mentions(clean_text, roster, threshold=.85, margin=.15) -> list[NameMention]`: roster/nickname/lexicon/cue detection, conservative resolution described below.
- `tokenise(clean_text, mentions) -> Tokenised`: `.text`, `.token_map`, `.offset_map`, and `clean_span(start, end)`. Every supplied mention is replaced by its own `<S#>`, `<A#>` or `<U#>`. Reserved raw tokens, malformed spans, overlaps and inconsistent identity assignments raise `ValueError`.
- `detokenise_items(items, token_map) -> list[ResolvedItem]`: `.status` is `resolved`, `needs_identity`, `who_is_this`, or `rejected`; `.student_id` is set only for locally resolved `<S#>` tokens; `.candidates`, `.item`, `.mention`, `.reason` retain review context. An extractor-supplied student ID is discarded. Unknown or invented tokens never resolve.
- `rule_extract(tokenised_text, assessment_max) -> list[RuleItem]`: ordinary schema-compatible dictionaries with a local `.out_of_range` attribute. JSON serialization includes only the wire schema keys.
- `validate_extraction(obj, sent_tokens, assessment_max) -> ValidationResult`: `.valid`, `.items`, `.errors`, `.out_of_range` (retained-item indexes), `.dropped_topics`, `.unassigned`. Invalid output yields no accepted items. It does not mutate the input.
- `confidence_band(c, high=.85, low=.60)`: `prefill`, `check`, `blank`. Invalid/nonfinite probabilities or threshold ordering raise `ValueError`.

## Highlighting source words

Rules and LLMs use coordinates in the **tokenised** transcript. Compose both transformations; replacing a full name with `<S1>` changes offsets.

```python
item = validation.items[0]
start, end = tokens.clean_span(**item['span'])
start, end = cleaned.display_span(start, end)
source_words = cleaned.display[start:end]
```

Validate LLM spans against `len(tokens.text)` with `tokens.clean_span` before rendering; the wire validator cannot know transcript length. Python offsets count Unicode code points. Browser `String.slice` uses UTF-16 code units, so convert offsets when non-BMP characters such as emoji occur.

## Matching and identity safeguards

Candidates come only from the supplied session roster, including aliases. Scores are 85% normalized string similarity and 15% phonetic string similarity. The phonetic key collapses common Egyptian speech variants ث/س/ص, ذ/ز/ظ and ق/ء/ا (after alef normalization), plus ة/ه.

Exact full names/nicknames score 1; exact first-name evidence scores .92. Nonexact spellings remain review candidates below the default threshold. A unique result additionally requires exact normalized identity evidence and a sufficient lead over the runner-up. With the default threshold .85 and margin .15, two Ahmeds on a first-name-only mention are ambiguous. Explicit `أحمد سامي` can identify its exact roster entry. A mismatching surname never authorizes assignment to a similar student. Teacher/guardian role cues force unknown identity even if their names match students.

`threshold` and `margin` still gate every unique result. Do not lower them without a separate development set and then a locked evaluation. Changing the roster can make previously unique names ambiguous; pass the actual session roster on every call. Names inside other words are not matched. Bare names that are also ordinary Arabic words (such as هنا, نور and ملك) require explicit student evidence before unique assignment. Extra surname evidence vetoes a shorter exact roster prefix; punctuation cannot join alias words. Conjunctions attached to detected first names are kept outside the redacted span.

The lexicon plus cue detector is bounded. It cannot guarantee detection of every arbitrary adult name, unusual surname, indirect role reference, or adversarial transcript. **Do not treat tokenisation as a universal PII redactor.** Keep the token map local to ai-service. Never put roster display names, token maps or raw reference text into LLM context or model logs. Call `redact_contacts` before tokenisation and call `find_pii_leaks` on the exact outbound payload immediately before every LLM call. Abort the call when it returns any leak. Pass known teacher and adult names through `extra_names`.

## Rule extraction and confidence

Rules emit attendance only for explicitly named tokens with explicit current-session predicates: absence, lateness (plus spoken minutes), or presence. `كلهم حضروا ما عدا ...` produces absence for the exception tokens only. No item is generated for any unmentioned student. Explicit score ratios preserve their numerator, including half marks and values above the maximum. Participation needs an explicit high/low phrase. Rules emit no observations, observation tags, homework, or topic items.

Negation, hypothetical cues, selected historical/future-session cues, and self-correction cause conservative abstention. Clause boundaries stop one student's predicates from being inherited by the next. Complex coordination, omitted names/pronouns, quotations and corrections beyond the supported cues need review or LLM extraction after redaction. Source spans cover the supporting token clause rather than word timings.

Initial confidence values are **heuristics, not empirically calibrated probabilities**: .93 for explicit absence/late/duration/ratio; .90 for explicit presence; .87 for explicit participation. They reflect pattern specificity. Tests verify deterministic behavior, not statistical accuracy. Empirical calibration requires a separate development corpus with teacher-confirmed labels, precision/reliability bins per rule family and recording condition, and confidence adjustments that leave the locked gold set untouched. Report calibration sample sizes and reliability before claiming calibration.

The UI maps `prefill/check/blank` to `high/medium/low`. A blank-band field must be presented as blank while keeping its source words. Out-of-range metadata overrides the band and blocks confirmation. All items remain drafts until teacher confirmation.

## Schema issues found in docs/09

`voice_extraction.schema.json` is copied verbatim from §2.5. The package tests structural equality against that source.

1. The wire schema sets item `additionalProperties: false` and has no `out_of_range` key, although semantic rules require marking it. This implementation preserves the wire schema and returns separate range metadata; proposals should map it to UI `outOfRange`. A future spec change could explicitly define validated proposal metadata while keeping LLM output minimal.
2. `homework` is permitted as a field but has no specified allowed values and is absent from the current UI `VoiceField` union. Only null homework is accepted; non-null values are rejected pending an agreed contract. Do not invent an enum.
3. The schema permits negative/reversed spans and generic values per field. Semantic validation adds valid span ordering, finite confidence/numbers, field enums, numeric scores/late minutes, and text observation checks. The service must additionally validate transcript bounds.
4. §9's fallback says attendance comes from name matches alone. That conflicts with missing-data rules: a name mention is not attendance evidence. Use explicit `rule_extract` attendance only.

The `topic` field is schema-valid but dropped for Phase 2. A Phase 3 topic-map contract would require a separate implementation. Scores below zero or above the assessment maximum are retained and flagged; they are never capped. With no maximum, validation can only flag negative scores; rules can also flag against an explicitly spoken denominator. Persist the rule flag in that case.

## Evaluation and recording

`evals/reference_rules.py --gold <dir> --predictions <dir>` produces reproducible reference-text rule predictions; run it through the package environment. It supplies no artificial latency and declares `stt:reference-text` in its model version. Generated predictions and reports are ignored by default because real evaluations contain private identities.

`evals/dev` contains 15 development-only cases used for rules and thresholds. Gold v1 contains 35 fictional notes: the original 30 plus five accuracy regressions. `gold/LOCK.json` records SHA-256 hashes for every gold file; selftest rejects drift unless run with `--unlock-gold`. `REVIEW.csv` contains every script for native-speaker approval. `python -m link_eval apply-review evals/gold/REVIEW.csv` applies safe transcript edits, updates offsets, and bumps/re-locks the version. `python -m link_eval calibrate --predictions DIR --gold DIR` reports reliability buckets and suggested thresholds without changing defaults. `RECORDING_GUIDE.md` explains team recordings and metadata. No audio is committed.

The runner reports WER/CER after matching normalization, name metrics aligned through reference and predicted transcript word context, wrong identity assignments with cases, per-field precision/recall/F1, score exact match, blank-band abstention, unmentioned-student errors, observed latency percentiles, and condition/hard-case breakdowns. Missing prediction files reduce recall and are explicitly reported. Malformed or mismatched files are errors. Offsets must locate each mention in its own transcript. A unique phrase can recover missing offsets, but repeated names cannot be paired by list order; uncertain occurrence alignment yields `INCOMPLETE`, never `PASS`. Assignments on unresolved identities block release, and student IDs outside the roster are rejected. The report stores a JSON sidecar for comparison.

A wrong automatic identity assignment is a release failure, including assignment to an ambiguous/unknown mention. The selftest's perfect predictions are a metric ceiling constructed from gold labels; its broken predictions exercise the gate. Neither is a model benchmark. The unrecorded corpus has no measured speakers, noise exposure, STT accuracy, or latency. Have native Egyptian Arabic speakers review scripts and labels, then record varied speakers and conditions, human-check transcripts, lock the version, and run actual pipeline predictions. Do not tune on this gold set. Retain a separate development set.

## Integration notes for Claude Code

In `apps/ai-service/pyproject.toml`, depend on `link-nlp` and configure:

```toml
[tool.uv.sources]
link-nlp = { path = "../../py/link_nlp", editable = true }
```

Call cleanup → roster match → complete name/contact redaction gate → tokenisation → explicit rules / LLM extraction → semantic validation → local detokenisation → draft UI adapter. Keep every unresolved identity blocking. Map student IDs to roster `PersonRef`s locally; map range flags to `outOfRange`, bands as above, and convert spans back to display. Group observations must come through `unassigned`/review, never an invented student token. All writing/confirmation remains the service/core-api's responsibility.

For each note write `<id>.pred.json` with `id`, `model_version` (STT/model/prompt versions), STT `transcript`, occurrence-preserving `mentions` (text, status, student_id, candidates, start, end in the raw prediction `transcript`), resolved `items` (student_id, field, value, confidence), unresolved `needs_identity`, and measured `latency_ms`. Include optional recording/audio duration/cost metadata when measured; never fabricate it. Translate matcher clean offsets through `cleaned.display_span` before writing prediction mention offsets. Do not label clean offsets as raw transcript offsets. Mention evaluation should retain spoken name text, including unknown names, in local evaluation files only. Ambiguous/unknown items must not have a student ID. Do not report rule-only or reference-transcript runs as end-to-end speech accuracy. The pnpm command and service wiring belong to Claude Code, outside this branch's scope.
## Verified reference-text baseline

On 30 synthetic reference texts, the deterministic matcher made 47 automatic assignments with **0 wrong student identities**, no unresolved occurrence alignments, and no unmentioned-student handling errors. Score exact match was 19/24 (79.2%); missed scores remain missing rather than guessed. This is a rules-only text check: the reference transcript supplies the STT input, observations are intentionally not extracted, there are no recordings, and speech accuracy or latency has not been measured. Regenerate with `evals/reference_rules.py` and evaluate its output; the local report is `evals/reports/2026-10-05-reference-rules.md`.

## Round 3 (Claude Code, single agent from 2026-10-06)

Codex stopped after round 2. The work below follows the round-2 handoff list (now history: [handoff-to-codex.md](handoff-to-codex.md), [handoff-to-claude.md](handoff-to-claude.md)). All of it was tuned on `evals/dev` and synthetic regression tests (`py/link_nlp/tests/test_round3.py`); gold v1 stays locked.

### API: additions only, plus one documented behaviour change

- **New** `RuleAbstention(token, start, end, reason)` and `rule_abstentions(tokenised_text, assessment_max=None) -> list[RuleAbstention]`. `reason` is one of `name_corrected`, `correction_unclear`, `negation_or_hypothetical`, `other_session`; offsets are in the tokenised text. `rule_extract` is unchanged.
- **Behaviour change (deprecation note):** for an **ambiguous** mention, `NameMention.candidates` now holds only the contenders, i.e. scores within `margin` of the best. Until round 2 it held the whole roster. No signature changed. A consumer that relied on the full list should call `find_name_mentions` on the same text and read `unknown`/`unique` mentions, whose candidates are unchanged and still ranked.
- **New data file** `data/name_words.txt`: common Egyptian first names and surnames, about 300. It is wider than the PII lexicon `first_names.txt`, which is unchanged. It is used only by the matcher (see below), never as a leak list.

### What changed

| Area | Change |
|---|---|
| Names | **A verb is never part of a name.** A first name followed by a predicate, particle or verb-shaped word ends there:<br>• an expanded stop-list with Whisper's spellings («ماجاشا», «تأخر», «أتأخر», «جهه»);<br>• Egyptian shapes («ما…ش», «بي…/بت…/هي…», «ات…», possessive «…تها»);<br>• known names are never treated as verb-shaped («بيشوي», «بيومي»). |
| Names | «و» + a predicate («وكان») is not a name. «X كان/كانت + state» («هنا كانت ساكتة») is person evidence for a common-word name. |
| Names (A5) | A span that does not start with a roster name stops at:<br>• a definite noun («على السبورة»);<br>• another script («على sign rules»);<br>• an English function word. |
| Names (A5) | A compound name («عبد الرحمن») still takes its second part. After a roster first name, any other non-verb word still extends the span, so a different surname vetoes the roster match as before. |
| Names (A4) | Ambiguous candidates are the contenders only (above). |
| Clean-up | • «تلت/ثلث ساعة» = 20 min and «ساعة إلا ربع» = 45 min;<br>• «سالب N» keeps its sign (flagged, never capped);<br>• «7 تاشر» (digit + تاشر, as Whisper writes it) = 17;<br>• a bare «واحد/واحدة» stays a word unless it is in a number context («كل واحد» ≠ 1). |
| Rules (A3) | Self-corrections are handled in code:<br>• a corrected *name* moves the fact to the corrected mention («مريم... لا قصدي مريم حسين، غابت»);<br>• a corrected *predicate* keeps the final statement («غاب، لا استنى، هو حاضر»);<br>• anything less clear abstains, and the abstention is exposed. |
| Rules | • Topic–comment clauses («<S1>، غابت النهارده»).<br>• Participation phrases (high/normal/low), also in a following clause about the same student («لكنه … كان مشارك كويس»).<br>• Bare «جاب N» once the maximum is known (assessment or «من N درجة» in the note).<br>• Whisper's absence and lateness spellings.<br>• A full stop after a digit ends a clause («جابت 8.»). |
| Leak check | `find_pii_leaks` masks the placeholders (with an attached «و») before detection: «<U1> غاب» is not a person called "U". |

### Status of the round-2 handoff list

| Item | Status | Note |
|---|---|---|
| A1 public API | fixed (round 2) | ai-service imports from `link_nlp` |
| A2 contact redaction | fixed (round 2) | `redact_contacts` + `find_pii_leaks`; the ai-service shim is gone |
| A3 rule abstentions | **fixed** | `rule_abstentions`; corrections in code; ai-service hands the abstained clauses to the LLM as "not a fact" and drops LLM attendance, late minutes and scores there |
| A4 candidates | **fixed** | contenders only for ambiguous mentions |
| A5 run-on unknown spans | **fixed** | bounded as above |
| B1 negative score | **fixed** | −1 kept and flagged |
| B2 corrected name | **fixed** | |
| B3 «ملك إيهاب مشاركتها عادية» | **fixed** | unique + participation normal |
| B4 participation in a following clause | **fixed** | |
| B5 corrected predicate | **fixed** | |
| B6 «تلت ساعة» | **fixed** | 20 min |
| B7 «وكان» as a name | **fixed** | |
| B8 «كل واحد» | **fixed** | |
| B9 «على …» spans | **fixed** | |
| B10 «ليلة» for «ليلى» | **fixed as a suggestion** | stays unknown; ليلى is ranked first and shown in "Who is this?", never attached |
| B11 split teens | **fixed** | including «7 تاشر» |
| B12 «التاشر» | **not fixed, by design** | a misspelling; guessing 13 could be wrong, so there is no score and the teacher types it |
| B13 «سيف ماجاشا», «عمر جهه» | **fixed** | |
| B14 «زياد بيلخبط» | **fixed** | |
| B15 «يوسف تأخر» | **fixed** | |
| B16 «وهنا كانت ساكتة» | **fixed** | |
| B17 bare «جاب N» with the maximum said earlier | **fixed** | |
| B18 «شاركت كويس جدا» | **fixed** | |
| B19 «مشاركتها كانت قليلة» | **fixed** | |
| B20 «عمر ونور حلوا كل» | **partly** | no run-on span and nothing invented; «عمر»/«نور» without a person cue are still not mentions (common-word names, by design) |
| English text read as names (seen in the LLM prompt) | **fixed** | English function words never start a name |

### Measured (text only, reference transcripts; `evals/reports/2026-10-06-text-reference-*`)

| Set, pipeline | Wrong students | Score exact | Attendance F1 (P) | Late F1 | Participation F1 | Unknown-name rate |
|---|---|---|---|---|---|---|
| gold v1, rules only, round 2 → round 3 | 0/49 → **0/51** | 19/25 → **25/25** | 0.83 → **0.95** (1.00) | 0.91 → **1.00** | 0.73 → **1.00** | 51% → **33%** |
| gold v1, rules + qwen3:8b, round 2 → round 3 | 0/49 → **0/51** | 24/25 → **25/25** | 0.89 → **0.95** (1.00) | 0.91 → **1.00** | 0.73 → **1.00** | 51% → **33%** |
| dev, either pipeline | 0/12 → 0/12 | 6/6 → 6/6 | 1.00 → 1.00 | — | — | 14% → 14% |

Caveats:
- **Not speech accuracy:** the input is the reference transcript.
- **Partly in-sample:** cases B1–B9 came from failures on the 30 original gold texts, so part of the gold gain is in-sample, even though no rule was tuned against a gold score.
- **Dev is small** (15 notes) and was already at its ceiling.
- **The leak check fails closed:** it skips the LLM on 8 of 35 gold notes, where a common word that is also a student's name («هنا», «نور», «كريم») appears in the text sent to the LLM.

## Changelog

- 2026-10-05: Added the offline Arabic NLP contracts, exact schema validation, reversible name tokens, conservative rules, 30 independently annotated fictional scripts, accuracy runner and identity gates; verified Python 3.12 with 311 passing tests, Ruff, strict mypy, packaged resources, and evaluator selftest.
- 2026-10-06 (round 3, Claude Code): verb/particle name boundaries, bounded unknown spans, contender-only ambiguous candidates, `rule_abstentions` and self-corrections in code, clean-up and rule additions, placeholder masking in `find_pii_leaks`; gold lock hashes LF-normalised content (no content change). 394 tests.
