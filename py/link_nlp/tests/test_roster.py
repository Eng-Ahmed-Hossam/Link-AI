import random

import pytest

from link_nlp.roster import RosterStudent, find_name_mentions

ROSTER = (
    RosterStudent("a", "أحمد سمير"),
    RosterStudent("b", "أحمد سامي"),
    RosterStudent("c", "محمود حسن", ("حودة",)),
    RosterStudent("d", "مريم حسن", ("ميمي",)),
)


@pytest.mark.parametrize(
    ("source", "text", "status", "student_id"),
    [
        ("أحمد غاب", "أحمد", "ambiguous", None),
        ("أحمد سامي غاب", "أحمد سامي", "unique", "b"),
        ("حودة جاب 14/20", "حودة", "unique", "c"),
        ("كريم غاب", "كريم", "unknown", None),
        ("أحمد سامر غاب", "أحمد سامر", "unknown", None),
        ("المدرس أحمد سامي شرح", "أحمد سامي", "unknown", None),
        ("ولي الأمر محمود حسن اتصل", "محمود حسن", "unknown", None),
        ("مستر مريم حسن قالت", "مريم حسن", "unknown", None),
        ("والدة مريم حسن اتصلت", "مريم حسن", "unknown", None),
        ("الطالب زغلول غاب", "زغلول", "unknown", None),
    ],
)
def test_identity_status_and_source_span(
    source: str, text: str, status: str, student_id: str | None
) -> None:
    mentions = find_name_mentions(source, ROSTER)
    assert len(mentions) == 1
    mention = mentions[0]
    assert (mention.text, mention.status, mention.student_id) == (text, status, student_id)
    assert source[mention.start : mention.end] == text
    assert (
        tuple(sorted(mention.candidates, key=lambda pair: (-pair[1], pair[0])))
        == mention.candidates
    )


def test_conjunction_and_verb_remain_outside_name() -> None:
    source = "وأحمد سامي غاب ومريم جابت 10/20"
    mentions = find_name_mentions(source, ROSTER)
    assert [mention.text for mention in mentions] == ["أحمد سامي", "مريم"]
    assert source[mentions[0].start - 1] == "و"


def test_word_interior_is_not_a_name() -> None:
    assert find_name_mentions("المحمودية والأحمدية موضوعنا", ROSTER) == []


def test_shared_first_name_is_always_ambiguous() -> None:
    mention = find_name_mentions("أحمد", ROSTER)[0]
    assert mention.status == "ambiguous"
    assert {student for student, _ in mention.candidates[:2]} == {"a", "b"}


def test_threshold_and_margin_control_exact_match() -> None:
    assert find_name_mentions("أحمد سامي", ROSTER, threshold=1.01)[0].status == "unknown"
    assert find_name_mentions("أحمد سامي", ROSTER, margin=1.01)[0].status != "unique"


def test_duplicate_full_names_and_nicknames_never_auto_assign() -> None:
    roster = [
        RosterStudent("a", "أحمد سامي", ("حودة",)),
        RosterStudent("b", "أحمد سامي", ("حودة",)),
    ]
    assert all(
        mention.status == "ambiguous"
        for mention in find_name_mentions("أحمد سامي وحودة غابوا", roster)
    )


def test_random_rosters_never_point_at_wrong_student() -> None:
    rng = random.Random(7381)
    first_names = ["أحمد", "مريم", "عمر", "كريم", "سلمى", "يوسف"]
    surnames = ["سمير", "سامي", "حسن", "حسين", "فوزي", "نادر", "مراد", "رامز"]
    for _ in range(100):
        names = rng.sample([f"{first} {last}" for first in first_names for last in surnames], 12)
        roster = [RosterStudent(f"s{index}", name) for index, name in enumerate(names)]
        for student in rng.sample(roster, 3):
            mentions = find_name_mentions(f"{student.display_name} غاب", roster)
            assert len(mentions) == 1
            assert mentions[0].status == "unique"
            assert mentions[0].student_id == student.id
        first = rng.choice(first_names)
        mention = find_name_mentions(f"{first} مجهول غاب", roster)[0]
        assert mention.status == "unknown"
        assert mention.student_id is None


