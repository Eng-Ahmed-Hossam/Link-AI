"""Conservative roster-only identity resolution with bounded person-name detection.

The lexicon/cue detector is not a universal person-name or PII detector. Fuzzy
scores support human review; spelling similarity alone never authorizes identity.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass
from difflib import SequenceMatcher
from importlib.resources import files
from itertools import pairwise
from typing import Literal

from .normalize import normalize_for_match


@dataclass(frozen=True)
class RosterStudent:
    id: str
    display_name: str
    nicknames: tuple[str, ...] = ()


@dataclass(frozen=True)
class NameMention:
    start: int
    end: int
    text: str
    status: Literal["unique", "ambiguous", "unknown"]
    student_id: str | None
    candidates: tuple[tuple[str, float], ...]


@dataclass(frozen=True)
class _Word:
    start: int
    end: int
    key: str


_WORD_RE = re.compile(r"[^\W\d_]\.|[^\W\d_]+", re.UNICODE)
_FIRST_NAMES = frozenset(
    normalize_for_match(name)
    for name in files("link_nlp")
    .joinpath("data/first_names.txt")
    .read_text(encoding="utf-8")
    .splitlines()
    if name.strip()
)
_PHONETIC_FORMS = str.maketrans(
    {"ث": "س", "ص": "س", "ذ": "ز", "ظ": "ز", "ق": "ء", "ا": "ء", "ة": "ه"}
)
_ROLES = frozenset(
    normalize_for_match(word)
    for word in (
        "مدرس",
        "المدرس",
        "مدرسة",
        "المدرسة",
        "المعلم",
        "المعلمة",
        "الأستاذ",
        "أستاذ",
        "أستاذة",
        "الأستاذة",
        "مستر",
        "مس",
        "دكتور",
        "دكتورة",
        "والد",
        "والدة",
        "والدته",
        "والدها",
        "والده",
        "أم",
        "أمه",
        "أمها",
        "أب",
        "أبوه",
        "teacher",
        "guardian",
        "mother",
        "father",
        "mr",
        "mrs",
        "ms",
    )
)
_CUES = frozenset(
    normalize_for_match(word)
    for word in (
        "الطالب",
        "الطالبة",
        "طالب",
        "طالبة",
        "اسمه",
        "اسمها",
        "الطلاب",
        "student",
        "يا",
    )
)
_STOPS = (
    frozenset(
        normalize_for_match(word)
        for word in (
            "غاب",
            "غابت",
            "غايب",
            "غايبة",
            "مجاش",
            "ماجاش",
            "مجتش",
            "ماجاتش",
            "مجاتش",
            "غابوا",
            "حضر",
            "حضرت",
            "حضروا",
            "جه",
            "جت",
            "جاه",
            "كان",
            "كانت",
            "مكنش",
            "مكانش",
            "مكنتش",
            "مش",
            "موش",
            "ما",
            "هو",
            "هي",
            "ده",
            "دي",
            "جاب",
            "جابت",
            "جابوا",
            "جايب",
            "جايبة",
            "جايبه",
            "خد",
            "خدت",
            "أخد",
            "أخدت",
            "اتأخر",
            "اتأخرت",
            "اتاخرت",
            "اتاخرو",
            "متأخر",
            "متأخرة",
            "ساكت",
            "ساكتة",
            "مشارك",
            "مشاركة",
            "شارك",
            "شاركت",
            "كويس",
            "كويسة",
            "ممتاز",
            "ممتازة",
            "النهارده",
            "النهاردة",
            "امبارح",
            "في",
            "من",
            "على",
            "مع",
            "بس",
            "لكن",
            "لا",
            "قصدی",
            "قصدي",
            "يعني",
            "تمام",
            "جدا",
            "خالص",
            "شاطر",
            "شطرة",
            "محتاج",
            "محتاجة",
            "فاهم",
            "فاهمة",
            "فهم",
            "فهمت",
            "بيفهم",
            "مشغول",
            "ركز",
            "ركزت",
            "ركزي",
            "شرح",
            "شرحت",
            "قال",
            "قالت",
            "اتصل",
            "اتصلت",
            "سأل",
            "سألت",
            "سالت",
            "سلم",
            "سلمت",
            "حل",
            "حلت",
            "عمل",
            "عملت",
            "بيحل",
            "بتحل",
            "عنده",
            "عندها",
            "موجود",
            "موجودة",
            "حاضر",
            "حاضرة",
            "بالنسبة",
            "الحصة",
            "الكويز",
            "الواجب",
            "الكل",
            "كلهم",
            "حضور",
            "غياب",
            "والكل",
            "إلا",
            "الا",
            "عدا",
            "مرة",
            "تاني",
            "تانية",
            "هراجع",
            "هنراجع",
            "ممكن",
            "شوية",
            "spoke",
            "absent",
            "late",
            "scored",
            "got",
            "was",
            "is",
            "quiz",
            "teacher",
            "guardian",
        )
    )
    | _ROLES
    | _CUES
)


# These spellings also commonly denote ordinary nouns/adjectives/adverbs. Bare
# roster equality alone is insufficient evidence that a person was mentioned.
_HOMOGRAPHS = frozenset(
    normalize_for_match(word)
    for word in (
        "هنا",
        "نور",
        "ملك",
        "حسن",
        "علي",
        "جمال",
        "فرح",
        "أمل",
        "كريم",
        "شريف",
        "عادل",
        "صلاح",
        "سحر",
        "هدى",
        "سماح",
        "سعيد",
        "أمير",
        "جميلة",
        "منى",
        "رحمة",
        "بسمة",
        "شهد",
        "سما",
        "جميل",
        "بدر",
        "عمر",
    )
)
_STUDENT_ACTIONS = frozenset(
    normalize_for_match(word)
    for word in (
        "غاب",
        "غابت",
        "غايب",
        "غايبة",
        "مجاش",
        "ماجاش",
        "ماجاتش",
        "مجاتش",
        "حضر",
        "حضرت",
        "جاب",
        "جابت",
        "جايب",
        "جايبة",
        "خد",
        "خدت",
        "أخد",
        "أخدت",
        "اتأخر",
        "اتأخرت",
        "متأخر",
        "متأخرة",
        "شارك",
        "شاركت",
        "مشارك",
        "مشاركة",
        "ساكت",
        "ساكتة",
        "absent",
        "late",
        "scored",
    )
)


_NONPERSON_SUBJECTS = frozenset(
    normalize_for_match(word)
    for word in (
        "الكل",
        "كلهم",
        "كلنا",
        "جميع",
        "الجميع",
        "الباقي",
        "الباقين",
        "المجموعة",
        "الطلاب",
        "الطلبة",
        "الطالبات",
        "الفصل",
        "الحصة",
        "أنا",
        "إحنا",
        "احنا",
        "أنت",
        "انت",
        "هو",
        "هي",
        "هم",
        "هما",
        "محدش",
        "مفيش",
        "حد",
        "واحد",
        "واحدة",
    )
)


def _matches_sequence(text: str, words: list[_Word], index: int, sequence: tuple[str, ...]) -> bool:
    selected = words[index : index + len(sequence)]
    return tuple(word.key for word in selected) == sequence and all(
        text[left.end : right.start].isspace() for left, right in pairwise(selected)
    )


def _bare_name_evidence(text: str, words: list[_Word], index: int) -> bool:
    word = words[index]
    if index and words[index - 1].key.rstrip(".") in _CUES:
        return text[words[index - 1].end : word.start].isspace()
    if index + 1 >= len(words) or words[index + 1].key not in _STUDENT_ACTIONS:
        return False
    if not text[word.end : words[index + 1].start].isspace():
        return False
    # An action must be attached to a clause subject, not a locative/adjective
    # inside an unrelated phrase (e.g. an example that is missing "here").
    if index == 0:
        return True
    boundary = text[words[index - 1].end : word.start]
    return bool(re.search(r"[.،,؛;:!?\n]", boundary)) or boundary.strip() == "و"


def _phonetic(text: str) -> str:
    key = normalize_for_match(text).translate(_PHONETIC_FORMS)
    extra_forms: dict[str, str | int | None] = {"ت": "س", "د": "ز", "ض": "ظ"}
    key = key.translate(str.maketrans(extra_forms))
    return re.sub(r"[اهي]$", "ا", key)


def _alias_keys(text: str) -> tuple[str, ...]:
    return tuple(
        normalize_for_match(match.group()) for match in _WORD_RE.finditer(normalize_for_match(text))
    )


def _words(text: str, starts: set[str]) -> list[_Word]:
    words: list[_Word] = []
    for match in _WORD_RE.finditer(text):
        key = normalize_for_match(match.group())
        start = match.start()
        # Preserve a spoken conjunction outside the redacted name span.
        if key.startswith("و") and key[1:] in starts:
            start += 1
            key = key[1:]
        words.append(_Word(start, match.end(), key))
    return words


def _is_role(words: list[_Word], index: int) -> bool:
    previous = [word.key.rstrip(".") for word in words[max(0, index - 2) : index]]
    return any(word in _ROLES for word in previous) or previous[-2:] == ["ولي", "الامر"]


def _candidate_scores(
    key: str, aliases: dict[str, tuple[str, ...]], firsts: dict[str, str]
) -> tuple[tuple[str, float], ...]:
    scores: list[tuple[str, float]] = []
    for student_id, names in aliases.items():
        if key in names:
            score = 1.0
        elif " " not in key and key == firsts[student_id]:
            score = 0.92
        else:
            score = max(
                (
                    0.85 * SequenceMatcher(None, key, alias).ratio()
                    + 0.15 * SequenceMatcher(None, _phonetic(key), _phonetic(alias)).ratio()
                    for alias in names
                ),
                default=0.0,
            )
            # Similar surnames are review evidence, never exact identity evidence.
            score = min(score, 0.84)
        scores.append((student_id, round(score, 6)))
    return tuple(sorted(scores, key=lambda pair: (-pair[1], pair[0])))


def find_name_mentions(
    clean_text: str,
    roster: Sequence[RosterStudent],
    threshold: float = 0.85,
    margin: float = 0.15,
) -> list[NameMention]:
    """Find roster/lexicon/cue spans and resolve only sufficient exact evidence.

    Full normalized names and nicknames may identify one student. A bare exact
    first name may identify a student only when it is unshared; common-word
    homographs additionally require explicit student cues or clause-subject action
    evidence. Other names,
    including teacher/guardian mentions, remain unknown. Threshold and runner-up
    margin still apply to every unique result; all candidates are roster IDs.
    """
    if len({student.id for student in roster}) != len(roster):
        raise ValueError("roster student IDs must be unique")
    if threshold < 0 or margin < 0:
        raise ValueError("threshold and margin must be nonnegative")
    aliases = {
        student.id: tuple(
            normalize_for_match(name)
            for name in (student.display_name, *student.nicknames)
            if name.strip()
        )
        for student in roster
    }
    firsts = {
        student.id: normalize_for_match(student.display_name).split()[0]
        if student.display_name.strip()
        else ""
        for student in roster
    }
    exact_sequences = {
        _alias_keys(name)
        for student in roster
        for name in (student.display_name, *student.nicknames)
        if _alias_keys(name)
    }
    starts = {name.split()[0] for name in _FIRST_NAMES} | {
        sequence[0] for sequence in exact_sequences
    }
    words = _words(clean_text, starts)
    mentions: list[NameMention] = []
    index = 0
    while index < len(words):
        word = words[index]
        preceding = words[index - 1].key.rstrip(".") if index else ""
        role = _is_role(words, index)
        after_cue = preceding in _CUES or role
        suffix_cue = word.key not in _NONPERSON_SUBJECTS and _bare_name_evidence(
            clean_text, words, index
        )
        if word.key not in starts and not after_cue and not suffix_cue:
            index += 1
            continue
        if word.key.rstrip(".") in _STOPS and word.key not in _HOMOGRAPHS:
            index += 1
            continue
        length = max(
            (
                len(sequence)
                for sequence in exact_sequences
                if _matches_sequence(clean_text, words, index, sequence)
            ),
            default=0,
        )
        length = max(length, 1)
        # Extend a roster prefix when there is further surname evidence. A known
        # action/cue is a hard boundary; a first name can also be a surname.
        while index + length < len(words):
            next_word = words[index + length]
            between = clean_text[words[index + length - 1].end : next_word.start]
            if not between.isspace() or next_word.key.rstrip(".") in _STOPS:
                break
            length += 1
        start, end = word.start, words[index + length - 1].end
        text = clean_text[start:end]
        key = normalize_for_match(text)
        has_person_cue = after_cue or suffix_cue or length > 1
        if word.key in _HOMOGRAPHS and not has_person_cue:
            index += length
            continue
        candidates = _candidate_scores(key, aliases, firsts)
        eligible = any(key in names for names in aliases.values()) or (
            " " not in key and key in firsts.values()
        )
        if key in _HOMOGRAPHS and not has_person_cue:
            eligible = False
        status: Literal["unique", "ambiguous", "unknown"] = "unknown"
        student_id: str | None = None
        if candidates and eligible and not role:
            best = candidates[0][1]
            runner_up = candidates[1][1] if len(candidates) > 1 else 0.0
            if best >= threshold:
                if best - runner_up >= margin:
                    status, student_id = "unique", candidates[0][0]
                else:
                    status = "ambiguous"
        mentions.append(NameMention(start, end, text, status, student_id, candidates))
        index += length
    return mentions
