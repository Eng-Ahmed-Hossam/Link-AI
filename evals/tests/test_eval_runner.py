from __future__ import annotations

import importlib
import json
from pathlib import Path
from typing import Any

import pytest


def runner() -> Any:
    spec = importlib.util.find_spec("link_eval.runner")
    assert spec is not None, "Eval runner must implement the offline metrics API"
    return importlib.import_module("link_eval.runner")


def gold(note_id: str = "syn-001") -> dict[str, Any]:
    return {
        "id": note_id,
        "data_class": "synthetic",
        "audio_file": f"{note_id}.m4a",
        "recording": {
            "condition": "quiet",
            "speaker": "to-fill",
            "recorded_by": "to-fill",
        },
        "roster": [
            {"id": "s01", "display_name": "أحمد سمير", "nicknames": []},
            {"id": "s02", "display_name": "أحمد سامي", "nicknames": []},
        ],
        "assessment": {"name": "quiz", "max": 20},
        "reference_transcript": "أحمد سمير جاب ١٤ من ٢٠",
        "expected_mentions": [{"text": "أحمد سمير", "status": "unique", "student_id": "s01"}],
        "expected_items": [{"student_id": "s01", "field": "score", "value": 14}],
        "expected_needs_identity": [],
        "expected_unmentioned": ["s02"],
        "hard_case_tags": ["numbers"],
    }


def prediction(note: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": note["id"],
        "model_version": "offline-test",
        "transcript": note["reference_transcript"],
        "mentions": note["expected_mentions"],
        "items": [dict(item, confidence=0.95) for item in note["expected_items"]],
        "needs_identity": [],
        "latency_ms": 100,
    }


def files(
    tmp_path: Path, notes: list[dict[str, Any]], preds: list[dict[str, Any]]
) -> tuple[Path, Path]:
    g, p = tmp_path / "gold", tmp_path / "predictions"
    g.mkdir()
    p.mkdir()
    for note in notes:
        (g / f"{note['id']}.json").write_text(
            json.dumps(note, ensure_ascii=False), encoding="utf-8"
        )
    for pred in preds:
        (p / f"{pred['id']}.pred.json").write_text(
            json.dumps(pred, ensure_ascii=False), encoding="utf-8"
        )
    return g, p


def test_perfect_metrics_and_honest_summary(tmp_path: Path) -> None:
    note = gold()
    g, p = files(tmp_path, [note], [prediction(note)])
    report = runner().evaluate(g, p)
    m = report["metrics"]
    assert m["wer"] == m["cer"] == m["wrong_student_rate"] == 0
    assert m["names"]["precision"] == m["names"]["recall"] == 1
    assert m["fields"]["score"]["f1"] == m["score_exact_match"] == 1
    assert report["sample_sizes"]["speakers"] == 0
    assert report["sample_sizes"]["missing_recordings"] == 1
    out = tmp_path / "report.md"
    runner().write_report(report, out)
    content = out.read_text(encoding="utf-8")
    assert "real teacher speech" in content
    assert "supplied predictions" in content
    assert "PASS" in content
    assert out.with_suffix(".json").exists()
    assert "score_exact_match" in runner().compare_reports(out, out)


def test_missing_prediction_counts_missed_scores_and_transcript(tmp_path: Path) -> None:
    g, p = files(tmp_path, [gold()], [])
    report = runner().evaluate(g, p)
    assert report["metrics"]["wer"] == report["metrics"]["cer"] == 1
    assert report["metrics"]["score_exact_match"] == 0
    assert report["metrics"]["names"]["recall"] == 0
    assert report["metrics"]["latency_p50_ms"] is None
    assert report["missing_prediction_ids"] == ["syn-001"]
    assert report["release_gate"] == "INCOMPLETE"


def test_duplicate_fields_and_mentions_are_occurrence_aware(tmp_path: Path) -> None:
    note = gold()
    pred = prediction(note)
    pred["mentions"] = pred["mentions"] * 2
    pred["items"] = pred["items"] * 2
    g, p = files(tmp_path, [note], [pred])
    m = runner().evaluate(g, p)["metrics"]
    assert m["names"]["precision"] == 0.5
    assert m["names"]["recall"] == 1
    assert m["fields"]["score"]["precision"] == 0.5
    assert m["wrong_student_rate"] == 0.5


@pytest.mark.parametrize("status", ["ambiguous", "unknown"])
def test_unresolved_name_autoassigned_blocks_release(tmp_path: Path, status: str) -> None:
    note = gold()
    note["expected_mentions"] = [{"text": "أحمد", "status": status, "student_id": None}]
    note["expected_items"] = []
    pred = prediction(note)
    pred["mentions"] = [{"text": "أحمد", "status": status, "student_id": "s01"}]
    g, p = files(tmp_path, [note], [pred])
    report = runner().evaluate(g, p)
    assert report["release_gate"] == "FAIL"
    assert report["metrics"]["wrong_student_rate"] == 1
    assert len(report["wrong_student_cases"]) == 1