def test_full_name_initial_and_latin_nickname() -> None:
    roster = [RosterStudent("a", "أحمد س.", ("Hamoudi",))]
    assert find_name_mentions("أحمد س. غاب", roster)[0].student_id == "a"
    assert find_name_mentions("Hamoudi غاب", roster)[0].student_id == "a"


def test_unknown_english_teacher_cue() -> None:
    assert (
        find_name_mentions("teacher Ahmed spoke", [RosterStudent("a", "Ahmed")])[0].status
        == "unknown"
    )


def test_non_roster_surname_that_is_a_first_name_cannot_assign_prefix() -> None:
    roster = [RosterStudent("a", "مريم حسن"), RosterStudent("b", "أحمد سمير")]
    for source in ("مريم حسين غابت", "أحمد سامي غاب", "أحمد حسن غاب"):
        mentions = find_name_mentions(source, roster)
        assert len(mentions) == 1
        assert mentions[0].status == "unknown"
        assert mentions[0].student_id is None


def test_multitoken_first_name_outside_roster_is_detected() -> None:
    mentions = find_name_mentions("عبد الرحمن غاب", [])
    assert len(mentions) == 1
    assert mentions[0].text == "عبد الرحمن"
    assert mentions[0].status == "unknown"


def test_extra_surname_cannot_resolve_by_exact_roster_prefix() -> None:
    mentions = find_name_mentions("أحمد سامي مجهول غاب", ROSTER)
    assert len(mentions) == 1
    assert mentions[0].text == "أحمد سامي مجهول"
    assert mentions[0].status == "unknown"


def test_diacritics_in_roster_name_do_not_split_alias() -> None:
    roster = [RosterStudent("a", "أَحْمَد سَامِي")]
    assert find_name_mentions("أحمد سامي غاب", roster)[0].student_id == "a"


@pytest.mark.parametrize(
    ("word", "source"),
    [
        ("هنا", "المثال هنا"),
        ("هنا", "هنا في الشرح نقطة صعبة"),
        ("هنا", "نقف هنا، جاب أحمد نتيجة كويسة"),
        ("نور", "في نور هنا"),
        ("ملك", "ده ملك المدرسة"),
        ("حسن", "ده حسن الحظ"),
        ("علي", "الشرح علي السبورة"),
        ("جمال", "جمال الفكرة واضح"),
        ("فرح", "في فرح النهارده"),
        ("أمل", "عندي أمل"),
        ("كريم", "المدرس كريم"),
        ("هنا", "المطلوب هنا غاب عن بالنا"),
    ],
)
def test_lexical_homographs_never_assign_without_name_evidence(word: str, source: str) -> None:
    roster = [RosterStudent("a", f"{word} نادر")]
    assert all(mention.student_id is None for mention in find_name_mentions(source, roster))


@pytest.mark.parametrize("word", ["هنا", "نور", "ملك", "حسن", "علي", "جمال", "فرح", "أمل", "كريم"])
def test_full_homograph_name_and_explicit_student_cue_can_identify(word: str) -> None:
    roster = [RosterStudent("a", f"{word} نادر")]
    full_mentions = find_name_mentions(f"{word} نادر غاب", roster)
    assert len(full_mentions) == 1
    assert full_mentions[0].student_id == "a"
    cue_mentions = find_name_mentions(f"الطالب {word} غاب", roster)
    assert len(cue_mentions) == 1
    assert cue_mentions[0].student_id == "a"


