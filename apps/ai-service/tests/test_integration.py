"""ai-service × link_nlp integration: the pipeline order, the leak check, contact redaction, the
rules-win merge and the pilot's score band (docs/ai/link-nlp.md; Part C §2)."""

from __future__ import annotations

import json

from conftest import ROSTER, FakeLlm, FakeStt

from ai_service import pipeline
from ai_service.pipeline import run_text

NOTE = "مريم غابت النهارده، وأحمد جاب ١٤ من ٢٠، ويوسف اتأخر ١٠ دقايق. نراجع الكسور الحصة الجاية"


def _item(student, field, value, conf=0.9):
    return {"student": student, "field": field, "value": value, "confidence": conf,
            "span": {"start": 0, "end": 1}}  # fmt: skip


def by(items, field, student=None):
    return [i for i in items if i["field"] == field and (student is None or i["studentId"] == student)]  # fmt: skip


def test_pipeline_order(make_gw, monkeypatch):
    calls: list[str] = []

    def spy(name, fn):
        def wrapped(*a, **k):
            calls.append(name)
            return fn(*a, **k)

        return wrapped

    nlp = pipeline.nlp
    for name in ("redact_contacts", "clean_transcript", "find_name_mentions", "tokenise",
                 "rule_extract", "validate_extraction", "find_pii_leaks", "detokenise_items",
                 "confidence_band"):  # fmt: skip
        monkeypatch.setattr(nlp, name, spy(name, getattr(nlp, name)))
    gw = make_gw(FakeStt(), FakeLlm(reply={"items": []}))
    monkeypatch.setattr(gw, "extract", spy("llm", gw.extract))
    run_text(NOTE, ROSTER, {"maxScore": 20}, "synthetic", gw)

    first = [c for i, c in enumerate(calls) if c not in calls[:i]]
    assert first == [
        "redact_contacts",  # on the raw transcript, before anything else (link_nlp guide)
        "clean_transcript",
        "find_name_mentions",
        "tokenise",
        "rule_extract",
        "validate_extraction",  # the rule items
        "find_pii_leaks",  # on the exact outbound text …
        "llm",  # … immediately before the call
        "detokenise_items",
        "confidence_band",
    ]
    assert all(calls[i - 1] == "find_pii_leaks" for i, c in enumerate(calls) if c == "llm")
    # The LLM reply is validated after the call and before detokenising.
    assert calls.index("llm") < len(calls) - 1 - calls[::-1].index("validate_extraction")
    assert calls[::-1].index("validate_extraction") > calls[::-1].index("detokenise_items")


def test_a_phone_number_or_email_never_reaches_the_llm_or_the_transcript(make_gw):
    llm = FakeLlm()
    res = run_text(
        "مريم غابت، وولي أمرها قال كلموني على 01012345678 أو a.b@x.com",
        ROSTER, None, "synthetic", make_gw(FakeStt(), llm),
    )  # fmt: skip
    assert llm.prompts and "01012345678" not in llm.prompts[0] and "a.b@x.com" not in llm.prompts[0]
    assert "<CONTACT1>" in llm.prompts[0] and res.contacts_redacted == 2
    assert "01012345678" not in res.transcript  # the stored receipt never keeps it either
    assert by(res.items, "attendance", "stu-mariam")


def test_a_name_left_in_the_text_skips_the_llm_and_keeps_the_rules(make_gw, cfg, monkeypatch):
    # The matcher is bounded (docs/ai/link-nlp.md): simulate it missing يوسف. find_pii_leaks on
    # the outbound text must catch the name, skip the LLM, keep the rule results and log the
    # event without any text.
    real = pipeline.nlp.find_name_mentions

    def miss_youssef(clean, roster, **k):
        return [m for m in real(clean, roster, **k) if m.text != "يوسف"]

    monkeypatch.setattr(pipeline.nlp, "find_name_mentions", miss_youssef)
    llm = FakeLlm()
    res = run_text(NOTE, ROSTER, None, "synthetic", make_gw(FakeStt(), llm))
    assert llm.prompts == []
    assert res.leak_blocked is True and res.llm_used is False
    assert by(res.items, "attendance", "stu-mariam")  # rules kept
    log = [json.loads(line) for line in cfg.usage_log.read_text("utf-8").splitlines()]
    event = [r for r in log if r.get("task") == "leak_check"]
    assert event and event[0]["leaks"] >= 1 and event[0]["leaks_roster_name"] >= 1
    raw = cfg.usage_log.read_text("utf-8")
    assert "يوسف" not in raw and "مريم" not in raw


