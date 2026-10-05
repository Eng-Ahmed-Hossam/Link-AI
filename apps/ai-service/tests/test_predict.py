"""B4 prediction writer: one <id>.pred.json per note in the eval kit's shape; resumable."""

from __future__ import annotations

import json

from ai_service.predict import main


def test_text_mode_writes_predictions_and_resumes(tmp_path, capsys):
    gold = tmp_path / "gold"
    gold.mkdir()
    roster = [
        {"id": "stu-mariam", "display_name": "مريم"},
        {"id": "stu-youssef", "display_name": "يوسف"},
    ]
    (gold / "s01.json").write_text(
        json.dumps(
            {
                "id": "s01",
                "transcript": "مريم غابت النهارده ويوسف جاب ١٨ من ٢٠",
                "roster": roster,
                "assessment": {"title": "كويز", "max_score": 20},
            },
            ensure_ascii=False,
        ),
        "utf-8",
    )
    (gold / "s02.json").write_text(
        json.dumps({"id": "s02", "text": "يوسف حضر", "roster": roster}, ensure_ascii=False), "utf-8"
    )
    out = tmp_path / "preds"
    assert main(["--gold", str(gold), "--out", str(out), "--no-llm"]) == 0
    p = json.loads((out / "s01.pred.json").read_text("utf-8"))
    assert set(p) >= {
        "id",
        "model_version",
        "transcript",
        "mentions",
        "items",
        "needs_identity",
        "latency_ms",
    }
    assert {"student_id": "stu-mariam", "field": "attendance", "value": "absent"}.items() <= p[
        "items"
    ][0].items()
    assert any(i["field"] == "score" and i["value"] == 18 for i in p["items"])
    assert "reference-transcript" in p["model_version"]
    # Resumable: the second run skips what exists.
    assert main(["--gold", str(gold), "--out", str(out), "--no-llm"]) == 0
    run = json.loads((tmp_path / "preds.run.json").read_text("utf-8"))
    assert [p.name for p in out.glob("*.json") if not p.name.endswith(".pred.json")] == []
    assert run["skipped"] == 2 and run["written"] == 0
