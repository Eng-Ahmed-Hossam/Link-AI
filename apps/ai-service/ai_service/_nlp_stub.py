"""TEMPORARY stand-in for `py/link_nlp` (owned by the Codex track, branch `codex/nlp-eval`).

Same names and signatures as the agreed contract, so the service runs end to end before the real
package is merged. Deliberately simple and conservative: it never guesses a student (a name that is
close to two roster entries is `ambiguous`; weak matches are ignored, not attached). Delete this file
once `link_nlp` is a uv path dependency of ai-service (see `nlp.py`).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any

STUB = True

_DIACRITICS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")
_ARABIC_INDIC = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")


def normalize_digits(text: str) -> str:
    return text.translate(_ARABIC_INDIC)


def normalize_for_match(text: str) -> str:
    t = _DIACRITICS.sub("", normalize_digits(text))
    t = re.sub("[إأآٱ]", "ا", t).replace("ة", "ه").replace("ى", "ي")
    return re.sub(r"\s+", " ", t).strip().lower()


@dataclass
class CleanedTranscript:
    display: str
    clean: str
    # clean index -> display index (same length in the stub: digit swaps only).
    offset_map: list[int]


_SPOKEN = {
    "ربع ساعة": "15 دقيقة",
    "نص ساعة": "30 دقيقة",
    "ربع ساعه": "15 دقيقة",
    "نص ساعه": "30 دقيقة",
}


def clean_transcript(text: str) -> CleanedTranscript:
    display = text.strip()
    clean = normalize_digits(display)
    # Keep the stub length-preserving so offsets map 1:1 (the real clean-up handles spoken numbers).
    return CleanedTranscript(display=display, clean=clean, offset_map=list(range(len(clean) + 1)))


@dataclass
class RosterStudent:
    id: str
    display_name: str
    nicknames: list[str] = field(default_factory=list)


@dataclass
class NameMention:
    start: int
    end: int
    text: str
    status: str  # "unique" | "ambiguous" | "unknown"
    student_id: str | None
    candidates: list[str]


def _names(s: RosterStudent) -> list[str]:
    first = s.display_name.split()[0] if s.display_name.split() else s.display_name
    return [n for n in {s.display_name, first, *s.nicknames} if n]


def find_name_mentions(
    clean_text: str, roster: list[RosterStudent], threshold: float = 0.85, margin: float = 0.15
) -> list[NameMention]:
    words = [(m.start(), m.end(), m.group()) for m in re.finditer(r"[^\s،,.؟?!:؛]+", clean_text)]
    out: list[NameMention] = []
    used: set[int] = set()
    # Two-word windows first ("أحمد س."), then single words.
    for size in (2, 1):
        for i in range(len(words) - size + 1):
            if any(j in used for j in range(i, i + size)):
                continue
            start, end = words[i][0], words[i + size - 1][1]
            span = clean_text[start:end]
            key = normalize_for_match(span)
            scored = sorted(
                (
                    (
                        max(
                            SequenceMatcher(None, key, normalize_for_match(n)).ratio()
                            for n in _names(s)
                        ),
                        s.id,
                    )
                    for s in roster
                ),
                reverse=True,
            )
            if not scored or scored[0][0] < threshold:
                continue
            top, second = scored[0][0], scored[1][0] if len(scored) > 1 else 0.0
            close = [sid for sc, sid in scored if sc >= threshold and top - sc < margin]
            if top - second >= margin:
                out.append(NameMention(start, end, span, "unique", scored[0][1], [scored[0][1]]))
            else:
                out.append(NameMention(start, end, span, "ambiguous", None, close))
            used.update(range(i, i + size))
    return sorted(out, key=lambda m: m.start)


@dataclass
class Tokenised:
    text: str
    token_map: dict[str, NameMention]


def tokenise(clean_text: str, mentions: list[NameMention]) -> Tokenised:
    counters = {"unique": 0, "ambiguous": 0, "unknown": 0}
    letter = {"unique": "S", "ambiguous": "A", "unknown": "U"}
    parts: list[str] = []
    token_map: dict[str, NameMention] = {}
    pos = 0
    for m in sorted(mentions, key=lambda x: x.start):
        counters[m.status] += 1
        tok = f"<{letter[m.status]}{counters[m.status]}>"
        parts.append(clean_text[pos : m.start])
        parts.append(tok)
        token_map[tok] = m
        pos = m.end
    parts.append(clean_text[pos:])
    return Tokenised(text="".join(parts), token_map=token_map)


@dataclass
class ResolvedItem:
    token: str | None
    status: str  # "unique" | "ambiguous" | "unknown" | "group"
    student_id: str | None
    candidates: list[str]
    mention: str | None
    field: str
    value: Any
    confidence: float
    span: dict[str, int]
    out_of_range: bool = False


def detokenise_items(
    items: list[dict[str, Any]], token_map: dict[str, NameMention]
) -> list[ResolvedItem]:
    out: list[ResolvedItem] = []
    for it in items:
        tok = it.get("student")
        m = token_map.get(tok) if tok else None
        out.append(
            ResolvedItem(
                token=tok,
                status=m.status if m else "group",
                student_id=m.student_id if m else None,
                candidates=list(m.candidates) if m else [],
                mention=m.text if m else None,
                field=it["field"],
                value=it.get("value"),
                confidence=float(it.get("confidence", 0)),
                span=dict(it.get("span", {"start": 0, "end": 0})),
                out_of_range=bool(it.get("out_of_range", False)),
            )
        )
    return out


_TOKEN = r"(<[SAU]\d+>)"
# Longer forms first: regex alternation takes the first branch that matches.
_ABSENT = r"(?:ما جتش|ما جاش|ماجتش|ماجاش|غايبه|غايبة|مجتش|مجاش|غابت|غايب|غاب)"
_LATE = r"(?:جت متأخره|جت متأخرة|جه متأخر|اتأخرت|اتاخرت|اتأخر|اتاخر)"
_PRESENT = r"(?:موجوده|موجودة|موجود|حضرت|حضر)"


def rule_extract(tokenised_text: str, assessment_max: int | None) -> list[dict[str, Any]]:
    t = tokenised_text
    items: list[dict[str, Any]] = []

    def add(m: re.Match[str], tok: str, field_: str, value: Any, conf: float) -> None:
        items.append(
            {
                "student": tok,
                "field": field_,
                "value": value,
                "confidence": conf,
                "span": {"start": m.start(), "end": m.end()},
            }
        )

    for m in re.finditer(_TOKEN + r"\s*" + _ABSENT, t):
        add(m, m.group(1), "attendance", "absent", 0.92)
    for m in re.finditer(_TOKEN + r"\s*" + _LATE + r"(?:\s*(\d+)\s*(?:دقيقه|دقيقة|دقايق))?", t):
        add(m, m.group(1), "attendance", "late", 0.9)
        if m.group(2):
            add(m, m.group(1), "late_minutes", int(m.group(2)), 0.88)
    for m in re.finditer(_TOKEN + r"\s*" + _PRESENT, t):
        add(m, m.group(1), "attendance", "present", 0.9)
    for m in re.finditer(_TOKEN + r"\s*(?:جاب|جابت|خد|خدت|اخد|اخدت)\s*(\d+)\s*(?:من\s*(\d+))?", t):
        score = int(m.group(2))
        conf = 0.9 if m.group(3) else 0.75
        item = {
            "student": m.group(1),
            "field": "score",
            "value": score,
            "confidence": conf,
            "span": {"start": m.start(), "end": m.end()},
        }
        if assessment_max is not None and score > assessment_max:
            item["out_of_range"] = True
        items.append(item)
    return items


VOICE_EXTRACTION_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "VoiceExtraction",
    "type": "object",
    "required": ["items"],
    "additionalProperties": False,
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["student", "field", "value", "confidence", "span"],
                "additionalProperties": False,
                "properties": {
                    "student": {"type": "string", "pattern": "^<[SAU][0-9]+>$"},
                    "field": {
                        "enum": [
                            "attendance",
                            "late_minutes",
                            "score",
                            "participation",
                            "homework",
                            "observation",
                            "observation_tag",
                            "topic",
                        ]
                    },
                    "value": {"type": ["string", "number", "null"]},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "span": {
                        "type": "object",
                        "required": ["start", "end"],
                        "properties": {"start": {"type": "integer"}, "end": {"type": "integer"}},
                    },
                },
            },
        },
        "unassigned": {"type": "array", "items": {"type": "string"}},
    },
}

_ENUMS = {
    "attendance": {"present", "absent", "late"},
    "participation": {"low", "normal", "high"},
    "observation_tag": {
        "understanding",
        "needs_revisit",
        "behaviour",
        "positive",
        "absence_context",
    },
}


def validate_extraction(
    obj: Any, sent_tokens: set[str], assessment_max: int | None
) -> list[dict[str, Any]]:
    """Schema-check an LLM proposal; drop items on tokens that were not sent or with bad values.
    Raises ValueError when the object does not match the schema (the caller retries once)."""
    import jsonschema

    jsonschema.validate(obj, VOICE_EXTRACTION_SCHEMA)
    out: list[dict[str, Any]] = []
    for it in obj["items"]:
        if it["student"] not in sent_tokens:
            continue  # never invent a token (§2.5)
        f, v = it["field"], it["value"]
        if f in _ENUMS and v not in _ENUMS[f]:
            continue
        if f in ("homework", "topic"):
            continue  # not in Phase 2 (CF-07)
        if f in ("score", "late_minutes"):
            try:
                v = float(v) if v is not None else None
            except (TypeError, ValueError):
                continue
            if v is not None and v == int(v):
                v = int(v)
            it = {**it, "value": v}
            if f == "score" and assessment_max is not None and v is not None and v > assessment_max:
                it["out_of_range"] = True
        out.append(it)
    return out


def confidence_band(c: float) -> str:
    return "high" if c >= 0.85 else "medium" if c >= 0.60 else "low"
