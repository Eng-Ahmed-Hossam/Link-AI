"""Report-only confidence reliability analysis."""

from __future__ import annotations

from collections import Counter
from pathlib import Path

from .runner import Json, _item_key, load_gold, load_predictions


def calibrate(predictions_dir: Path, gold_dir: Path) -> str:
    notes = load_gold(gold_dir)
    predictions = load_predictions(predictions_dir, {note["id"] for note in notes})
    expected = {
        note["id"]: Counter(_item_key(item) for item in note["expected_items"])
        for note in notes
    }
    buckets: list[Json] = [
        {"low": low / 10, "high": (low + 1) / 10, "total": 0, "correct": 0}
        for low in range(10)
    ]
    observations: list[tuple[float, bool]] = []
    for note_id, prediction in predictions.items():
        remaining = expected[note_id].copy()
        for item in prediction["items"]:
            key, confidence = _item_key(item), float(item["confidence"])
            correct = remaining[key] > 0
            if correct:
                remaining[key] -= 1
            bucket = buckets[min(int(confidence * 10), 9)]
            bucket["total"] += 1
            bucket["correct"] += int(correct)
            observations.append((confidence, correct))
    lines = [
        "| Confidence | Items | Correct | Reliability |",
        "|---|---:|---:|---:|",
    ]
    for bucket in buckets:
        reliability = bucket["correct"] / bucket["total"] if bucket["total"] else None
        label = f"[{bucket['low']:.1f}, {bucket['high']:.1f}{']' if bucket['high'] == 1 else ')'}"
        lines.append(
            f"| {label} | {bucket['total']} | {bucket['correct']} | "
            + (f"{reliability:.3f}" if reliability is not None else "N/A")
            + " |"
        )
    suggestions = []
    for target in (0.80, 0.90, 0.95):
        eligible = [
            threshold for threshold in sorted({confidence for confidence, _ in observations})
            if (selected := [ok for confidence, ok in observations if confidence >= threshold])
            and sum(selected) / len(selected) >= target
        ]
        suggestions.append(f"precision >= {target:.0%}: {min(eligible):.3f}" if eligible else f"precision >= {target:.0%}: insufficient data")
    lines += ["", "Suggested review thresholds (report-only):", *[f"- {item}" for item in suggestions]]
    return "\n".join(lines)