def test_an_adult_name_given_as_extra_name_blocks_the_llm(make_gw):
    # The teacher's own name said in the note is not a student and must not reach the LLM either.
    llm = FakeLlm()
    res = run_text("مريم غابت، ومستر سامح هيكلم أهلها", ROSTER, None, "synthetic",
                   make_gw(FakeStt(), llm), extra_names=("سامح",))  # fmt: skip
    assert res.leak_blocked is True or "سامح" not in (llm.prompts[0] if llm.prompts else "")


def test_rules_win_on_attendance_late_and_scores_for_the_same_student(make_gw):
    # يوسف is said three times (three tokens). The LLM disagrees with the rules on attendance, minutes
    # and the score; its observation (not a rule field) is kept, its participation never is.
    note = "يوسف اتأخر ١٠ دقايق. يوسف جاب ١٤ من ٢٠. يوسف كان مشارك جدا"

    def reply(prompt):
        return {
            "items": [
                _item("<S3>", "attendance", "present"),
                _item("<S2>", "late_minutes", 14),
                _item("<S3>", "score", 10),
                _item("<S3>", "participation", "high", 0.8),
                _item("<S3>", "observation", "كان مشارك جدا", 0.8),
            ]
        }

    res = run_text(note, ROSTER, {"maxScore": 20}, "synthetic", make_gw(FakeStt(), FakeLlm(reply)))
    assert [i["value"] for i in by(res.items, "attendance", "stu-youssef")] == ["late"]
    assert [i["value"] for i in by(res.items, "late_minutes", "stu-youssef")] == [10]
    assert [i["value"] for i in by(res.items, "score", "stu-youssef")] == [14]
    assert [i["value"] for i in by(res.items, "observation", "stu-youssef")] == ["كان مشارك جدا"]
    # Participation comes from the rules' explicit phrase ("مشارك جدا"), not from the LLM.
    assert all(i["confidence"] > 0.8 for i in by(res.items, "participation", "stu-youssef"))


def test_pilot_scores_are_never_prefilled_but_kept_and_still_blocked_out_of_range(make_gw, cfg):
    assert cfg.score_prefill is False  # the default: the pilot gets "check"
    res = run_text("يوسف جاب ١٤ من ٢٠، ومريم جابت ٢٥ من ٢٠", ROSTER, {"maxScore": 20},
                   "synthetic", make_gw(FakeStt(), None))  # fmt: skip
    scores = {i["studentId"]: i for i in by(res.items, "score")}
    assert scores["stu-youssef"]["value"] == 14 and scores["stu-youssef"]["confidence"] >= 0.85
    assert scores["stu-youssef"]["band"] == "medium"  # "check", never pre-filled
    assert scores["stu-mariam"]["value"] == 25 and scores["stu-mariam"]["outOfRange"] is True
    # Other fields keep their own band.
    assert by(res.items, "attendance") == [] or all(
        i["band"] == "high" for i in by(res.items, "attendance")
    )


def test_the_demo_setting_lets_a_sure_score_prefill(make_gw, cfg):
    cfg.score_prefill = True
    res = run_text(
        "يوسف جاب ١٤ من ٢٠", ROSTER, {"maxScore": 20}, "synthetic", make_gw(FakeStt(), None)
    )
    assert by(res.items, "score", "stu-youssef")[0]["band"] == "high"


