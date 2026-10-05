"""The voice pipeline with fake STT/LLM: never guess a student (AI-02), no name reaches the LLM
(§2.4), invalid LLM output falls back to rule items (§9), bands (OD-36), eval prediction shape."""

from __future__ import annotations

from conftest import ROSTER, FakeLlm, FakeStt

from ai_service.pipeline import run_audio, run_text

NOTE = "مريم غابت النهارده، وأحمد جاب ١٤ من ٢٠، ويوسف اتأخر ١٠ دقايق. نراجع الكسور الحصة الجاية"


def _item(student, field, value, conf=0.9):
    return {
        "student": student,
        "field": field,
        "value": value,
        "confidence": conf,
        "span": {"start": 0, "end": 1},
    }


def by(items, field, student=None):
    return [
        i for i in items if i["field"] == field and (student is None or i["studentId"] == student)
    ]


def test_rules_attach_only_unique_matches_and_ask_for_ambiguous(make_gw):
    res = run_audio(
        b"a",
        ROSTER,
        {"title": "كويز", "maxScore": 20},
        "synthetic",
        make_gw(FakeStt(NOTE), FakeLlm()),
    )
    absent = by(res.items, "attendance", "stu-mariam")
    assert absent and absent[0]["value"] == "absent" and absent[0]["identity"] == "matched"
    score = by(res.items, "score")
    assert len(score) == 1
    assert score[0]["identity"] == "ambiguous"
    assert score[0]["studentId"] is None  # never guessed
    assert set(score[0]["candidates"]) == {"stu-ahmed-s", "stu-ahmed-m"}
    assert score[0]["value"] == 14
    assert by(res.items, "late_minutes", "stu-youssef")[0]["value"] == 10
    assert res.needs_identity is True
    assert "stu-laila" in res.unmentioned and "stu-mariam" not in res.unmentioned
    assert "مريم غابت" in absent[0]["sourceText"]


def test_no_person_name_reaches_the_llm(make_gw):
    llm = FakeLlm()
    run_text(NOTE, ROSTER, None, "synthetic", make_gw(FakeStt(), llm))
    assert llm.prompts, "the LLM step ran"
    for name in ("مريم", "يوسف", "أحمد"):
        assert name not in llm.prompts[0]
    assert "<S1>" in llm.prompts[0]


def test_llm_items_are_validated_and_rules_win(make_gw):
    def reply(prompt):
        return {
            "items": [
                _item("<S1>", "observation", "نراجع الكسور", 0.8),
                _item("<S1>", "attendance", "present", 0.99),  # rules said absent
            ],
            "unassigned": ["نراجع الكسور الحصة الجاية"],
        }

    res = run_text(NOTE, ROSTER, None, "synthetic", make_gw(FakeStt(), FakeLlm(reply)))
    assert [a["value"] for a in by(res.items, "attendance", "stu-mariam")] == ["absent"]
    assert by(res.items, "observation", "stu-mariam")[0]["value"] == "نراجع الكسور"
    group = [i for i in res.items if i["identity"] == "group"]
    assert group and group[0]["value"] == "نراجع الكسور الحصة الجاية"
    assert res.llm_used is True


def test_one_invalid_llm_item_rejects_the_whole_reply(make_gw):
    # link_nlp's validate_extraction is all-or-nothing: an invented token or a bad enum makes the
    # reply invalid; it is retried once, then the note keeps the rule items only (docs/09 §9).
    llm = FakeLlm(
        reply={
            "items": [
                _item("<S1>", "observation", "نراجع الكسور", 0.8),
                _item("<S9>", "score", 3),  # invented token
                _item("<S2>", "participation", "excellent"),  # bad enum
            ]
        }
    )
    res = run_text(NOTE, ROSTER, None, "synthetic", make_gw(FakeStt(), llm))
    assert len(llm.prompts) == 2 and res.llm_used is False
    assert not by(res.items, "observation")
    assert by(res.items, "attendance", "stu-mariam")


def test_invalid_llm_output_twice_falls_back_to_rule_items(make_gw):
    llm = FakeLlm(reply={"items": [{"oops": 1}]})
    res = run_text(NOTE, ROSTER, None, "synthetic", make_gw(FakeStt(), llm))
    assert res.llm_used is False and res.llm_error
    assert len(llm.prompts) >= 2  # retried once
    assert by(res.items, "attendance", "stu-mariam")  # rules still there


def test_an_llm_timeout_is_not_retried_and_the_rules_stay(make_gw):
    # B3: on a CPU-only laptop the LLM can be slow; one budget for the whole step, no retries
    # after a timeout (2 × 2 retries × 60 s once pushed a note past the 3-minute limit).
    llm = FakeLlm(reply=TimeoutError("no answer within 60 s"))
    res = run_text(NOTE, ROSTER, None, "synthetic", make_gw(FakeStt(), llm))
    assert len(llm.prompts) == 1
    assert res.llm_used is False and "TimeoutError" in (res.llm_error or "")
    assert by(res.items, "attendance", "stu-mariam")


def test_a_used_up_llm_budget_skips_the_call(make_gw, cfg):
    cfg.llm_budget_s = 0
    llm = FakeLlm()
    res = run_text(NOTE, ROSTER, None, "synthetic", make_gw(FakeStt(), llm))
    assert llm.prompts == [] and res.llm_used is False
    assert by(res.items, "attendance", "stu-mariam")


def test_score_above_the_maximum_is_flagged_not_capped(make_gw):
    res = run_text(
        "يوسف جاب ٢٥ من ٢٠", ROSTER, {"maxScore": 20}, "synthetic", make_gw(FakeStt(), None)
    )
    s = by(res.items, "score", "stu-youssef")[0]
    assert s["value"] == 25 and s["outOfRange"] is True


