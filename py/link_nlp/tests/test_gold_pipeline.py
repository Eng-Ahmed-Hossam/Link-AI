"""Release identity gate against independently annotated synthetic transcripts."""

import json
from pathlib import Path

import pytest

from link_nlp.normalize import clean_transcript
from link_nlp.roster import RosterStudent, find_name_mentions

GOLD = Path(__file__).resolve().parents[3] / "evals/gold/synthetic"


@pytest.mark.parametrize("path", sorted(GOLD.glob("*.json")), ids=lambda p: p.stem)
def test_actual_matcher_never_autoassigns_wrong_gold_occurrence(path):
    gold = json.loads(path.read_text(encoding="utf-8"))
    clean = clean_transcript(gold["reference_transcript"])
    roster = [
        RosterStudent(s["id"], s["display_name"], tuple(s.get("nicknames", [])))
        for s in gold["roster"]
    ]
    expected = {
        (m["start"], m["end"], m["student_id"])
        for m in gold["expected_mentions"]
        if m["status"] == "unique"
    }
    for mention in find_name_mentions(clean.clean, roster):
        if mention.status == "unique":
            start, end = clean.display_span(mention.start, mention.end)
            assert (start, end, mention.student_id) in expected, (gold["id"], mention)
