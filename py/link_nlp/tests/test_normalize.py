import random

import pytest

from link_nlp.normalize import clean_transcript, normalize_digits, normalize_for_match


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("أَحـْمَد إيمان آمال ة ى", "احمد ايمان امال ه ي"),
        (" Quiz ١٢ ۱۲  Math ", "quiz 12 12 math"),
    ],
)
def test_match_normalization(source: str, expected: str) -> None:
    assert normalize_for_match(source) == expected


def test_digits_only_preserves_display_spelling() -> None:
    assert normalize_digits("أحمد جاب ١٤ من ۲۰ في Quiz") == "أحمد جاب 14 من 20 في Quiz"


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("أحمد جاب اتناشر من عشرين", "أحمد جاب 12/20"),
        ("جاب خمستاشر ونص من عشرين", "جاب 15.5/20"),
        ("جاب نص من عشرين", "جاب 0.5/20"),
        ("اتأخر ربع ساعة", "اتأخر 15 min"),
        ("اتأخر نص ساعة", "اتأخر 30 min"),
        ("اتأخر عشر دقايق", "اتأخر 10 min"),
        ("اتأخر خمسة وعشرين دقيقة", "اتأخر 25 min"),
        (
            "الأول في الفصل الساعة نص اليوم Quiz sign rules 3arabi",
            "الأول في الفصل الساعة نص اليوم Quiz sign rules 3arabi",
        ),
        ("جاب ٢١ من ٢٠", "جاب 21/20"),
    ],
)
def test_spoken_scores_and_duration_context(source: str, expected: str) -> None:
    assert clean_transcript(source).clean == expected


_UNITS = ["صفر", "واحد", "اتنين", "تلاتة", "أربعة", "خمسة", "ستة", "سبعة", "تمانية", "تسعة"]
_TEENS = [
    "عشرة",
    "حداشر",
    "اتناشر",
    "تلتاشر",
    "أربعتاشر",
    "خمستاشر",
    "ستاشر",
    "سبعتاشر",
    "تمنتاشر",
    "تسعتاشر",
]
_TENS = ["عشرين", "تلاتين", "أربعين", "خمسين", "ستين", "سبعين", "تمانين", "تسعين"]


@pytest.mark.parametrize("number", range(101))
def test_egyptian_cardinal_range(number: int) -> None:
    if number < 10:
        spoken = _UNITS[number]
    elif number < 20:
        spoken = _TEENS[number - 10]
    elif number == 100:
        spoken = "مية"
    else:
        tens = _TENS[number // 10 - 2]
        spoken = tens if number % 10 == 0 else f"{_UNITS[number % 10]} و{tens}"
    assert clean_transcript(f"جاب {spoken} من مية").clean == f"جاب {number}/100"


def test_changed_span_highlights_original_phrase() -> None:
    result = clean_transcript("مريم جابت خمستاشر ونص من ٢٠ واتأخرت ربع ساعة")
    assert result.display == "مريم جابت خمستاشر ونص من 20 واتأخرت ربع ساعة"
    start = result.clean.index("15.5/20")
    a, b = result.display_span(start, start + len("15.5/20"))
    assert result.display[a:b] == "خمستاشر ونص من 20"
    start = result.clean.index("15 min")
    a, b = result.display_span(start, start + 6)
    assert result.display[a:b] == "ربع ساعة"
    assert len(result.offset_map) == len(result.clean)
    assert all(0 <= a < b <= len(result.display) for a, b in result.offset_map)
    for a, b in result.offset_map:
        assert a <= b


def test_offsets_remain_monotonic_under_many_replacements() -> None:
    rng = random.Random(802)
    for _ in range(50):
        source = " / ".join(
            rng.choice(["جاب اتناشر من عشرين", "نص ساعة", "كلام Quiz", "عشر دقايق"])
            for _ in range(8)
        )
        result = clean_transcript(source)
        assert list(result.offset_map) == sorted(result.offset_map)
        assert result.display_span(0, len(result.clean)) == (0, len(result.display))


def test_invalid_highlight_offsets_are_rejected() -> None:
    result = clean_transcript("جاب عشرة")
    with pytest.raises(ValueError):
        result.display_span(-1, 3)
    with pytest.raises(ValueError):
        result.display_span(3, 2)