def test_bands_and_the_eval_prediction_shape(make_gw, cfg):
    cfg.score_prefill = True  # the demo: bands straight from link_nlp
    res = run_text(NOTE, ROSTER, None, "synthetic", make_gw(FakeStt(), None))
    for it in res.items:
        c = it["confidence"]
        assert it["band"] == ("high" if c >= 0.85 else "medium" if c >= 0.6 else "low")
    p = res.prediction("note-07")
    assert set(p) == {
        "id",
        "model_version",
        "transcript",
        "mentions",
        "items",
        "needs_identity",
        "latency_ms",
    }
    assert all(
        set(i) == {"student_id", "field", "value", "confidence", "out_of_range"} for i in p["items"]
    )
    assert all(i["student_id"] for i in p["items"])  # resolved only
    # Unresolved items go to needs_identity, never with a student id.
    assert p["needs_identity"] and all(u["student_id"] is None for u in p["needs_identity"])
    assert p["id"] == "note-07" and isinstance(p["latency_ms"], int)


def test_llm_items_must_be_grounded_in_the_note(make_gw):
    """B1 guards seen on a real run of qwen3:8b: invented scores, invented observations, echoed
    prompt text and tokens in whole-class lines are dropped; LLM confidence is capped at "check"."""

    def reply(prompt):
        return {
            "items": [
                {
                    "student": "<S1>",
                    "field": "score",
                    "value": 0,
                    "confidence": 1.0,  # not said
                    "span": {"start": 0, "end": 4},
                },
                {
                    "student": "<S1>",
                    "field": "observation",
                    "value": "لم يشارك في الدرس",  # invented
                    "confidence": 1.0,
                    "span": {"start": 0, "end": 4},
                },
                {
                    "student": "<S2>",
                    "field": "observation",
                    "value": "نراجع الكسور",  # said
                    "confidence": 1.0,
                    "span": {"start": 0, "end": 4},
                },
                {
                    "student": "<S2>",
                    "field": "observation",
                    "value": "نراجع الكسور",  # duplicate
                    "confidence": 1.0,
                    "span": {"start": 0, "end": 4},
                },
            ],
            "unassigned": [
                "كويز, maximum 20",
                "كل الطلبة حضروا ما عدا <S1>",
                "نراجع الكسور الحصة الجاية",
            ],
        }

    res = run_text(NOTE, ROSTER, {"maxScore": 20}, "synthetic", make_gw(FakeStt(), FakeLlm(reply)))
    llm_obs = [i for i in res.items if i["field"] == "observation" and i["identity"] != "group"]
    assert [i["value"] for i in llm_obs] == ["نراجع الكسور"]
    assert llm_obs[0]["band"] == "medium"  # LLM-only: "check", never pre-filled as high
    assert not [i for i in res.items if i["field"] == "score" and i["value"] == 0]
    assert [i["value"] for i in res.items if i["identity"] == "group"] == [
        "نراجع الكسور الحصة الجاية"
    ]


def test_present_must_be_said_and_a_one_word_class_line_is_dropped(make_gw):
    # Seen with qwen3:8b: "عمر ونور حلوا كل الواجب" → both "present" (homework is not attendance);
    # a misheard word ("ماجاشا،") returned as a whole-class observation.
    note = "يوسف حضر بدري. ليلى حلت كل الواجب. ماجاشا، الحصة الجاية نراجع الكسور"

    def reply(prompt):
        return {
            "items": [
                _item("<S1>", "attendance", "present"),
                _item("<S2>", "attendance", "present"),
            ],
            "unassigned": ["ماجاشا،", "الحصة الجاية نراجع الكسور"],
        }

    res = run_text(note, ROSTER, None, "synthetic", make_gw(FakeStt(), FakeLlm(reply=reply)))
    present = {i["studentId"] for i in by(res.items, "attendance") if i["value"] == "present"}
    assert present == {"stu-youssef"}
    group = [i["value"] for i in res.items if i["identity"] == "group"]
    assert group == ["الحصة الجاية نراجع الكسور"]


def test_one_student_twice_rules_win_and_llm_disagreements_cancel(make_gw):
    # One name said twice gets two tokens (<S1>, <S2> both مريم).
    note = "مريم غابت. ليلى ساكتة. مريم كانت مركزة. ليلى بتشارك"

    def reply(prompt):
        return {
            "items": [
                _item("<S1>", "attendance", "present"),  # rules said absent: rules win
                _item("<S2>", "participation", "low"),
                _item("<S4>", "participation", "high"),  # same student, different value
            ]
        }

    res = run_text(note, ROSTER, None, "synthetic", make_gw(FakeStt(), FakeLlm(reply=reply)))
    att = by(res.items, "attendance", "stu-mariam")
    assert [a["value"] for a in att] == ["absent"]
    assert by(res.items, "participation", "stu-laila") == []


def test_llm_spans_are_not_trusted(make_gw):
    # Seen on the real stack: the LLM pointed an item for يوسف at the clause before his name.
    note = "مريم غابت أنها رده، ويوسف شارك كتير النهارده."

    def reply(prompt):
        item = _item("<S2>", "participation", "high")
        return {"items": [{**item, "span": {"start": 2, "end": 9}}]}

    res = run_text(note, ROSTER, None, "synthetic", make_gw(FakeStt(), FakeLlm(reply=reply)))
    p = by(res.items, "participation", "stu-youssef")
    assert p and p[0]["sourceText"].startswith("ويوسف شارك كتير")
