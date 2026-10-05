"""Before anything reaches the LLM: contact redaction and the name-leak check (docs/09 §2.4, §5).

SHIM — `redact_contacts` stands in until link_nlp ships a contact redactor (requested in
docs/ai/handoff-to-codex.md); then the pipeline calls that instead and this function goes.

`find_leaks` is the service's own gate (docs/ai/link-nlp.md: "do not treat tokenisation as a
universal PII redactor"): if any roster name, nickname or detected name is still in the text meant
for the LLM, the LLM step is skipped and only the rule results are kept.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

from .nlp import NameMention, RosterStudent, normalize_for_match

# A phone number: 8+ digits, optionally with +, spaces or dashes between them (Egyptian mobiles are
# 11 digits: 01x xxxx xxxx). Scores ("12/20") and durations never have 8 digits in a row.
_PHONE = re.compile(r"(?<![\d/])\+?\d(?:[ \-]?\d){7,}(?![\d/])")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
MASK = "#"


def redact_contacts(text: str) -> tuple[str, int]:
    """Phones and emails → the same number of `#` (length-preserving, so rule and token offsets
    stay valid). Returns the text and how many were redacted."""
    count = 0

    def mask(m: re.Match[str]) -> str:
        nonlocal count
        count += 1
        return MASK * len(m.group(0))

    return _EMAIL.sub(mask, _PHONE.sub(mask, text)), count


# Prefixes that attach to a following word in Arabic: و (and), ف (so), ب (with), ل (to), ك (like).
_PREFIXES = ("", "و", "ف", "ب", "ل", "ك")
_WORD = re.compile(r"[\w؀-ۿ]+")


def _name_words(names: Iterable[str]) -> set[str]:
    out: set[str] = set()
    for name in names:
        full = normalize_for_match(name).strip(" .")
        if full:
            out.add(full)
        for w in _WORD.findall(full):
            if len(w) >= 3:  # initials ("س.") and two-letter fragments are not names on their own
                out.add(w)
    return out


def find_leaks(
    llm_text: str, roster: Iterable[RosterStudent], mentions: Iterable[NameMention]
) -> int:
    """How many roster names, nicknames or detected names are still in `llm_text` (0 = safe)."""
    names = _name_words(
        [s.display_name for s in roster]
        + [n for s in roster for n in s.nicknames]
        + [m.text for m in mentions]
    )
    text = normalize_for_match(llm_text)
    words = _WORD.findall(text)
    leaks = sum(1 for w in words if any(w == p + n for n in names for p in _PREFIXES))
    # Multi-word names (e.g. "أحمد سمير") as a phrase, too.
    leaks += sum(text.count(n) for n in names if " " in n)
    return leaks
