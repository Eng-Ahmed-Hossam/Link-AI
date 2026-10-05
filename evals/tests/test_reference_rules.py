"""Run the reproducible reference-text producer across its actual CLI boundary."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "reference_rules.py"


@pytest.mark.parametrize(
    ("transcript", "roster", "expected_value"),
    [
        (
            "أحمد جاب 14 من 20",
            [{"id": "s1", "display_name": "أحمد سمير"}, {"id": "s2", "display_name": "أحمد سامي"}],
            None,
        ),
        ("أحمد سمير جاب 21 من 20", [{"id": "s1", "display_name": "أحمد سمير"}], 21),
    ],
)
def test_reference_baseline_never_invents_speech_metrics_or_resolves_ambiguity(
    tmp_path, transcript, roster, expected_value
):
    gold = tmp_path / "gold"
    gold.mkdir()
    predictions = tmp_path / "predictions"
    (gold / "demo.json").write_text(
        json.dumps(
            {
                "id": "demo",
                "reference_transcript": transcript,
                "roster": roster,
                "assessment": {"max": 20},
            }
        ),
        encoding="utf-8",
    )
    process = subprocess.run(
        [sys.executable, str(SCRIPT), "--gold", str(gold), "--predictions", str(predictions)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert process.returncode == 0, process.stderr
    pred = json.loads((predictions / "demo.pred.json").read_text(encoding="utf-8"))
    assert pred["model_version"].startswith("stt:reference-text")
    assert pred["transcript"] == transcript
    assert "latency_ms" not in pred
    if expected_value is None:
        assert pred["items"] == []
        assert pred["needs_identity"][0]["student_id"] is None
        assert pred["mentions"][0]["status"] == "ambiguous"
    else:
        assert pred["items"][0]["student_id"] == "s1"
        assert pred["items"][0]["value"] == 21
        assert pred["items"][0]["out_of_range"] is True