def test_blank_and_unmentioned_items(tmp_path: Path) -> None:
    note = gold()
    pred = prediction(note)
    pred["items"] += [
        {
            "student_id": "s02",
            "field": "attendance",
            "value": "present",
            "confidence": 0.4,
        }
    ]
    g, p = files(tmp_path, [note], [pred])
    m = runner().evaluate(g, p)["metrics"]
    assert m["abstain_rate"] == 0.5
    assert m["unmentioned_handling_errors"] == 1
    assert m["fields"]["attendance"]["false_positive"] == 1


def test_aggregate_edits_and_observed_latencies_only(tmp_path: Path) -> None:
    a, b = gold(), gold("syn-002")
    a["reference_transcript"], b["reference_transcript"] = "one", "one two three"
    pa, pb = prediction(a), prediction(b)
    pa["transcript"] = "wrong"
    pb.pop("latency_ms")
    g, p = files(tmp_path, [a, b], [pa, pb])
    report = runner().evaluate(g, p)
    assert report["metrics"]["wer"] == 0.25
    assert report["metrics"]["latency_p95_ms"] == 100
    assert report["sample_sizes"]["latency_observations"] == 1
    assert report["breakdowns"]["recording_condition"]["quiet"]["wer"] == 0.25


@pytest.mark.parametrize(
    "mutation",
    ["malformed", "id_mismatch", "extra", "invalid_confidence", "empty_gold"],
)
def test_bad_inputs_fail_early(tmp_path: Path, mutation: str) -> None:
    note = gold()
    g, p = files(tmp_path, [note], [prediction(note)])
    path = p / "syn-001.pred.json"
    if mutation == "malformed":
        path.write_text("{", encoding="utf-8")
    elif mutation == "id_mismatch":
        pred = prediction(note)
        pred["id"] = "elsewhere"
        path.write_text(json.dumps(pred), encoding="utf-8")
    elif mutation == "extra":
        (p / "extra.pred.json").write_text(json.dumps(prediction(gold("extra"))), encoding="utf-8")
    elif mutation == "invalid_confidence":
        pred = prediction(note)
        pred["items"][0]["confidence"] = 1.4
        path.write_text(json.dumps(pred), encoding="utf-8")
    else:
        (g / "syn-001.json").unlink()
    with pytest.raises(ValueError):
        runner().evaluate(g, p)


def test_selftest_checks_deliberately_broken_metrics(tmp_path: Path) -> None:
    g, _ = files(tmp_path, [gold()], [])
    assert runner().selftest(g)["broken_gate"] == "FAIL"


def test_coordinate_label_without_matching_transcript_requires_review(
    tmp_path: Path,
) -> None:
    note = gold()
    note["mention_coordinate_system"] = "reference_clean_v1"
    note["expected_mentions"][0].update(start=0, end=9)
    pred = prediction(note)
    pred["mention_coordinate_system"] = "reference_clean_v1"
    pred["mentions"] = [dict(note["expected_mentions"][0], text="احمد صمير")]
    g, p = files(tmp_path, [note], [pred])
    report = runner().evaluate(g, p)
    assert report["metrics"]["names"]["recall"] == 0
    assert report["release_gate"] == "INCOMPLETE"


def test_speakers_require_recordings_and_latency_interpolates(tmp_path: Path) -> None:
    a, b, c = gold(), gold("syn-002"), gold("syn-003")
    for note, speaker in zip([a, b, c], ["speaker-a", "speaker-a", "to-fill"], strict=True):
        note["recording"]["speaker"] = speaker
    preds = [prediction(note) for note in [a, b, c]]
    for pred, latency in zip(preds, [10, 20, 30], strict=True):
        pred["latency_ms"] = latency
    g, p = files(tmp_path, [a, b, c], preds)
    for note in [a, b, c]:
        (g / note["audio_file"]).write_bytes(b"fixture recording placeholder")
    report = runner().evaluate(g, p)
    assert report["sample_sizes"]["speakers"] == 1
    assert report["sample_sizes"]["missing_recordings"] == 0
    assert report["metrics"]["latency_p50_ms"] == 20
    assert report["metrics"]["latency_p95_ms"] == 29


