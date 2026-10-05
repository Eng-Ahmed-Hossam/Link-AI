"""Local-only identity mapping, with reversible source coordinates."""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal

from .roster import NameMention

TOKEN = re.compile(r"<[SAU][0-9]+>")


@dataclass(frozen=True)
class Tokenised:
    text: str
    token_map: dict[str, NameMention]
    offset_map: tuple[tuple[int, int], ...]

    def clean_span(self, start: int, end: int) -> tuple[int, int]:
        if not 0 <= start < end <= len(self.text):
            raise ValueError("Span outside tokenised text")
        return self.offset_map[start][0], self.offset_map[end - 1][1]


@dataclass(frozen=True)
class ResolvedItem:
    status: Literal["resolved", "needs_identity", "who_is_this", "rejected"]
    student_id: str | None
    candidates: tuple[tuple[str, float], ...]
    item: dict[str, Any]
    mention: NameMention | None = None
    reason: str | None = None


def tokenise(clean_text: str, mentions: Sequence[NameMention]) -> Tokenised:
    if TOKEN.search(clean_text):
        raise ValueError("Reserved identity token in raw transcript")
    parts: list[str] = []
    offsets: list[tuple[int, int]] = []
    token_map: dict[str, NameMention] = {}
    counts: Counter[str] = Counter()
    cursor = 0
    for mention in sorted(mentions, key=lambda m: m.start):
        if not cursor <= mention.start < mention.end <= len(clean_text):
            raise ValueError("Overlapping or out-of-bounds name span")
        if clean_text[mention.start : mention.end] != mention.text:
            raise ValueError("Name span does not match transcript")
        if (mention.status == "unique") != (mention.student_id is not None):
            raise ValueError("Only unique mentions may have a student_id")
        if mention.status not in {"unique", "ambiguous", "unknown"}:
            raise ValueError("Invalid identity status")
        prefix = {"unique": "S", "ambiguous": "A", "unknown": "U"}[mention.status]
        counts[prefix] += 1
        token = f"<{prefix}{counts[prefix]}>"
        parts.extend((clean_text[cursor : mention.start], token))
        offsets.extend((i, i + 1) for i in range(cursor, mention.start))
        offsets.extend((mention.start, mention.end) for _ in token)
        token_map[token] = mention
        cursor = mention.end
    parts.append(clean_text[cursor:])
    offsets.extend((i, i + 1) for i in range(cursor, len(clean_text)))
    return Tokenised("".join(parts), token_map, tuple(offsets))


def detokenise_items(
    items: list[dict[str, Any]], token_map: Mapping[str, NameMention]
) -> list[ResolvedItem]:
    result: list[ResolvedItem] = []
    for item in items:
        token = item.get("student")
        mention = token_map.get(token) if isinstance(token, str) else None
        # Ignore any student_id supplied by an extractor: only the local map resolves identity.
        safe = {k: v for k, v in item.items() if k not in {"student_id", "candidates", "identity"}}
        if mention is None or not isinstance(token, str):
            result.append(ResolvedItem("rejected", None, (), safe, reason="token_not_sent"))
        elif (
            mention.status == "unique" and mention.student_id is not None and token.startswith("<S")
        ):
            result.append(
                ResolvedItem("resolved", mention.student_id, mention.candidates, safe, mention)
            )
        elif mention.status == "ambiguous" and token.startswith("<A"):
            result.append(ResolvedItem("needs_identity", None, mention.candidates, safe, mention))
        elif mention.status == "unknown" and token.startswith("<U"):
            result.append(ResolvedItem("who_is_this", None, (), safe, mention))
        else:
            result.append(ResolvedItem("rejected", None, (), safe, reason="inconsistent_token_map"))
    return result
