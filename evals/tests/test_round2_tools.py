from __future__ import annotations

import csv
import json
from pathlib import Path

import pytest
from link_eval.calibration import calibrate
from link_eval.gold_lock import verify_lock, write_lock
from link_eval.review import apply_review


def _note(text: str = "أحمد سمير جاب ١٤ من ٢٠") -> dict[str, object]:
    return {
        "id": "syn-001",
        "data_class": "synthetic",
        "audio_file": "syn-001.m4a",
        "recording": {"condition": "quiet", "speaker": "to-fill"},
        "roster": [{"id": "s1", "display_name": "أحمد سمير", "nicknames": []}],
        "assessment": {"name": "quiz", "max": 20},
        "reference_transcript": text,
        "expected_mentions": [
            {"start": 0, "end": 9, "text": "أحمد سمير", "status": "unique", "student_id": "s1"}
        ],
        "expected_items": [{"student_id": "s1", "field": "score", "value": 14}],
        "expected_needs_identity": [],
        "expected_unmentioned": [],
        "hard_case_tags": ["score"],
        "annotation": {"review_status": "pending"},
    }


def test_gold_lock_detects_drift(tmp_path: Path) -> None:
    (tmp_path / "case.txt").write_text("one", encoding="utf-8")
    assert write_lock(tmp_path) == 1
    verify_lock(tmp_path)
    (tmp_path / "case.txt").write_text("two", encoding="utf-8")
    with pytest.raises(ValueError, match="case.txt"):
        verify_lock(tmp_path)


def test_calibration_is_report_only(tmp_path: Path) -> None:
    gold, predictions = tmp_path / "gold", tmp_path / "predictions"
    gold.mkdir()
    predictions.mkdir()
    note = _note()
    (gold / "syn-001.json").write_text(json.dumps(note, ensure_ascii=False), encoding="utf-8")
    prediction = {
        "id": "syn-001", "model_version": "test", "transcript": note["reference_transcript"],
        "mentions": note["expected_mentions"],
        "items": [{"student_id": "s1", "field": "score", "value": 14, "confidence": 0.91}],
        "needs_identity": [],
    }
    (predictions / "syn-001.pred.json").write_text(json.dumps(prediction, ensure_ascii=False), encoding="utf-8")
    report = calibrate(predictions, gold)
    assert "[0.9, 1.0]" in report
    assert "report-only" in report


def test_apply_review_updates_offsets_and_bumps_lock(tmp_path: Path) -> None:
    synthetic = tmp_path / "synthetic"
    synthetic.mkdir()
    note = _note()
    path = synthetic / "syn-001.json"
    path.write_text(json.dumps(note, ensure_ascii=False), encoding="utf-8")
    (tmp_path / "SCRIPTS.md").write_text(str(note["reference_transcript"]), encoding="utf-8")
    review = tmp_path / "REVIEW.csv"
    with review.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["id", "script_text", "notes_for_reviewer", "reviewed_text", "approved"])
        writer.writerow(["syn-001", note["reference_transcript"], "", "أحمد سمير جاب 14 من 20", "yes"])
    write_lock(tmp_path)
    assert apply_review(review) == 1
    assert json.loads(path.read_text(encoding="utf-8"))["reference_transcript"].endswith("14 من 20")
    assert json.loads((tmp_path / "LOCK.json").read_text(encoding="utf-8"))["version"] == 2