@pytest.mark.parametrize(
    "bad",
    [
        "negative_latency",
        "nan_latency",
        "duplicate_keys",
        "nonobject",
        "bad_offsets",
        "unexpected_filename",
    ],
)
def test_prediction_validation_rejects_bad_payloads(tmp_path: Path, bad: str) -> None:
    note = gold()
    pred = prediction(note)
    g, p = files(tmp_path, [note], [pred])
    path = p / "syn-001.pred.json"
    if bad == "negative_latency":
        pred["latency_ms"] = -1
    elif bad == "nan_latency":
        pred["latency_ms"] = float("nan")
    elif bad == "bad_offsets":
        pred["mentions"] = [dict(pred["mentions"][0], start=3, end=1)]
    elif bad == "unexpected_filename":
        path.rename(p / "syn-001.json")
    if bad in ("negative_latency", "nan_latency", "bad_offsets"):
        path.write_text(json.dumps(pred), encoding="utf-8")
    elif bad == "duplicate_keys":
        path.write_text('{"id":"syn-001", "id":"syn-001"}', encoding="utf-8")
    elif bad == "nonobject":
        path.write_text("[]", encoding="utf-8")
    with pytest.raises(ValueError):
        runner().evaluate(g, p)


@pytest.mark.parametrize("mode,expected_exit", [("perfect", 0), ("wrong", 1), ("missing", 2)])
def test_cli_run_exit_codes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    mode: str,
    expected_exit: int,
) -> None:
    import sys

    note = gold()
    pred = prediction(note)
    if mode == "wrong":
        pred["mentions"] = [dict(pred["mentions"][0], student_id="s02")]
    g, p = files(tmp_path, [note], [] if mode == "missing" else [pred])
    out = tmp_path / "cli.md"
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "link_eval",
            "run",
            "--gold",
            str(g),
            "--predictions",
            str(p),
            "--out",
            str(out),
        ],
    )
    cli = importlib.import_module("link_eval.__main__")
    assert cli.main() == expected_exit
    assert out.exists()
    assert str(out) in capsys.readouterr().out


@pytest.mark.parametrize("student_id,gate,wrong", [("s01", "PASS", 0), ("s02", "FAIL", 1)])
def test_stt_name_typo_evaluates_identity_independently(
    tmp_path: Path, student_id: str, gate: str, wrong: int
) -> None:
    note = gold()
    pred = prediction(note)
    pred["transcript"] = "أحمد صمير جاب ١٤ من ٢٠"
    pred["mentions"] = [{"text": "أحمد صمير", "status": "unique", "student_id": student_id}]
    g, p = files(tmp_path, [note], [pred])
    report = runner().evaluate(g, p)
    assert report["release_gate"] == gate
    assert report["metrics"]["wrong_student_count"] == wrong
    assert report["metrics"]["names"]["recall"] == (1 if student_id == "s01" else 0)


def test_shortened_name_after_stt_deletion_is_correct_identity(tmp_path: Path) -> None:
    note = gold()
    pred = prediction(note)
    pred["transcript"] = "أحمد جاب ١٤ من ٢٠"
    pred["mentions"] = [{"text": "أحمد", "status": "unique", "student_id": "s01"}]
    g, p = files(tmp_path, [note], [pred])
    report = runner().evaluate(g, p)
    assert report["release_gate"] == "PASS"
    assert report["metrics"]["names"]["recall"] == 1


def test_teacher_occurrence_autoassigned_cannot_match_student_occurrence(
    tmp_path: Path,
) -> None:
    note = gold()
    text = "أحمد سمير حضر. المدرس أحمد سمير شرح."
    second = text.rindex("أحمد سمير")
    note["reference_transcript"] = text
    note["expected_mentions"] = [
        {
            "text": "أحمد سمير",
            "status": "unique",
            "student_id": "s01",
            "start": 0,
            "end": 9,
        },
        {
            "text": "أحمد سمير",
            "status": "unknown",
            "student_id": None,
            "start": second,
            "end": second + 9,
        },
    ]
    pred = prediction(note)
    pred["mentions"] = [
        {
            "text": "أحمد سمير",
            "status": "unique",
            "student_id": "s01",
            "start": second,
            "end": second + 9,
        }
    ]
    g, p = files(tmp_path, [note], [pred])
    report = runner().evaluate(g, p)
    assert report["release_gate"] == "FAIL"
    assert report["metrics"]["wrong_student_rate"] == 1


def test_inserted_name_is_extra_assignment_and_deleted_name_is_missed(
    tmp_path: Path,
) -> None:
    note = gold()
    note["reference_transcript"] = "أحمد سمير غاب. أحمد سامي حضر."
    note["expected_mentions"] = [
        {"text": "أحمد سمير", "status": "unique", "student_id": "s01"},
        {"text": "أحمد سامي", "status": "unique", "student_id": "s02"},
    ]
    pred = prediction(note)
    pred["transcript"] = "أحمد سامي حضر. كريم نادر شرح."
    pred["mentions"] = [
        {"text": "أحمد سامي", "status": "unique", "student_id": "s02"},
        {"text": "كريم نادر", "status": "unique", "student_id": "s01"},
    ]
    g, p = files(tmp_path, [note], [pred])
    report = runner().evaluate(g, p)
    assert report["release_gate"] == "FAIL"
    assert report["metrics"]["wrong_student_count"] == 1
    assert report["metrics"]["names"]["recall"] == 0.5


