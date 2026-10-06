"""Explicit, conservative patterns produce drafts; never infer class-wide presence.

Round 3 additions (docs/ai/link-nlp.md "Round 3"):
- self-corrections are resolved in code: a corrected *name* moves the fact to the corrected
  mention («مريم... لا قصدي مريم حسين، غابت»); a corrected *predicate* keeps the final statement
  («غاب، لا استنى، هو حاضر»); anything less clear abstains;
- `rule_abstentions` reports where (and why) the rules abstained, so a service can treat those
  clauses differently (e.g. never let another extractor assert attendance there);
- participation phrases, also in a following clause about the same student («لكنه … كان مشارك
  كويس»); a bare «جاب N» once the maximum is known.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

from .normalize import clean_transcript, normalize_for_match
from .tokens import TOKEN


class RuleItem(dict[str, Any]):
    """Schema-valid wire item; range flag is local metadata, not a JSON key."""

    out_of_range: bool

    def __init__(self, data: dict[str, Any], out_of_range: bool = False) -> None:
        super().__init__(data)
        self.out_of_range = out_of_range


AbstentionReason = Literal[
    "name_corrected", "correction_unclear", "negation_or_hypothetical", "other_session"
]


@dataclass(frozen=True)
class RuleAbstention:
    """A clause about `token` where the rules deliberately asserted nothing.

    `start`/`end` are offsets in the tokenised text (the token's clause)."""

    token: str
    start: int
    end: int
    reason: AbstentionReason


# A full stop ends a clause unless a digit follows ("19.5/20"); "جابت 8." still ends at the stop.
_BOUNDARY = re.compile(r"[،,؛;!?\n]|\.(?!\d)")
# Self-correction cues (normalised forms): the statement after the last cue is the one that counts.
_CORRECTION = re.compile(
    r"(?:لا\s+استني|لا\s+استنا|لا\s+قصدي|قصدي|اقصد|لا\s+لا|لا\s+مش\s+كده|لا\s+غلط|"
    r"المعلومه\s+الصح(?:\s+هي)?)"
)
_ABSENCE = re.compile(
    r"\b(?:غاب|غايب|غابت|غايبه|مجاش|ماجاش|ماجاتش|ماجاشا|ماجاشي|ماجاشه|مجاشي|ماجتش|مجتش|"
    r"(?:ما\s*كانش|ماكنش|مكانش|مكنش)\s+موجود|(?:ما\s*كانتش|مكانتش|مكنتش)\s+موجوده)\b"
)
_OTHER_SESSION = re.compile(r"الحصه اللي فاتت|امبارح|الاسبوع اللي فات|الحصه الجايه|بكره")
_UNCERTAIN = re.compile(
    r"\b[وف]?(?:لو|يمكن|احتمال|مش|ليس|قال|قالت|بيقول|بتقول|حكي|حكت)\b"
    r"|\b[وف]?(?:م\w+ش|ما\s+\w+ش|كانش|كانتش)\b"
)
_LATE = re.compile(
    r"\b(?:اتاخر|اتاخرت|اتاخرو|تاخر|تاخرت|جه متاخر|جهه متاخر|جت متاخره|متاخر|متاخره)\b"
)
_PRESENT = re.compile(r"\b(?:حضر|حضرت|موجود|موجوده|جه|جت|حاضر|حاضره)\b")
_SCORE_VERB = r"(?:جاب|جابت|خد|خدت|اخد|اخدت|درجته|درجتها)"
_RATIO = re.compile(_SCORE_VERB + r"\s+(-?\d+(?:\.\d+)?)\s*(?:/|من)\s*(\d+(?:\.\d+)?)")
_BARE_SCORE = re.compile(
    r"\b(?:جاب|جابت|خد|خدت)\s+(-?\d+(?:\.\d+)?)"
    r"(?=\s*(?:$|[.،,؛;!?]|درجه\b|درجات\b|في\s+(?:الكويز|الامتحان|الاختبار)\b))"
)
_DECLARED_MAX = re.compile(r"من\s+(\d+(?:\.\d+)?)\s+(?:درجه|درجات)")
# Participation (normalised forms). Checked before the negation guard: «ما شاركش» is explicit.
_PART_HIGH = re.compile(
    r"\b(?:مشارك|مشاركه|شارك|شاركت|بيشارك|بتشارك)\s+(?:كويس|كويسه|جدا|كتير|اوي|جامد)\b"
    r"|\bمشاركت(?:ه|ها)\s+(?:كانت\s+)?(?:كويسه|عاليه|ممتازه|حلوه)\b"
)
_PART_LOW = re.compile(
    r"\b(?:ساكت|ساكته)\s+(?:خالص|طول\s+الحصه)\b|\bكان(?:ت)?\s+ساكت(?:ه)?\b"
    r"|\bمشاركت(?:ه|ها)\s+(?:كانت\s+)?(?:قليله|ضعيفه|وحشه)\b"
    r"|\b(?:ما\s*شاركش|مشاركش|ما\s*شاركتش|مشاركتش)\b"
)
_PART_NORMAL = re.compile(
    r"\bمشاركت(?:ه|ها)\s+(?:كانت\s+)?عاديه\b|\b(?:مشارك|مشاركه)\s+عادي(?:ه)?\b"
)
# A following clause that is still about the same student (participation only).
_CONTINUATION = re.compile(r"^\s*(?:لكنه|لكنها|بس|وكان|وكانت|وهو|وهي|وبعدين)\b")


def _norm(text: str) -> str:
    return normalize_for_match(clean_transcript(text).clean)


def _participation(clean: str) -> str | None:
    if _PART_LOW.search(clean):
        return "low"
    if _PART_NORMAL.search(clean):
        return "normal"
    if _PART_HIGH.search(clean):
        return "high"
    return None


def _clauses(body: str) -> list[tuple[int, str]]:
    """Clauses of `body` with their offsets (split at punctuation, kept in order)."""
    out, cursor = [], 0
    for match in _BOUNDARY.finditer(body):
        out.append((cursor, body[cursor : match.start()]))
        cursor = match.end()
    out.append((cursor, body[cursor:]))
    return out


def _extract(
    tokenised_text: str, assessment_max: int | None
) -> tuple[list[RuleItem], list[RuleAbstention]]:
    if assessment_max is not None and assessment_max < 0:
        raise ValueError("assessment_max must be nonnegative")
    matches = list(TOKEN.finditer(tokenised_text))
    result: list[RuleItem] = []
    abstentions: list[RuleAbstention] = []
    declared = _DECLARED_MAX.search(_norm(tokenised_text))
    note_max = (
        float(assessment_max)
        if assessment_max is not None
        else (float(declared[1]) if declared else None)
    )
    exception = False
    for index, match in enumerate(matches):
        token = match.group()
        limit = matches[index + 1].start() if index + 1 < len(matches) else len(tokenised_text)
        prefix_start = matches[index - 1].end() if index else 0
        prefix = normalize_for_match(tokenised_text[prefix_start : match.start()])
        body = tokenised_text[match.end() : limit]
        clauses = _clauses(body)
        first_offset, local = clauses[0]
        if re.search(r"(ما عدا|الا)\s*$", prefix):
            exception = bool(
                re.search(
                    r"كلهم|الكل|حضروا|جه", normalize_for_match(tokenised_text[: match.start()])
                )
            )
        elif index and not re.fullmatch(r"\s*(?:و)?\s*", prefix):
            exception = False

        def abstain(
            reason: AbstentionReason,
            start: int = 0,
            end: int | None = None,
            token: str = token,
            at: int = match.end(),
            size: int = len(body),
        ) -> None:
            stop = size if end is None else end
            abstentions.append(RuleAbstention(token, at + start, at + stop, reason))

        # Self-correction: the statement after the last cue is the one that counts.
        corrected = False
        body_norm = normalize_for_match(body)
        cues = list(_CORRECTION.finditer(body_norm))
        if cues:
            remainder = body_norm[cues[-1].end() :]
            if not re.sub(r"[\s.،,؛;!?…و]", "", remainder):
                # «مريم... لا قصدي <S2>»: the fact goes to the next name; a cue with nothing
                # after it at the end of the note is just unclear.
                abstain("name_corrected" if index + 1 < len(matches) else "correction_unclear")
                continue
            # Re-locate the remainder in the original body (same words, display spelling).
            tail = _remainder_after_cue(body)
            if tail is None:
                abstain("correction_unclear")
                continue
            offset, rest = tail
            clauses = [(offset + o, c) for o, c in _clauses(rest)]
            clauses = [(o, c) for o, c in clauses if _norm(c).strip()]
            if not clauses:
                abstain("correction_unclear")
                continue
            first_offset, local = clauses[0]
            corrected = True
        elif re.search(r"\b(?:لا(?:\s+(?:ده|دي))?)\b", body_norm):
            abstain("negation_or_hypothetical")
            continue
        # Topic-comment: «<S1>، غابت النهارده» — an empty first clause takes the next one.
        if not _norm(local).strip() and len(clauses) > 1:
            first_offset, local = clauses[1]
        clean = _norm(local)
        prefix_clause = re.split(r"[،,؛;.!?\n]", prefix)[-1]
        participation = _participation(clean)
        absent = _ABSENCE.search(clean)
        guard_text = _PART_LOW.sub("", _ABSENCE.sub("", clean))
        # A hypothetical or negation is the more specific reason, so it is checked first.
        if _UNCERTAIN.search(guard_text) or _UNCERTAIN.search(prefix_clause):
            abstain("negation_or_hypothetical", first_offset, first_offset + len(local))
            continue
        if _OTHER_SESSION.search(clean) or _OTHER_SESSION.search(prefix_clause):
            abstain("other_session", first_offset, first_offset + len(local))
            continue
        span_end = match.end() + first_offset + len(local.rstrip())
        span = {"start": match.start(), "end": max(match.end(), span_end)}
        base = 0.88 if corrected else 0.93

        def emit(
            field: str,
            value: str | float,
            confidence: float,
            flagged: bool = False,
            token: str = token,
            span: dict[str, int] = span,
        ) -> None:
            result.append(
                RuleItem(
                    {
                        "student": token,
                        "field": field,
                        "value": value,
                        "confidence": confidence,
                        "span": dict(span),
                    },
                    flagged,
                )
            )

        late = _LATE.search(clean)
        present = _PRESENT.search(clean)
        if absent or (exception and not corrected):
            emit("attendance", "absent", base)
        elif late:
            emit("attendance", "late", base)
            duration = re.search(r"(?P<n>\d+)\s*(?:min|دقايق|دقيقه|دقائق)", clean)
            if duration:
                emit("late_minutes", int(duration["n"]), base)
        elif present:
            emit("attendance", "present", min(base, 0.90))
        score = _RATIO.search(clean)
        bare = None if score else _BARE_SCORE.search(clean)
        if score:
            number = float(score[1])
            value: int | float = int(number) if number.is_integer() else number
            maximum = assessment_max if assessment_max is not None else float(score[2])
            emit("score", value, base, value < 0 or value > maximum)
        elif bare and note_max is not None:
            number = float(bare[1])
            value = int(number) if number.is_integer() else number
            emit("score", value, 0.87, value < 0 or value > note_max)
        # Participation: this clause, else a following clause about the same student.
        if participation is None:
            for _offset, following in clauses[clauses.index((first_offset, local)) + 1 :]:
                if not _CONTINUATION.search(normalize_for_match(following)):
                    break
                participation = _participation(_norm(following))
                if participation:
                    break
        if participation:
            emit("participation", participation, 0.87)
        if len(clauses) > 1:
            exception = False
    return result, abstentions


def _remainder_after_cue(body: str) -> tuple[int, str] | None:
    """The original-spelling text after the last correction cue in `body`, with its offset."""
    best: tuple[int, str] | None = None
    for match in re.finditer(r"\S+", body):
        tail = body[match.start() :]
        head = normalize_for_match(body[: match.start()])
        cues = list(_CORRECTION.finditer(head))
        # The first word after the last cue.
        if cues and not _CORRECTION.search(normalize_for_match(tail)) and best is None:
            best = (match.start(), tail)
    return best


def rule_extract(tokenised_text: str, assessment_max: int | None) -> list[RuleItem]:
    return _extract(tokenised_text, assessment_max)[0]


def rule_abstentions(
    tokenised_text: str, assessment_max: int | None = None
) -> list[RuleAbstention]:
    """Where the rules deliberately asserted nothing about a token, and why (round 3, A3)."""
    return _extract(tokenised_text, assessment_max)[1]
