"""Reproducible reference-text rule baseline; never a speech benchmark.

Run from any directory with the link-nlp environment:
uv run python ../../evals/reference_rules.py --gold ../../evals/gold/synthetic --predictions ../../evals/predictions/reference-rules
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from link_nlp.normalize import clean_transcript
from link_nlp.roster import RosterStudent, find_name_mentions
from link_nlp.rules import rule_extract
from link_nlp.schema import validate_extraction
from link_nlp.tokens import detokenise_items, tokenise


def produce_predictions(gold_dir: Path, predictions_dir: Path) -> int:
    """Use only gold transcript text, preserving source identity occurrences."""
    predictions_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for path in sorted(gold_dir.glob("*.json")):
        gold = json.loads(path.read_text(encoding="utf-8"))
        clean = clean_transcript(gold["reference_transcript"])
        roster = [
            RosterStudent(s["id"], s["display_name"], tuple(s.get("nicknames", [])))
            for s in gold["roster"]
        ]
        mentions = find_name_mentions(clean.clean, roster)
        tokens = tokenise(clean.clean, mentions)
        wire = rule_extract(tokens.text, gold["assessment"]["max"])
        validated = validate_extraction(
            {"items": wire}, set(tokens.token_map), gold["assessment"]["max"]
        )
        if not validated.valid:
            raise ValueError(f"Invalid rule output for {gold['id']}: {validated.errors}")
        resolved = detokenise_items(validated.items, tokens.token_map)
        mapped = []
        for mention in mentions:
            start, end = clean.display_span(mention.start, mention.end)
            mapped.append(
                {
                    "start": start,
                    "end": end,
                    "text": clean.display[start:end],
                    "status": mention.status,
                    "student_id": mention.student_id,
                    "candidates": mention.candidates,
                }
            )
        items: list[dict[str, Any]] = []
        unresolved = []
        for index, result in enumerate(resolved):
            data = dict(
                result.item,
                student_id=result.student_id,
                out_of_range=index in validated.out_of_range,
            )
            if result.status == "resolved":
                items.append(data)
            else:
                unresolved.append(
                    dict(
                        data,
                        status=result.status,
                        text=result.mention.text if result.mention else None,
                    )
                )
        pred = {
            "id": gold["id"],
            "model_version": "stt:reference-text|extract:link-nlp/0.1.0|llm:none",
            "transcript": gold["reference_transcript"],
            "mentions": mapped,
            "items": items,
            "needs_identity": unresolved,
        }
        (predictions_dir / f"{gold['id']}.pred.json").write_text(
            json.dumps(pred, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        count += 1
    if not count:
        raise ValueError("No gold JSON references found")
    return count


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reference-text rules only; no audio accuracy measurement"
    )
    parser.add_argument("--gold", type=Path, required=True)
    parser.add_argument("--predictions", type=Path, required=True)
    args = parser.parse_args()
    count = produce_predictions(args.gold, args.predictions)
    print(f"Created {count} reference-text predictions; no STT, LLM or audio evaluated.")


if __name__ == "__main__":
    main()
