"""Gold files (link_eval format) for the 10 Windows-TTS bench clips in bench/audio.

Windows TTS, NOT representative of real speech: these check the pipeline end to end on audio we
can make on this laptop. Structured facts only (attendance, late minutes, scores, explicit
participation); observations are not annotated. Run: uv run python bench/make_gold.py
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).parent
SENTENCES = json.loads((HERE / "sentences.json").read_text("utf-8"))
ROSTER = [
    ("s1", "مريم"), ("s2", "يوسف"), ("s3", "أحمد س."), ("s4", "أحمد م."), ("s5", "ليلى"),
    ("s6", "زياد"), ("s7", "نور"), ("s8", "عمر"), ("s9", "هنا"), ("s10", "سيف"),
]  # fmt: skip
NAME = dict(ROSTER)
# note id → (mentioned student ids in order, expected items, assessment max)
TRUTH: dict[str, tuple[list[str], list[tuple[str, str, object]], int]] = {
    "b01": (["s1", "s2"], [("s1", "attendance", "absent"), ("s2", "attendance", "late"),
                           ("s2", "late_minutes", 10)], 20),
    "b02": (["s5", "s6", "s8"], [("s5", "score", 17), ("s6", "score", 13)], 20),
    "b03": (["s7", "s9"], [("s7", "participation", "high"), ("s9", "participation", "low")], 20),
    "b04": (["s10", "s8", "s1"], [("s10", "attendance", "absent"), ("s8", "attendance", "late"),
                                  ("s8", "late_minutes", 15), ("s1", "score", 19)], 20),
    "b05": (["s2", "s5", "s6"], [("s2", "attendance", "absent"), ("s5", "attendance", "absent")], 20),
    "b06": (["s7", "s10", "s9"], [("s7", "score", 14), ("s10", "score", 10), ("s9", "score", 8)], 15),
    "b07": (["s1", "s2"], [("s1", "attendance", "absent")], 20),
    "b08": (["s5", "s8", "s7", "s6"], [("s5", "attendance", "late"), ("s5", "late_minutes", 5)], 20),
    "b09": (["s10"], [], 20),
    "b10": (["s9", "s1", "s2"], [("s9", "score", 20), ("s1", "attendance", "present"),
                                 ("s1", "participation", "low"), ("s2", "score", 12)], 20),
}  # fmt: skip


def mentions(text: str, mentioned: list[str]) -> list[dict[str, object]]:
    """Each name occurrence with its offsets in the reference transcript (in order), so link_eval
    can place it even with an attached conjunction ("ويوسف")."""
    out, cursor = [], 0
    for s in mentioned:
        start = text.find(NAME[s], cursor)
        if start < 0:
            raise ValueError(f"{NAME[s]} not found in: {text}")
        end = start + len(NAME[s])
        out.append({"start": start, "end": end, "text": NAME[s], "status": "unique",
                    "student_id": s, "candidates": [s]})  # fmt: skip
        cursor = end
    return out


def main() -> None:
    out = HERE / "gold"
    out.mkdir(exist_ok=True)
    for note in SENTENCES["notes"]:
        mentioned, items, max_score = TRUTH[note["id"]]
        gold = {
            "id": note["id"],
            "data_class": "synthetic",
            "audio_file": f"{note['id']}.wav",
            "recording": {"condition": "windows_tts", "speaker": "windows-tts-ar-EG-hoda"},
            "roster": [{"id": i, "display_name": n, "nicknames": []} for i, n in ROSTER],
            "assessment": {"name": "كويز", "max": max_score},
            "reference_transcript": note["text"],
            "expected_mentions": mentions(note["text"], mentioned),
            "expected_items": [{"student_id": s, "field": f, "value": v} for s, f, v in items],
            "expected_needs_identity": [],
            "expected_unmentioned": [i for i, _ in ROSTER if i not in mentioned],
            "hard_case_tags": ["windows_tts"],
            "annotation": {"method": "authored_with_the_script", "version": "tts-v0"},
        }
        (out / f"{note['id']}.json").write_text(
            json.dumps(gold, ensure_ascii=False, indent=2) + "\n", "utf-8"
        )
    print(f"wrote {len(SENTENCES['notes'])} gold files to {out}")


if __name__ == "__main__":
    main()
