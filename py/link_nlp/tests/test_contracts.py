from pathlib import Path

import pytest

from link_nlp.roster import NameMention
from link_nlp.rules import rule_extract
from link_nlp.schema import confidence_band, validate_extraction
from link_nlp.tokens import detokenise_items, tokenise


def item(student="<S1>", field="score", value=21):
    return {
        "student": student,
        "field": field,
        "value": value,
        "confidence": 0.93,
        "span": {"start": 0, "end": 12},
    }


@pytest.mark.parametrize(
    ("c", "band"),
    [
        (0, "blank"),
        (0.59, "blank"),
        (0.6, "check"),
        (0.849, "check"),
        (0.85, "prefill"),
        (1, "prefill"),
    ],
)
def test_confidence_boundaries(c, band):
    assert confidence_band(c) == band


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("attendance", "missing"),
        ("participation", "great"),
        ("observation_tag", "bad"),
        ("late_minutes", -1),
        ("score", "14"),
        ("observation", 42),
        ("homework", "invented"),
    ],
)
def test_invalid_field_values_rejected(field, value):
    assert not validate_extraction({"items": [item(field=field, value=value)]}, {"<S1>"}, 20).valid


def test_wire_schema_range_metadata_and_topic_drop():
    result = validate_extraction(
        {"items": [item(), item(field="topic", value="sign rules")]}, {"<S1>"}, 20
    )
    assert result.valid
    assert result.items[0]["value"] == 21
    assert result.out_of_range == (0,)
    assert len(result.items) == 1
    assert result.dropped_topics == 1
    assert "out_of_range" not in result.items[0]


def test_invented_token_and_bad_span_rejected():
    assert not validate_extraction({"items": [item("<S99>")]}, {"<S1>"}, 20).valid
    bad = item()
    bad["span"] = {"start": 5, "end": 2}
    assert not validate_extraction({"items": [bad]}, {"<S1>"}, 20).valid


def test_schema_exact_copy():
    import json
    import re

    from link_nlp.schema import VOICE_EXTRACTION_SCHEMA

    spec = (Path(__file__).parents[3] / "docs/09-ai-voice-pipeline.md").read_text(encoding="utf-8")
    assert VOICE_EXTRACTION_SCHEMA == json.loads(
        re.search(r"```json\n(.*?)\n```", spec, re.DOTALL)[1]
    )


def test_all_identity_routes_and_invented_token():
    text = "أحمد مريم كريم"
    mentions = [
        NameMention(0, 4, "أحمد", "unique", "s1", (("s1", 1.0),)),
        NameMention(5, 9, "مريم", "ambiguous", None, (("s2", 1.0), ("s3", 1.0))),
        NameMention(10, 14, "كريم", "unknown", None, ()),
    ]
    tok = tokenise(text, mentions)
    assert tok.text == "<S1> <A1> <U1>"
    assert tok.clean_span(0, 4) == (0, 4)
    resolved = detokenise_items([item(t) for t in ["<S1>", "<A1>", "<U1>", "<S9>"]], tok.token_map)
    assert [r.status for r in resolved] == ["resolved", "needs_identity", "who_is_this", "rejected"]
    assert [r.student_id for r in resolved] == ["s1", None, None, None]


