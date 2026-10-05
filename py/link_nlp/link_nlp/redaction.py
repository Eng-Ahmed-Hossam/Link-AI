"""Deterministic contact redaction and fail-closed PII boundary checks."""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from importlib.resources import files
from typing import Literal

from .normalize import normalize_digits
from .roster import RosterStudent, find_name_mentions

ContactKind = Literal["mobile", "landline", "email", "handle"]
LeakKind = Literal["roster_name", "nickname", "first_name", "extra_name", "contact"]


@dataclass(frozen=True)
class RedactedSpan:
    start: int
    end: int
    text: str
    replacement: str
    kind: ContactKind


@dataclass(frozen=True)
class Redacted:
    text: str
    spans: tuple[RedactedSpan, ...]


@dataclass(frozen=True)
class Leak:
    start: int
    end: int
    text: str
    kind: LeakKind


_EMAIL = re.compile(r"(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+(?![\w.-])", re.IGNORECASE)
_HANDLE = re.compile(r"(?<![\w@])@[A-Za-z0-9_]{2,32}\b")
_MOBILE = re.compile(
    r"(?<!\d)(?:(?:(?:\+20|0020)[\s-]*1[0125])|(?:01[0125]))(?:[\s-]*\d){8}(?!\d)"
)
_LANDLINE = re.compile(
    r"(?<!\d)(?:(?:(?:\+20|0020)[\s-]*2)|(?:02))(?:[\s-]*\d){8}(?!\d)"
)
_FIRST_NAMES = tuple(
    name.strip()
    for name in files("link_nlp").joinpath("data/first_names.txt").read_text(encoding="utf-8").splitlines()
    if name.strip()
)


def _contact_matches(text: str) -> list[tuple[int, int, ContactKind]]:
    normalized = normalize_digits(text)
    matches: list[tuple[int, int, ContactKind]] = []
    patterns: tuple[tuple[re.Pattern[str], ContactKind], ...] = (
        (_EMAIL, "email"),
        (_HANDLE, "handle"),
        (_MOBILE, "mobile"),
        (_LANDLINE, "landline"),
    )
    for pattern, kind in patterns:
        matches.extend((match.start(), match.end(), kind) for match in pattern.finditer(normalized))
    matches.sort(key=lambda item: (item[0], -(item[1] - item[0])))
    accepted: list[tuple[int, int, ContactKind]] = []
    for candidate in matches:
        if not any(candidate[0] < end and candidate[1] > start for start, end, _ in accepted):
            accepted.append(candidate)
    return sorted(accepted)


def redact_contacts(text: str) -> Redacted:
    """Replace Egyptian phone numbers, emails and handles with local tokens."""
    spans: list[RedactedSpan] = []
    output: list[str] = []
    cursor = 0
    for index, (start, end, kind) in enumerate(_contact_matches(text), 1):
        replacement = f"<CONTACT{index}>"
        output.extend((text[cursor:start], replacement))
        spans.append(RedactedSpan(start, end, text[start:end], replacement, kind))
        cursor = end
    output.append(text[cursor:])
    return Redacted("".join(output), tuple(spans))


def _literal_leaks(text: str, value: str, kind: LeakKind) -> list[Leak]:
    if not value:
        return []
    # Arabic conjunctions attach orthographically ("وحودة"). Keep the
    # conjunction outside the leak span so replacement can preserve it.
    pattern = re.compile(r"(?<!\w)(?:و)?(" + re.escape(value) + r")(?!\w)", re.IGNORECASE)
    return [
        Leak(match.start(1), match.end(1), match.group(1), kind)
        for match in pattern.finditer(text)
    ]


def find_pii_leaks(
    text: str, roster: Sequence[RosterStudent], extra_names: Sequence[str] = ()
) -> list[Leak]:
    """Return remaining names or contacts immediately before an LLM boundary."""
    leaks: list[Leak] = []
    for start, end, _ in _contact_matches(text):
        leaks.append(Leak(start, end, text[start:end], "contact"))
    for student in roster:
        leaks.extend(_literal_leaks(text, student.display_name, "roster_name"))
        for nickname in student.nicknames:
            leaks.extend(_literal_leaks(text, nickname, "nickname"))
    for name in extra_names:
        leaks.extend(_literal_leaks(text, name, "extra_name"))
    detected = find_name_mentions(text, roster)
    known_spans = {(leak.start, leak.end) for leak in leaks}
    for mention in detected:
        if (mention.start, mention.end) not in known_spans:
            leaks.append(Leak(mention.start, mention.end, mention.text, "first_name"))
    for first_name in _FIRST_NAMES:
        for leak in _literal_leaks(text, first_name, "first_name"):
            if (leak.start, leak.end) not in {(item.start, item.end) for item in leaks}:
                leaks.append(leak)
    return sorted(leaks, key=lambda leak: (leak.start, leak.end, leak.kind))
