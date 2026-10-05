"""ai-service × link_nlp integration: the pipeline order, the leak check, contact redaction, the
rules-win merge and the pilot's score band (docs/ai/link-nlp.md; Part C §2)."""

from __future__ import annotations

import json

from conftest import ROSTER, FakeLlm, FakeStt

from ai_service import pipeline
from ai_service.pipeline import run_text
from ai_service.redact import find_leaks, redact_contacts

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
    for name in ("clean_transcript", "find_name_mentions", "tokenise", "rule_extract",
                 "validate_extraction", "detokenise_items", "confidence_band"):  # fmt: skip
        monkeypatch.setattr(nlp, name, spy(name, getattr(nlp, name)))
    monkeypatch.setattr(pipeline, "redact_contacts", spy("redact_contacts", redact_contacts))
    monkeypatch.setattr(pipeline, "find_leaks", spy("find_leaks", find_leaks))
    gw = make_gw(FakeStt(), FakeLlm(reply={"items": []}))
    monkeypatch.setattr(gw, "extract", spy("llm", gw.extract))
    run_text(NOTE, ROSTER, {"maxScore": 20}, "synthetic", gw)

    first = [c for i, c in enumerate(calls) if c not in calls[:i]]
    assert first == [
        "clean_transcript",
        "find_name_mentions",
        "tokenise",
        "redact_contacts",
        "find_leaks",
        "rule_extract",
        "validate_extraction",  # the rule items
        "llm",
        "detokenise_items",
        "confidence_band",
    ]
    # The LLM reply is validated after the call and before detokenising.
    assert calls.index("llm") < len(calls) - 1 - calls[::-1].index("validate_extraction")
    assert calls[::-1].index("validate_extraction") > calls[::-1].index("detokenise_items")


def test_contacts_are_redacted_before_the_llm_and_scores_survive():
    text, n = redact_contacts("<S1> جاب 12/20، رقم ولي الأمر 0101 234 5678 والإيميل a.b@x.com")
    assert n == 2
    assert "12/20" in text and "0101" not in text and "@" not in text
    assert len(text) == len("<S1> جاب 12/20، رقم ولي الأمر 0101 234 5678 والإيميل a.b@x.com")


def test_a_phone_number_never_reaches_the_llm(make_gw):
    llm = FakeLlm()
    run_text(
        "مريم غابت، وولي أمرها قال كلموني على 01012345678",
        ROSTER, None, "synthetic", make_gw(FakeStt(), llm),
    )  # fmt: skip
    assert llm.prompts and "01012345678" not in llm.prompts[0] and "###########" in llm.prompts[0]


def test_a_name_left_in_the_text_skips_the_llm_and_keeps_the_rules(make_gw, cfg, monkeypatch):
    # The matcher is bounded (docs/ai/link-nlp.md): simulate it missing يوسف. The gate must catch
    # the name, skip the LLM, keep the rule results and log the event without any text.
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
    assert event and event[0]["leaks"] >= 1
    raw = cfg.usage_log.read_text("utf-8")
    assert "يوسف" not in raw and "مريم" not in raw


def test_leak_check_counts_names_with_attached_conjunctions():
    from ai_service.nlp import RosterStudent

    roster = [RosterStudent("s1", "مريم حسن"), RosterStudent("s2", "يوسف", ("جو",))]
    assert find_leaks("<S1> غابت وحسن جه", roster, []) == 1
    assert find_leaks("ويوسف اتأخر", roster, []) == 1
    assert find_leaks("<S1> غابت و<S2> اتأخر", roster, []) == 0


def test_rules_win_on_attendance_late_and_scores_for_the_same_student(make_gw):
    # يوسف is said three times (three tokens). The LLM disagrees with the rules on attendance, minutes
    # and the score; its participation (not a rule field) is kept.
    note = "يوسف اتأخر ١٠ دقايق. يوسف جاب ١٤ من ٢٠. يوسف كان مشارك جدا"

    def reply(prompt):
        return {
            "items": [
                _item("<S3>", "attendance", "present"),
                _item("<S2>", "late_minutes", 14),
                _item("<S3>", "score", 10),
                _item("<S3>", "participation", "high", 0.8),
            ]
        }

    res = run_text(note, ROSTER, {"maxScore": 20}, "synthetic", make_gw(FakeStt(), FakeLlm(reply)))
    assert [i["value"] for i in by(res.items, "attendance", "stu-youssef")] == ["late"]
    assert [i["value"] for i in by(res.items, "late_minutes", "stu-youssef")] == [10]
    assert [i["value"] for i in by(res.items, "score", "stu-youssef")] == [14]
    assert [i["value"] for i in by(res.items, "participation", "stu-youssef")] == ["high"]


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