def test_unlocatable_name_alignment_requires_review(tmp_path: Path) -> None:
    note = gold()
    pred = prediction(note)
    pred["mentions"] = [{"text": "لا يظهر في النص", "status": "unique", "student_id": "s01"}]
    g, p = files(tmp_path, [note], [pred])
    report = runner().evaluate(g, p)
    assert report["release_gate"] == "INCOMPLETE"
    assert report["metrics"]["wrong_student_count"] == 0
    assert report["alignment_uncertain_cases"]


def test_real_run_summary_does_not_call_it_selftest(tmp_path: Path) -> None:
    note = gold()
    note["data_class"] = "real"
    g, p = files(tmp_path, [note], [prediction(note)])
    (g / note["audio_file"]).write_bytes(b"fixture")
    out = tmp_path / "real.md"
    runner().write_report(runner().evaluate(g, p), out)
    summary = out.read_text(encoding="utf-8").splitlines()[0]
    assert "selftest" not in summary
    assert "These reference-text" not in summary


def test_arabic_attached_conjunction_name_span_is_located(tmp_path: Path) -> None:
    note = gold()
    note["reference_transcript"] = "وميمي جابت ١٤ من ٢٠"
    note["expected_mentions"] = [
        {"text": "ميمي", "start": 1, "end": 5, "status": "unique", "student_id": "s01"}
    ]
    g, p = files(tmp_path, [note], [prediction(note)])
    assert runner().evaluate(g, p)["release_gate"] == "PASS"


def test_items_cannot_attach_to_student_outside_roster(tmp_path: Path) -> None:
    note = gold()
    pred = prediction(note)
    pred["items"][0]["student_id"] = "s99"
    g, p = files(tmp_path, [note], [pred])
    with pytest.raises(ValueError, match="roster"):
        runner().evaluate(g, p)


def test_item_autoassigned_without_unique_gold_identity_blocks_release(
    tmp_path: Path,
) -> None:
    note = gold()
    note["reference_transcript"] = "أحمد غاب"
    note["expected_mentions"] = [{"text": "أحمد", "status": "ambiguous", "student_id": None}]
    note["expected_items"] = []
    pred = prediction(note)
    pred["items"] = [
        {
            "student_id": "s01",
            "field": "attendance",
            "value": "absent",
            "confidence": 0.95,
        }
    ]
    g, p = files(tmp_path, [note], [pred])
    report = runner().evaluate(g, p)
    assert report["release_gate"] == "FAIL"
    assert report["unsafe_item_identity_cases"]


@pytest.mark.parametrize("offsets", [None, (20, 29)])
def test_repeated_name_with_missing_or_wrong_transcript_offsets_cannot_pass(
    tmp_path: Path, offsets
) -> None:
    note = gold()
    text = "أحمد سمير حضر. المدرس أحمد سمير شرح."
    second = text.rindex("أحمد سمير")
    note["reference_transcript"] = text
    note["expected_mentions"] = [
        {"text": "أحمد سمير", "status": "unique", "student_id": "s01", "start": 0, "end": 9},
        {
            "text": "أحمد سمير",
            "status": "unknown",
            "student_id": None,
            "start": second,
            "end": second + 9,
        },
    ]
    pred = prediction(note)
    mention = {"text": "أحمد سمير", "status": "unique", "student_id": "s01"}
    if offsets is not None:
        mention.update(start=offsets[0], end=offsets[1])
    pred["mentions"] = [mention]
    g, p = files(tmp_path, [note], [pred])
    report = runner().evaluate(g, p)
    assert report["release_gate"] == "INCOMPLETE"
    assert report["metrics"]["names"]["true_positive"] == 0
    assert report["metrics"]["alignment_uncertain_count"] == 1


def test_mixed_gold_offsets_do_not_overwrite_valid_occurrence(tmp_path: Path) -> None:
    note = gold()
    note["reference_transcript"] = "أحمد سمير حضر. المدرس أحمد سمير شرح."
    note["expected_mentions"] = [
        {"text": "أحمد سمير", "status": "unique", "student_id": "s01", "start": 0, "end": 9},
        {"text": "أحمد سمير", "status": "unknown", "student_id": None},
    ]
    pred = prediction(note)
    pred["mentions"] = [dict(note["expected_mentions"][0])]
    g, p = files(tmp_path, [note], [pred])
    report = runner().evaluate(g, p)
    assert report["metrics"]["names"]["true_positive"] == 1
    assert report["metrics"]["wrong_student_count"] == 0