def test_tokenise_rejects_forged_spans_and_token_injection():
    with pytest.raises(ValueError):
        tokenise("أحمد", [NameMention(0, 2, "أحمد", "unique", "s1", ())])
    with pytest.raises(ValueError):
        tokenise("نص <S1>", [])


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("<S1> مجاش", [("attendance", "absent")]),
        ("<S1> ماجاتش", [("attendance", "absent")]),
        ("<S1> مكانش موجود", [("attendance", "absent")]),
        ("<S1> اتأخر 15 min", [("attendance", "late"), ("late_minutes", 15)]),
        ("<S1> جه متأخر ربع ساعة", [("attendance", "late"), ("late_minutes", 15)]),
        ("<S1> جاب 21/20", [("score", 21)]),
        ("<S1> خد 12 من 20", [("score", 12)]),
        ("<S1> مشارك كويس", [("participation", "high")]),
        ("<S1> ساكت خالص", [("participation", "low")]),
        ("<S1> مش غايب", []),
        ("<S1> لو غاب", []),
        ("<S1> مجاش الحصة اللي فاتت", []),
        ("<S1> مش ساكت خالص", []),
        ("راجعنا الدرس من غير أسماء", []),
    ],
)
def test_explicit_rules_only(text, expected):
    items = rule_extract(text, 20)
    assert [(x["field"], x["value"]) for x in items] == expected
    assert validate_extraction({"items": items}, {"<S1>"}, 20).valid


def test_exception_only_named_and_out_of_range_not_capped():
    items = rule_extract("كلهم حضروا ما عدا <S1> و <A1>، <S2> جاب 21/20", 20)
    assert [(x["student"], x["field"], x["value"]) for x in items] == [
        ("<S1>", "attendance", "absent"),
        ("<A1>", "attendance", "absent"),
        ("<S2>", "score", 21),
    ]
    assert items[-1].out_of_range


def test_no_fact_inheritance_across_names_or_self_correction():
    assert rule_extract("<S1>، <S2> جاب 14/20", 20)[0]["student"] == "<S2>"
    assert rule_extract("<A1> غابت، لا قصدي <S1> غابت", 20) == [
        rule_extract("<S1> غابت", 20)[0] | {"span": {"start": 19, "end": 28}}
    ]


@pytest.mark.parametrize("text", ["<S1> جاب 14.5/20", "<S1> جاب اربعتاشر ونص من عشرين"])
def test_fractional_score_is_not_a_sentence_boundary(text):
    assert [(x["field"], x["value"]) for x in rule_extract(text, 20)] == [("score", 14.5)]


@pytest.mark.parametrize(
    "text", ["<S1> هيغيب بكرة", "<S1> غاب الاسبوع اللي فات", "<S1> غايب الحصة الجاية"]
)
def test_future_and_historical_attendance_is_not_current(text):
    assert rule_extract(text, 20) == []


def test_source_offsets_survive_cleaning_and_token_lengths():
    from link_nlp.normalize import clean_transcript
    from link_nlp.roster import RosterStudent, find_name_mentions

    original = "أحمد سمير جاب اتناشر من عشرين"
    cleaned = clean_transcript(original)
    tok = tokenise(
        cleaned.clean, find_name_mentions(cleaned.clean, [RosterStudent("s1", "أحمد سمير")])
    )
    extracted = rule_extract(tok.text, 20)[0]
    start, end = tok.clean_span(**extracted["span"])
    start, end = cleaned.display_span(start, end)
    assert cleaned.display[start:end] == original


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf")])
def test_nonfinite_values_rejected(value):
    assert not validate_extraction({"items": [item(value=value)]}, {"<S1>"}, 20).valid
    with pytest.raises(ValueError):
        confidence_band(value)


@pytest.mark.parametrize(
    "text",
    [
        "لو <S1> غاب",
        "امبارح <S1> غاب",
        "<S1> حضر ومش ساكت خالص",
        "<S1> قال صاحبه غاب",
        "<S1> غاب، لا ده حضر",
    ],
)
def test_context_before_name_and_attached_negation_abstain(text):
    assert rule_extract(text, 20) == []


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("<S1> ما كانش موجود", [("attendance", "absent")]),
        ("<S1> ما كانتش موجودة", [("attendance", "absent")]),
        ("<S1> مكانش مشارك كويس", []),
        ("<S1> مكانش ساكت خالص", []),
        ("<S1> ما كانش متأخر", []),
    ],
)
def test_split_and_fused_egyptian_negation_do_not_become_positive_facts(text, expected):
    assert [(x["field"], x["value"]) for x in rule_extract(text, 20)] == expected
