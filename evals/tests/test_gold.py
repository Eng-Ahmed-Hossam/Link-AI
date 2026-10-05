"""Independent integrity checks for the human-authored, synthetic evaluation labels.

These checks deliberately never call name matching or rule extraction to derive gold.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

GOLD = Path(__file__).resolve().parents[1] / "gold"


def cases() -> list[dict[str, Any]]:
    return [
        json.loads(path.read_text(encoding="utf-8"))
        for path in sorted((GOLD / "synthetic").glob("*.json"))
    ]


def test_gold_has_thirty_independent_reference_notes() -> None:
    notes = cases()
    assert len(notes) == 30
    assert [note["id"] for note in notes] == [f"syn-{number:03d}" for number in range(1, 31)]
    assert len({note["reference_transcript"] for note in notes}) == 30
    assert {note["recording"]["condition"] for note in notes} == {
        "quiet",
        "classroom_noise",
        "fan",
        "street",
    }
    assert {note["recording"]["delivery"] for note in notes} >= {
        "fast",
        "slow",
        "natural",
    }
    for note in notes:
        assert note["data_class"] == "synthetic"
        assert 55 <= len(note["reference_transcript"].split()) <= 125, note["id"]
        assert note["annotation"]["span_basis"] == "reference_transcript"
        assert note["annotation"]["method"] == "independent_hand_authored"
        assert 20 <= note["recording"]["target_seconds"] <= 60


def test_reference_identities_spans_and_unmentioned_are_consistent() -> None:
    notes = cases()
    assert notes, "gold references are missing"
    roster = notes[0]["roster"]
    assert len(roster) == 18
    roster_ids = {student["id"] for student in roster}
    assert len(roster_ids) == 18
    assert {student["display_name"] for student in roster} >= {
        "أحمد سمير",
        "أحمد سامي",
        "مريم حسن",
        "مريم حسين",
    }
    for note in notes:
        assert note["roster"] == roster
        transcript = note["reference_transcript"]
        previous_end = 0
        mentioned_ids: set[str] = set()
        safe_names: dict[str, list[str]] = {}
        for student in roster:
            for name in [student["display_name"], *student["nicknames"]]:
                safe_names.setdefault(name, []).append(student["id"])
        for mention in note["expected_mentions"]:
            assert previous_end <= mention["start"] < mention["end"] <= len(transcript)
            assert transcript[mention["start"] : mention["end"]] == mention["text"]
            previous_end = mention["end"]
            candidates = mention["candidates"]
            assert len(candidates) == len(set(candidates))
            assert set(candidates) <= roster_ids
            mentioned_ids.update(candidates)
            if mention["status"] == "unique":
                # Any accidentally fuzzy or guessed label is an invalid gold label.
                assert safe_names.get(mention["text"]) == [mention["student_id"]]
                assert candidates == [mention["student_id"]]
            elif mention["status"] == "ambiguous":
                assert mention["student_id"] is None
                assert len(candidates) >= 2
            else:
                assert mention["status"] == "unknown"
                assert mention["student_id"] is None
                assert candidates == []
        # A missing annotation must not quietly turn a spoken roster name into unmentioned.
        for name in safe_names:
            for occurrence in re.finditer(r"(?<!\w)" + re.escape(name) + r"(?!\w)", transcript):
                assert any(
                    m["start"] == occurrence.start() and m["end"] == occurrence.end()
                    for m in note["expected_mentions"]
                ), (note["id"], name)
        assert set(note["expected_unmentioned"]) == roster_ids - mentioned_ids
        unique_ids = {m["student_id"] for m in note["expected_mentions"] if m["status"] == "unique"}
        for item in note["expected_items"]:
            assert item["student_id"] in unique_ids
        for unresolved in note["expected_needs_identity"]:
            assert any(
                m["text"] == unresolved["text"]
                and m["status"] != "unique"
                and m["candidates"] == unresolved["candidates"]
                for m in note["expected_mentions"]
            )
            assert "student_id" not in unresolved


def test_gold_items_obey_wire_schema_and_semantic_field_values() -> None:
    from jsonschema import Draft202012Validator

    from link_nlp.schema import VOICE_EXTRACTION_SCHEMA, validate_extraction

    notes = cases()
    assert notes, "gold references are missing"
    validator = Draft202012Validator(VOICE_EXTRACTION_SCHEMA)
    allowed = {
        "attendance": {"present", "absent", "late"},
        "participation": {"low", "normal", "high"},
        "observation_tag": {
            "understanding",
            "needs_revisit",
            "behaviour",
            "positive",
            "absence_context",
        },
    }
    for note in notes:
        wire_items = []
        student_tokens = {student["id"]: f"<S{n}>" for n, student in enumerate(note["roster"], 1)}
        for item in note["expected_items"]:
            field, value = item["field"], item["value"]
            if field in allowed:
                assert value in allowed[field]
            if field in {"score", "late_minutes"}:
                assert isinstance(value, (int, float)) and not isinstance(value, bool)
                if field == "late_minutes":
                    assert value >= 0 and int(value) == value
            if field == "score":
                assert bool(item.get("out_of_range", False)) == (
                    value < 0 or value > note["assessment"]["max"]
                )
            wire_items.append(
                {
                    "student": student_tokens[item["student_id"]],
                    "field": field,
                    "value": value,
                    "confidence": 1.0,
                    "span": {"start": 0, "end": len(note["reference_transcript"])},
                }
            )
        assert not list(validator.iter_errors({"items": wire_items})), note["id"]
        result = validate_extraction(
            {"items": wire_items},
            set(student_tokens.values()),
            note["assessment"]["max"],
        )
        assert result.valid, (note["id"], result.errors)
        assert result.out_of_range == tuple(
            index
            for index, item in enumerate(note["expected_items"])
            if item.get("out_of_range", False)
        )


@pytest.mark.parametrize(
    "case_id,text,candidates",
    [
        ("syn-007", "أحمد", ["s01", "s02"]),
        ("syn-008", "مريم", ["s03", "s04"]),
        ("syn-009", "كريم", []),
    ],
)
def test_identity_hard_cases_remain_unassigned(
    case_id: str, text: str, candidates: list[str]
) -> None:
    note = next(note for note in cases() if note["id"] == case_id)
    assert any(
        item["text"] == text and item["candidates"] == candidates
        for item in note["expected_needs_identity"]
    )
    assert all(item["student_id"] not in candidates for item in note["expected_items"])


def test_no_name_note_leaves_every_student_not_recorded() -> None:
    note = next(note for note in cases() if note["id"] == "syn-012")
    assert note["expected_mentions"] == []
    assert note["expected_items"] == []
    assert note["expected_needs_identity"] == []
    assert len(note["expected_unmentioned"]) == 18


def test_explicit_corrections_use_only_final_fact() -> None:
    corrected_name = next(note for note in cases() if note["id"] == "syn-011")
    assert corrected_name["expected_items"] == [
        {"student_id": "s04", "field": "attendance", "value": "absent"}
    ]
    assert corrected_name["expected_needs_identity"] == []
    corrected_attendance = next(note for note in cases() if note["id"] == "syn-025")
    assert corrected_attendance["expected_items"] == [
        {"student_id": "s01", "field": "attendance", "value": "present"}
    ]


def test_unknown_adults_are_privacy_mentions_without_student_facts() -> None:
    note = next(note for note in cases() if note["id"] == "syn-015")
    assert [(m["text"], m["status"]) for m in note["expected_mentions"]] == [
        ("شريف", "unknown"),
        ("مريم حسن", "unique"),
        ("داليا", "unknown"),
        ("مريم حسن", "unique"),
    ]
    assert note["expected_needs_identity"] == []
    assert note["expected_items"] == [{"student_id": "s03", "field": "score", "value": 18}]