@pytest.mark.parametrize("word", ["هنا", "نور", "ملك", "حسن", "جمال", "فرح", "أمل", "كريم"])
def test_immediate_student_action_is_evidence_for_bare_homograph(word: str) -> None:
    roster = [RosterStudent("a", f"{word} نادر")]
    mentions = find_name_mentions(f"{word} جاب 14/20", roster)
    assert len(mentions) == 1
    assert mentions[0].student_id == "a"


def test_action_in_another_sentence_does_not_make_adverb_a_student() -> None:
    roster = [RosterStudent("a", "هنا نادر")]
    assert all(
        mention.student_id is None
        for mention in find_name_mentions("نقف هنا. غاب بعض الطلبة", roster)
    )


def test_longer_full_name_cannot_resolve_through_four_word_prefix() -> None:
    roster = [RosterStudent("a", "أحمد محمد علي حسن")]
    mentions = find_name_mentions("أحمد محمد علي حسن حسين غاب", roster)
    assert len(mentions) == 1
    assert mentions[0].text == "أحمد محمد علي حسن حسين"
    assert mentions[0].status == "unknown"


def test_sentence_period_is_not_part_of_name_but_initial_period_is() -> None:
    roster = [RosterStudent("a", "أحمد سامي")]
    mentions = find_name_mentions("أحمد سامي.", roster)
    assert len(mentions) == 1
    assert mentions[0].text == "أحمد سامي"
    assert mentions[0].student_id == "a"


def test_punctuation_cannot_join_full_alias_parts() -> None:
    roster = [RosterStudent("a", "أحمد سامي"), RosterStudent("b", "أحمد سمير")]
    for source in ("أحمد، سامي غاب", "أحمد. سامي غاب", "أحمد - سامي غاب"):
        assert all(mention.student_id != "a" for mention in find_name_mentions(source, roster))


def test_unlisted_name_before_student_action_is_redacted_unknown() -> None:
    from link_nlp.tokens import tokenise

    roster = [RosterStudent("a", "أحمد سامي")]
    source = "نجاتي غاب"
    mentions = find_name_mentions(source, roster)
    assert len(mentions) == 1
    assert mentions[0].text == "نجاتي"
    assert mentions[0].status == "unknown"
    assert mentions[0].student_id is None
    assert tokenise(source, mentions).text == "<U1> غاب"


@pytest.mark.parametrize(
    "source",
    ["الكل حضروا", "كلهم غابوا", "هو غاب", "المجموعة حضرت", "أنا حضرت", "الباقي حضر", "محدش غاب"],
)
def test_collective_or_grammar_subject_is_not_an_unknown_person(source: str) -> None:
    assert find_name_mentions(source, ROSTER) == []


def test_suffix_action_does_not_guess_near_roster_identity() -> None:
    roster = [RosterStudent("a", "نجاد سامي")]
    mention = find_name_mentions("نجاتي غاب", roster)[0]
    assert mention.status == "unknown"
    assert mention.student_id is None


@pytest.mark.parametrize(
    "name",
    ["هنا", "نور", "أمل", "هدى", "سماح", "حسن", "كريم", "سعيد", "أمير", "جميلة", "منى", "رحمة"],
)
def test_everyday_word_first_names_need_person_cue(name: str) -> None:
    roster = [RosterStudent("s1", f"{name} عادل")]
    assert find_name_mentions(f"الشرح {name} كان واضح", roster) == []
    assert find_name_mentions(f"يا {name} ركزي", roster)[0].status == "unique"
    assert find_name_mentions(f"{name} غابت", roster)[0].status == "unique"
    assert find_name_mentions(f"{name} عادل فهمت", roster)[0].status == "unique"


def test_misheard_layla_is_unknown_with_ranked_candidate() -> None:
    roster = [RosterStudent("s1", "ليلى حسن"), RosterStudent("s2", "مريم علي")]
    mention = find_name_mentions("ليلة غابت", roster)[0]
    assert mention.status == "unknown"
    assert mention.student_id is None
    assert mention.candidates[0][0] == "s1"
    assert mention.candidates[0][1] < 0.85