def test_score_prefill_setting_reads_the_environment():
    from ai_service.config import load_config

    assert load_config({}).score_prefill is False
    assert load_config({"AI_SCORE_PREFILL": "1"}).score_prefill is True


def test_an_llm_number_must_be_said_as_a_score_or_as_minutes(make_gw):
    # "10" appears only as minutes: the LLM may not turn it into a score.
    note = "يوسف اتأخر ١٠ دقايق وكان مشارك"
    llm = FakeLlm(reply={"items": [_item("<S1>", "score", 10)]})
    res = run_text(note, ROSTER, {"maxScore": 20}, "synthetic", make_gw(FakeStt(), llm))
    assert res.llm_used is True and by(res.items, "score") == []


def test_the_llm_schema_is_a_strict_subset_of_the_wire_schema():
    import jsonschema

    from ai_service.llm import llm_schema
    from ai_service.nlp import validate_extraction
    from ai_service.pipeline import with_spans

    schema = llm_schema(["<S1>", "<A1>"])
    reply = {
        "items": [
            {"student": "<S1>", "field": "score", "value": 14, "confidence": 0.8},
            {"student": "<A1>", "field": "observation", "value": "شارك كتير", "confidence": 0.7},
        ],
        "unassigned": [],
    }
    jsonschema.validate(reply, schema)
    for bad in (
        {"student": "<S9>", "field": "score", "value": 3, "confidence": 0.5},  # not sent
        {"student": "<S1>", "field": "score", "value": "14", "confidence": 0.5},  # a string
        {
            "student": "<S1>",
            "field": "participation",
            "value": "high",
            "confidence": 0.5,
        },  # rules own it
        {"student": "<S1>", "field": "attendance", "value": "here", "confidence": 0.5},
        {"student": "<S1>", "field": "topic", "value": "x", "confidence": 0.5},  # Phase 3
    ):
        with __import__("pytest").raises(jsonschema.ValidationError):
            jsonschema.validate({"items": [bad], "unassigned": []}, schema)
    text = "<S1> جاب 14/20، و<A1> شارك كتير"
    vr = validate_extraction(with_spans(reply, text), {"<S1>", "<A1>"}, 20)
    assert vr.valid, vr.errors
    assert llm_schema([])["properties"]["items"]["maxItems"] == 0


def test_the_llm_is_not_offered_unknown_spans(make_gw):
    # "سيف ماجاشا" (a verb read as a surname) is an unknown span: the LLM never sees its token as a
    # target and an item on it is dropped; the teacher is not asked "who is this?" for LLM guesses.
    llm = FakeLlm(reply={"items": [_item("<U1>", "observation", "ماجاشا")]})
    res = run_text("سيف ماجاشا النهارده", [*ROSTER, pipeline.RosterEntry("stu-seif", "سيف")],
                   None, "synthetic", make_gw(FakeStt(), llm))  # fmt: skip
    assert "<U1>" not in llm.prompts[0].split("TOKENS:")[1].splitlines()[0]
    assert res.unresolved == []


def test_an_llm_number_must_be_in_the_students_own_clause(make_gw):
    # Windows-TTS run: "ليلى" was heard as "ليلة" (not matched) and the LLM put her 5 minutes on زياد.
    note = "زياد حل الواجب. ليلة تأخرت خمس دقائق."
    llm = FakeLlm(reply={"items": [_item("<S1>", "late_minutes", 5)]})
    res = run_text(note, [*ROSTER, pipeline.RosterEntry("stu-ziad", "زياد")], None, "synthetic",
                   make_gw(FakeStt(), llm))  # fmt: skip
    assert res.llm_used is True
    assert by(res.items, "late_minutes", "stu-ziad") == []  # never moved to زياد
    # Round 3: «ليلة» is now a detected unknown name, so the rules keep her 5 minutes on a
    # "Who is this?" item instead of losing them.
    assert [i["identity"] for i in by(res.items, "late_minutes")] == ["unknown"]


