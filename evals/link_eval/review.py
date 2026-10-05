"""Apply native-speaker transcript review without silently changing labels."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from link_nlp import RosterStudent, clean_transcript, find_name_mentions, rule_extract, tokenise

from .gold_lock import write_lock


def _rule_facts(text: str, note: dict[str, Any]) -> list[tuple[str, str, object]]:
    roster = [
        RosterStudent(student["id"], student["display_name"], tuple(student.get("nicknames", ())))
        for student in note["roster"]
    ]
    cleaned = clean_transcript(text)
    tokenised = tokenise(cleaned.clean, find_name_mentions(cleaned.clean, roster))
    return sorted(
        (item.get("student_id", item.get("student", "")), item["field"], item["value"])
        for item in rule_extract(tokenised.text, note.get("assessment", {}).get("max"))
    )


def apply_review(csv_path: Path) -> int:
    gold_root = csv_path.parent
    rows = list(csv.DictReader(csv_path.read_text(encoding="utf-8-sig").splitlines()))
    columns = ["id", "script_text", "notes_for_reviewer", "reviewed_text", "approved"]
    if not rows or list(rows[0]) != columns:
        raise ValueError("Review CSV columns must be: " + ",".join(columns))
    scripts_path = gold_root / "SCRIPTS.md"
    scripts = scripts_path.read_text(encoding="utf-8")
    changed = 0
    for row in rows:
        if row["approved"].strip().casefold() not in {"yes", "true", "1"}:
            continue
        reviewed = row["reviewed_text"].strip()
        if not reviewed or reviewed == row["script_text"]:
            continue
        matches = list((gold_root / "synthetic").glob(f"{row['id']}.json"))
        if len(matches) != 1:
            raise ValueError(f"Unknown review id: {row['id']}")
        path = matches[0]
        note = json.loads(path.read_text(encoding="utf-8"))
        old = note["reference_transcript"]
        if old != row["script_text"]:
            raise ValueError(f"{row['id']}: script_text is stale")
        if _rule_facts(old, note) != _rule_facts(reviewed, note):
            raise ValueError(
                f"{row['id']}: reviewed text changes expected items; update the JSON reference first"
            )
        cursor = 0
        for mention in note["expected_mentions"]:
            start = reviewed.find(mention["text"], cursor)
            if start < 0:
                raise ValueError(f"{row['id']}: reviewed text removes an expected mention")
            mention["start"], mention["end"] = start, start + len(mention["text"])
            cursor = mention["end"]
        note["reference_transcript"] = reviewed
        note["annotation"]["review_status"] = "native_speaker_approved"
        path.write_text(json.dumps(note, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if old in scripts:
            scripts = scripts.replace(old, reviewed, 1)
        row["script_text"] = reviewed
        changed += 1
    scripts_path.write_text(scripts, encoding="utf-8")
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    write_lock(gold_root, bump=True)
    return changed
