from __future__ import annotations

import csv
import json
from pathlib import Path

import pytest
from link_eval.calibration import calibrate
from link_eval.gold_lock import content_hash, lf_normalised, verify_lock, write_lock
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


ARABIC = "﻿{\n  \"reference_transcript\": \"مريم غابت النهارده\"  \n}\n"


def test_gold_lock_is_the_same_with_lf_and_crlf_checkouts(tmp_path: Path) -> None:
    # The same committed file checked out with LF (main) and CRLF (a Windows worktree) must lock
    # identically: the round-2 lock failed on main only because of line endings.
    lf_dir, crlf_dir, cr_dir = tmp_path / "lf", tmp_path / "crlf", tmp_path / "cr"
    for folder, ending in ((lf_dir, b"\n"), (crlf_dir, b"\r\n"), (cr_dir, b"\r")):
        folder.mkdir()
        (folder / "syn-001.json").write_bytes(ARABIC.encode("utf-8").replace(b"\n", ending))
    assert content_hash(lf_dir / "syn-001.json") == content_hash(crlf_dir / "syn-001.json")
    assert content_hash(lf_dir / "syn-001.json") == content_hash(cr_dir / "syn-001.json")
    write_lock(lf_dir)
    (crlf_dir / "LOCK.json").write_bytes((lf_dir / "LOCK.json").read_bytes())
    verify_lock(crlf_dir)  # a lock written on an LF checkout verifies a CRLF checkout
    assert json.loads((lf_dir / "LOCK.json").read_text("utf-8"))["line_endings"] == "lf"


def test_gold_lock_still_fails_on_a_one_character_content_change(tmp_path: Path) -> None:
    path = tmp_path / "syn-001.json"
    path.write_bytes(ARABIC.encode("utf-8").replace(b"\n", b"\r\n"))
    write_lock(tmp_path)
    path.write_bytes(ARABIC.replace("غابت", "غابة").encode("utf-8").replace(b"\n", b"\r\n"))
    with pytest.raises(ValueError, match="syn-001.json"):
        verify_lock(tmp_path)


def test_lf_normalisation_keeps_bom_whitespace_and_arabic() -> None:
    raw = ARABIC.encode("utf-8").replace(b"\n", b"\r\n")
    out = lf_normalised(raw)
    assert out == ARABIC.encode("utf-8")  # only line endings changed
    assert out.startswith(b"\xef\xbb\xbf") and b"  \n" in out  # BOM and trailing spaces kept


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