def test_a_decimal_score_stays_in_its_clause(make_gw):
    # syn-030: "وجاب تسعتاشر ونص من عشرين" → "19.5/20"; the "." is not a clause boundary.
    note = "يوسف كان حاضر وجاب تسعتاشر ونص من عشرين، وكان مركز"
    llm = FakeLlm(reply={"items": [_item("<S1>", "score", 19.5)]})
    res = run_text(note, ROSTER, {"maxScore": 20}, "synthetic", make_gw(FakeStt(), llm))
    assert [i["value"] for i in by(res.items, "score", "stu-youssef")] == [19.5]


def test_the_llm_can_be_kept_off_the_gpu(monkeypatch):
    import httpx

    from ai_service.config import load_config
    from ai_service.llm import OllamaLlm

    sent = {}

    class R:
        def raise_for_status(self):
            pass

        def json(self):
            return {"message": {"content": '{"items": [], "unassigned": []}'}}

    def post(url, json=None, timeout=None):
        sent.update(json)
        return R()

    monkeypatch.setattr(httpx, "post", post)
    cfg = load_config({"MODEL_ROUTING_CONFIG": '{"llm": {"model": "qwen3:4b", "device": "cpu"}}'})
    assert (cfg.routing.llm_model, cfg.routing.llm_device) == ("qwen3:4b", "cpu")
    OllamaLlm("http://x", "qwen3:4b", device="cpu").extract("p", {})
    assert sent["options"]["num_gpu"] == 0
    OllamaLlm("http://x", "qwen3:8b").extract("p", {})
    assert "num_gpu" not in sent["options"]


def test_the_fixed_system_prompt_carries_no_names_or_contacts():
    import re

    from ai_service.llm import SYSTEM
    from ai_service.nlp import RosterStudent, find_pii_leaks

    roster = [RosterStudent(r.id, r.display_name) for r in ROSTER]
    arabic = " ، ".join(re.findall(r"[؀-ۿ][؀-ۿ ]*", SYSTEM))
    assert arabic and find_pii_leaks(arabic, roster) == []
    assert not any(r.display_name in SYSTEM for r in ROSTER)


def test_a_misheard_name_is_unknown_with_suggestions_never_attached(make_gw):
    # Whisper wrote "ليلة" for ليلى: stays "Who is this?"; ليلى is offered as a suggestion only.
    roster = [
        pipeline.RosterEntry("s-laila", "ليلى حسن"),
        pipeline.RosterEntry("s-mariam", "مريم علي"),
    ]
    res = run_text("ليلة غابت النهارده", roster, None, "synthetic", make_gw(FakeStt(), None))
    absent = [i for i in res.items if i["field"] == "attendance"]
    assert absent and absent[0]["identity"] == "unknown" and absent[0]["studentId"] is None
    assert absent[0]["suggestions"] == ["s-laila"]
    assert res.prediction("n")["items"] == []  # nothing attached to a student
    assert res.unresolved and res.unresolved[0]["status"] == "who_is_this"


def test_a3_the_llm_may_not_assert_a_fact_where_the_rules_abstained(make_gw):
    # «يوسف لو غاب بكره» is a plan, not today's attendance: the rules abstain, and an LLM "absent"
    # on that token is dropped; the clause is handed to the LLM as "not a fact".
    llm = FakeLlm(
        reply={
            "items": [
                _item("<S1>", "attendance", "absent"),
                _item("<S1>", "observation", "لو غاب بكره هنكلم أهله"),
            ]
        }
    )
    res = run_text(
        "يوسف لو غاب بكره هنكلم أهله", ROSTER, None, "synthetic", make_gw(FakeStt(), llm)
    )
    assert (
        "NOT A FACT FOR THIS SESSION" in llm.prompts[0]
        and "negation_or_hypothetical" in llm.prompts[0]
    )
    assert by(res.items, "attendance") == []
    assert by(res.items, "observation", "stu-youssef")
