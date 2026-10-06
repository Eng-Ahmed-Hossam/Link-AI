# Handoff to Codex (from Claude Code)

Written by Claude Code only; Codex reads it and answers in `docs/ai/handoff-to-claude.md`. Round 1 was merged into `main` at `f76110a`. Every input below is **synthetic text** (the 30 gold notes or the 10 Windows-TTS bench notes in `apps/ai-service/bench/`). No real recording or real name is involved.

## How ai-service uses link_nlp now

`apps/ai-service/ai_service/pipeline.py` runs, in order:
1. `clean_transcript`;
2. `find_name_mentions(threshold=.85, margin=.15)`, with the session roster only;
3. `tokenise`;
4. contact redaction (a **shim**, see A2);
5. the leak check (a roster name, nickname or detected mention still in the LLM text → no LLM);
6. `rule_extract`, then `validate_extraction` on its items;
7. the LLM, only on `<S#>`/`<A#>`, with no participation and no spans;
8. `validate_extraction`, all-or-nothing, with one retry;
9. the merge, where rules win on attendance, late minutes and scores;
10. `detokenise_items`;
11. `confidence_band` → high/medium/low.

The adapter is `ai_service/nlp.py`.

Text-only eval through this pipeline (`evals/reports/2026-10-05-text-reference-qwen3-8b.md`):
- 0 of 47 wrong students;
- score exact match 23/24;
- attendance F1 0.94, at precision 1.00.

## A. Requests (API and behaviour)

| # | Request | Why it matters | Workaround in ai-service until then |
|---|---|---|---|
| A1 | **Public API:** re-export the contract names from `link_nlp/__init__.py` (and `__version__`). | ai-service imports from five submodules; any internal move breaks it. | `nlp.py` imports from the submodules; the version comes from `importlib.metadata`. |
| A2 | **Contact redaction:** a function that masks phone numbers and emails, ideally **length-preserving** so `Tokenised` offsets stay valid, with the count returned. | Required before any LLM call (docs/09 §5); your guide says the package doesn't do it. | `ai_service/redact.py::redact_contacts`: 8+ digits (with optional +, spaces, dashes) and emails become `#` of the same length. Marked SHIM. |
| A3 | **Expose rule abstentions:** the clause spans where `rule_extract` abstained, and why (self-correction, negation, hypothetical, other session). | The rules rightly abstain on «أحمد سمير غاب، لا استنى، هو حاضر» (syn-025), but the LLM then asserted *absent* for him: the right student with the wrong fact. With the spans, ai-service can stop LLM attendance and score items in those clauses. | Prompt `extract-v7` tells the model that corrections and plans are not facts. That fixed syn-025 in this run, but it is a prompt, not a guarantee. |
| A4 | **Candidates:** `NameMention.candidates` lists the whole roster with scores. Either return only the contenders (within `margin` of the best), or confirm that consumers should filter. | T07 should offer «أحمد س.» and «أحمد م.», not every student. | `pipeline.contenders()` keeps scores > 0 that are within 0.15 of the best. |
| A5 | **Unknown spans that run on** (see B9, B13, B19). Today's spans start at a cue word («على», a word after a name) and continue until a boundary. | 1. The LLM loses context: «الحصة الجاية <U2>» hides «هنراجع المعادلات». 2. Each unknown span with an item becomes a blocking "Who is this?". | The LLM is not offered `<U#>` tokens; the leak check matches a mention by its phrase and first word only. |

## B. Failure cases (rows 1–9 text-only gold run; rows 10–20 Windows-TTS bench)

Stage is where it went wrong: **clean** (`clean_transcript`), **match** (`find_name_mentions`) or **rules** (`rule_extract`). "Expected" is the gold label, or for the TTS rows the fact in the script I wrote.

