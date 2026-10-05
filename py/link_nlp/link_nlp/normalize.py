"""Arabic matching normalization and traceable transcript cleanup (no model calls)."""

import re
from collections.abc import Callable
from dataclasses import dataclass

_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
_MATCH_FORMS = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي"})
_MARKS = re.compile(r"[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06edـ]")


def normalize_digits(text: str) -> str:
    """Convert Arabic-Indic and Persian digits without changing other display text."""
    return text.translate(_DIGITS)


def normalize_for_match(text: str) -> str:
    """Lossy matching key; never use it as the teacher's display transcript."""
    return " ".join(
        _MARKS.sub("", normalize_digits(text)).translate(_MATCH_FORMS).casefold().split()
    )


@dataclass(frozen=True)
class CleanedTranscript:
    display: str
    clean: str
    offset_map: tuple[tuple[int, int], ...]

    def display_span(self, start: int, end: int) -> tuple[int, int]:
        """Map a half-open clean span to the smallest covering display span.

        Every character introduced by a replacement points to the entire source phrase.
        Empty spans map to the boundary before the next character (or display end).
        """
        if not 0 <= start <= end <= len(self.clean):
            raise ValueError("clean span must satisfy 0 <= start <= end <= len(clean)")
        if start == end:
            boundary = self.offset_map[start][0] if start < len(self.clean) else len(self.display)
            return boundary, boundary
        return self.offset_map[start][0], self.offset_map[end - 1][1]


# Spelling variants are intentionally explicit; ordinals are not cardinal aliases.
_UNITS: tuple[tuple[str, ...], ...] = (
    ("صفر",),
    ("واحد", "واحدة", "واحده"),
    ("اتنين", "اثنين", "إتنين", "اتنين"),
    ("تلاتة", "تلاته", "ثلاثة", "ثلاثه", "تلات", "ثلاث"),
    ("أربعة", "اربعة", "أربعه", "اربعه", "أربع", "اربع"),
    ("خمسة", "خمسه", "خمس"),
    ("ستة", "سته", "ست"),
    ("سبعة", "سبعه", "سبع"),
    ("تمانية", "تمانيه", "ثمانية", "ثمانيه", "تمان", "ثمان"),
    ("تسعة", "تسعه", "تسع"),
)
_TEENS: tuple[tuple[str, ...], ...] = (
    ("عشرة", "عشره", "عشر"),
    ("حداشر", "احداشر", "إحداشر", "أحد عشر", "احد عشر"),
    ("اتناشر", "إتناشر", "اثناشر", "اثنا عشر", "اتنا عشر"),
    ("تلتاشر", "تلاتاشر", "ثلاثة عشر"),
    ("أربعتاشر", "اربعتاشر", "أربعة عشر", "اربعة عشر"),
    ("خمستاشر", "خمسة عشر"),
    ("ستاشر", "ستة عشر"),
    ("سبعتاشر", "سبعة عشر"),
    ("تمنتاشر", "تمانتاشر", "ثمانية عشر"),
    ("تسعتاشر", "تسعة عشر"),
)
_TENS: tuple[tuple[str, ...], ...] = (
    ("عشرين", "عشرون"),
    ("تلاتين", "ثلاثين", "ثلاثون"),
    ("أربعين", "اربعين", "أربعون", "اربعون"),
    ("خمسين", "خمسون"),
    ("ستين", "ستون"),
    ("سبعين", "سبعون"),
    ("تمانين", "ثمانين", "ثمانون"),
    ("تسعين", "تسعون"),
)


def _number_aliases() -> dict[str, int]:
    aliases: dict[str, int] = {}
    for number, spellings in enumerate(_UNITS + _TEENS):
        aliases.update((word, number) for word in spellings)
    for index, spellings in enumerate(_TENS, start=2):
        aliases.update((word, index * 10) for word in spellings)
        for unit, units in enumerate(_UNITS[1:], start=1):
            for unit_word in units:
                for tens_word in spellings:
                    for connector in (" و", " و "):
                        aliases[f"{unit_word}{connector}{tens_word}"] = index * 10 + unit
    aliases.update((word, 100) for word in ("مية", "ميه", "مائة", "مئة"))
    return aliases


_NUMBERS = _number_aliases()
_NUMBER_RE = re.compile(
    r"(?<!\w)(?:"
    + "|".join(re.escape(word) for word in sorted(_NUMBERS, key=len, reverse=True))
    + r")(?!\w)"
)


def clean_transcript(text: str) -> CleanedTranscript:
    """Clean deterministic cardinal/score/duration forms and preserve source offsets.

    Cardinal words become digits; ``نص`` becomes a half only beside a score cue
    or denominator, or as an explicit hour duration. Latin/Franco words stay intact.
    """
    display = normalize_digits(text)
    clean = display
    offsets = [(index, index + 1) for index in range(len(display))]

    def replace(pattern: re.Pattern[str], value: str | Callable[[re.Match[str]], str]) -> None:
        nonlocal clean, offsets
        pieces: list[str] = []
        mapped: list[tuple[int, int]] = []
        cursor = 0
        for match in pattern.finditer(clean):
            pieces.append(clean[cursor : match.start()])
            mapped.extend(offsets[cursor : match.start()])
            replacement = value(match) if callable(value) else value
            pieces.append(replacement)
            source_span = (offsets[match.start()][0], offsets[match.end() - 1][1])
            mapped.extend([source_span] * len(replacement))
            cursor = match.end()
        pieces.append(clean[cursor:])
        mapped.extend(offsets[cursor:])
        clean, offsets = "".join(pieces), mapped

    replace(_MARKS, "")
    replace(re.compile(r"(?<!\w)ربع\s+ساعة(?!\w)"), "15 min")
    replace(re.compile(r"(?<!\w)(?:نص|نصف)\s+ساعة(?!\w)"), "30 min")
    replace(_NUMBER_RE, lambda match: str(_NUMBERS[match.group()]))
    replace(
        re.compile(r"(?<!\w)(\d+)\s*(?:و\s*نص|و\s*نصف)(?=\s+من\s+\d)"),
        lambda match: f"{match[1]}.5",
    )
    replace(re.compile(r"(?<!\w)(?:نص|نصف)(?=\s+من\s+\d)"), "0.5")
    replace(
        re.compile(r"((?:جاب|جابت|خد|خدت|جايب|جايبة|درجته|درجتها)\s+)(?:نص|نصف)(?!\w)"),
        lambda match: f"{match[1]}0.5",
    )
    replace(
        re.compile(r"((?:جاب|جابت|خد|خدت|جايب|جايبة)\s+)(\d+)\s*و\s*(?:نص|نصف)(?!\w)"),
        lambda match: f"{match[1]}{match[2]}.5",
    )
    replace(
        re.compile(r"(?<!\w)(\d+(?:\.\d+)?)\s+من\s+(\d+(?:\.\d+)?)(?!\w)"),
        lambda match: f"{match[1]}/{match[2]}",
    )
    replace(
        re.compile(r"(?<!\w)(\d+)\s+(?:دقايق|دقائق|دقيقة|دقيقه)(?!\w)"),
        lambda match: f"{match[1]} min",
    )
    return CleanedTranscript(display, clean, tuple(offsets))
