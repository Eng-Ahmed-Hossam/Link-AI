"""Explicit, conservative patterns produce drafts; never infer class-wide presence."""

from __future__ import annotations

import re
from typing import Any

from .normalize import clean_transcript, normalize_for_match
from .tokens import TOKEN


class RuleItem(dict[str, Any]):
    """Schema-valid wire item; range flag is local metadata, not a JSON key."""

    out_of_range: bool

    def __init__(self, data: dict[str, Any], out_of_range: bool = False) -> None:
        super().__init__(data)
        self.out_of_range = out_of_range


def rule_extract(tokenised_text: str, assessment_max: int | None) -> list[RuleItem]:
    if assessment_max is not None and assessment_max < 0:
        raise ValueError("assessment_max must be nonnegative")
    matches = list(TOKEN.finditer(tokenised_text))
    result: list[RuleItem] = []
    exception = False
    for index, match in enumerate(matches):
        limit = matches[index + 1].start() if index + 1 < len(matches) else len(tokenised_text)
        prefix_start = matches[index - 1].end() if index else 0
        prefix = normalize_for_match(tokenised_text[prefix_start : match.start()])
        body = tokenised_text[match.end() : limit]
        # Punctuation is a fact boundary. Conjunctions alone may connect exception names.
        boundary = re.search(r"[،,؛;!?\n]|(?<!\d)\.(?!\d)", body)
        local = body[: boundary.start()] if boundary else body
        clean = normalize_for_match(clean_transcript(local).clean)
        if re.search(r"(ما عدا|الا)\s*$", prefix):
            exception = bool(
                re.search(
                    r"كلهم|الكل|حضروا|جه", normalize_for_match(tokenised_text[: match.start()])
                )
            )
        elif index and not re.fullmatch(r"\s*(?:و)?\s*", prefix):
            exception = False
        # Do not attach a correction, hypothetical or past-session assertion to this occurrence.
        if re.search(r"\b(?:لا(?:\s+(?:ده|دي))?|قصدي)\b", normalize_for_match(body)):
            continue
        absence_pattern = re.compile(
            r"\b(?:غاب|غايب|غابت|غايبه|مجاش|ماجاش|ماجاتش|"
            r"(?:ما\s*كانش|ماكنش|مكانش|مكنش)\s+موجود|(?:ما\s*كانتش|مكانتش|مكنتش)\s+موجوده)\b"
        )
        absent = absence_pattern.search(clean)
        guard_text = absence_pattern.sub("", clean)
        uncertain = re.compile(
            r"\b[وف]?(?:لو|يمكن|احتمال|مش|ليس|قال|قالت|بيقول|بتقول|حكي|حكت)\b"
            r"|\b[وف]?(?:م\w+ش|ما\s+\w+ش|كانش|كانتش)\b"
            r"|الحصه اللي فاتت|امبارح|الاسبوع اللي فات|الحصه الجايه|بكره"
        )
        prefix_clause = re.split(r"[،,؛;.!?\n]", prefix)[-1]
        if uncertain.search(guard_text) or uncertain.search(prefix_clause):
            continue
        span_end = match.end() + len(local.rstrip())
        span = {"start": match.start(), "end": max(match.end(), span_end)}

        def emit(
            field: str,
            value: str | float,
            confidence: float,
            flagged: bool = False,
            token: str = match.group(),
            source_span: dict[str, int] = span,
        ) -> None:
            result.append(
                RuleItem(
                    {
                        "student": token,
                        "field": field,
                        "value": value,
                        "confidence": confidence,
                        "span": dict(source_span),
                    },
                    flagged,
                )
            )

        late = re.search(r"\b(?:اتاخر|اتاخرت|جه متاخر|جت متاخره)\b", clean)
        present = re.search(r"\b(?:حضر|حضرت|موجود|موجوده|جه|جت)\b", clean)
        if absent or exception:
            emit("attendance", "absent", 0.93)
        elif late:
            emit("attendance", "late", 0.93)
            duration = re.search(r"(?P<n>\d+)\s*(?:min|دقايق|دقيقه|دقائق)", clean)
            if duration:
                emit("late_minutes", int(duration["n"]), 0.93)
        elif present:
            emit("attendance", "present", 0.90)
        score = re.search(
            r"\b(?:جاب|جابت|خد|خدت|اخد|اخدت|درجته|درجتها)\s+(-?\d+(?:\.\d+)?)\s*(?:/|من)\s*(\d+(?:\.\d+)?)",
            clean,
        )
        if score:
            number = float(score[1])
            value: int | float = int(number) if number.is_integer() else number
            maximum = assessment_max if assessment_max is not None else float(score[2])
            emit("score", value, 0.93, value < 0 or value > maximum)
        if re.search(r"\b(?:مشارك كويس|مشاركه كويس|مشاركه كويسه)\b", clean):
            emit("participation", "high", 0.87)
        elif re.search(r"\b(?:ساكت خالص|ساكته خالص)\b", clean):
            emit("participation", "low", 0.87)
        if boundary:
            exception = False
    return result