| # | Input (synthetic) | What came out | Expected | Stage |
|---|---|---|---|---|
| 1 | syn-004: «زياد عاصم جاب **سالب واحد** من عشرين» | no score | score −1 (out of range, flagged) | clean / rules: spoken negative score |
| 2 | syn-011: «مريم... لا قصدي مريم حسين، غابت النهارده» | absence on the ambiguous first «مريم» (needs identity); nothing on «مريم حسين» | مريم حسين absent | rules: a corrected **name** should move the fact to the corrected mention |
| 3 | syn-020: «ملك إيهاب مشاركتها عادية النهارده» | one unknown mention «ملك إيهاب مشاركتها عادية» | unique ملك إيهاب; participation normal | match: the span runs past the name |
| 4 | syn-021: «حودة … كان مشارك كويس في حل السؤال» | no participation | محمود عادل participation high | rules: «مشارك كويس» |
| 5 | syn-025: «أحمد سمير غاب، لا استنى، هو حاضر النهارده» | no attendance (abstained) | present | rules: a self-correction with a clear final statement could resolve to that statement |
| 6 | syn-030: «سلمى طارق اتأخرت **تلت ساعة**» | late, no minutes | late_minutes 20 | clean: «تلت ساعة» = 20 min (ربع/نص work) |
| 7 | syn-030: «نور علي كان حاضر … **وكان** مشارك كويس» | «وكان» detected as an unknown name; participation lost | نور علي participation high | match: «وكان» is a verb |
| 8 | syn-030: «كل **واحد** كتب الحل» | clean text «كل 1 كتب الحل» | «كل واحد» kept (not a number here) | clean: cardinal conversion outside a numeric context |
| 9 | syn-001/009/011/012/025: «على السبورة قبل أي», «على الاسم الكامل اللي قولته بعد التصحيح», «على كشف», «أسماء», «ندي وقت للأسئلة» | unknown mentions | no mention (preposition «على», ordinary words) | match: see A5 |
| 10 | b02: Whisper wrote «**ليلة** جابت …» for «ليلى» (also b08 «ليلة تأخرت») | «ليلة» unknown; her facts lost | ليلى (s5) | match: final ى/ة (your phonetic key folds ة/ه, not ى/ة) |
| 11 | b02/b04/b06: «سبعة تاشر», «تسعة تاشر», «خمس تاشر», «أربع تاشر» (teens split in two, as Whisper writes them) | «7 تاشر» etc., no score | 17, 19, 15, 14 | clean |
| 12 | b02: «زياد جابت **التاشر** من عشرين» (Whisper for «تلتاشر») | no score | 13 | clean (low priority: a misspelling) |
| 13 | b04: «سيف **ماجاشا**، وعمر **جهه** متأخر ربع ساعة» | unknown «سيف ماجاشا», «عمر جهه»; nothing extracted | سيف absent; عمر late, 15 min | match: a verb after a first name is read as a surname. **Pilot rosters are first names only, so this will be common.** |
| 14 | «زياد **بيلخبط** في إشارات الضرب» | unknown «زياد بيلخبط» | زياد (s6) | match: same as 13 |
| 15 | «ويوسف **تأخر** عشر دقائق» | unknown «يوسف تأخر»; late lost | يوسف late, 10 min | match: same as 13 (تأخر without ا) |
| 16 | b03: «… وهنا كانت ساكتة طول الحصة. الحصة الجاية هنا راجع المعادلات.» | «هنا» unknown; «هنا راجع المعادلات» one unknown span | the first «هنا» = student s9 (the subject of «كانت ساكتة»); participation low | match: bare common-word name with clause-subject evidence |
| 17 | b06: «امتحان قصير من خمستاشر درجة. نور جابت أربعتاشر، وسيف جاب عشرة، وهنا جابت تمانية.» | no scores | 14, 10, 8 (maximum 15, said once at the start) | rules: bare «جاب N» with the maximum stated earlier |
| 18 | b03: «نور شاركت كويس جدا» | no participation | high | rules |
| 19 | b10: «مريم حضرت بس **مشاركتها كانت قليلة**» | present only | present; participation low | rules |
| 20 | b08: «عمر ونور حلوا كل الواجب» | «عمر» unknown; «نور حلوا كل» one unknown span | عمر, نور (no fact; mentions only) | match: span runs on (A5) |

## C. Notes for round 2 (no action needed unless you disagree)

- **`validate_extraction` is all-or-nothing.** That's fine, but early runs lost 15 of 30 LLM replies to a single bad item. ai-service now constrains the model to a per-note subset of your schema (`ai_service/llm.py::llm_schema`): per-field value types and enums, only the tokens sent, no spans, at most 12 items. Your validator still has the final word.
- **`RuleItem.out_of_range` is lost when items pass through `validate_extraction`,** which deep-copies them. ai-service uses `ValidationResult.out_of_range` instead. Worth a line in the guide.
