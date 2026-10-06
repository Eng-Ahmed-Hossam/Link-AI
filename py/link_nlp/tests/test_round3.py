"""Round 3 regressions: every case from docs/ai/handoff-to-codex.md (B1–B20, A3–A5) on synthetic
text, through the whole package pipeline (clean → match → tokenise → rules → validate → detokenise).
A case that is deliberately not fixed asserts the safe behaviour instead (nothing wrong attached)."""

from __future__ import annotations

from typing import Any

import pytest

from link_nlp import (
    RosterStudent,
    clean_transcript,
    detokenise_items,
    find_name_mentions,
    rule_abstentions,
    rule_extract,
    tokenise,
    validate_extraction,
)

# The gold v1 roster (fictional), and the first-names-only roster of the Windows-TTS bench notes.
GOLD = [
    RosterStudent("s01", "أحمد سمير"),
    RosterStudent("s02", "أحمد سامي"),
    RosterStudent("s03", "مريم حسن", ("ميمي",)),
    RosterStudent("s04", "مريم حسين"),
    RosterStudent("s05", "محمود عادل", ("حودة",)),
    RosterStudent("s06", "يوسف فؤاد"),
    RosterStudent("s07", "سلمى طارق"),
    RosterStudent("s08", "عمر خالد"),
    RosterStudent("s09", "نور علي"),
    RosterStudent("s10", "سارة شريف"),
    RosterStudent("s11", "ياسين نبيل"),
    RosterStudent("s12", "هنا وائل"),
    RosterStudent("s13", "مصطفى هشام"),
    RosterStudent("s14", "ملك إيهاب"),
    RosterStudent("s15", "عبد الرحمن فادي"),
    RosterStudent("s16", "حبيبة شادي"),
    RosterStudent("s17", "زياد عاصم"),
    RosterStudent("s18", "جنى عمرو"),
]
FIRST_NAMES = [
    RosterStudent(f"t{i}", name)
    for i, name in enumerate(
        ["مريم", "يوسف", "أحمد س.", "أحمد م.", "ليلى", "زياد", "نور", "عمر", "هنا", "سيف"], 1
    )
]
BY_NAME = {s.display_name: s.id for s in FIRST_NAMES}


def run(note: str, roster: list[RosterStudent], maximum: int | None = 20) -> dict[str, Any]:
    cleaned = clean_transcript(note)
    mentions = find_name_mentions(cleaned.clean, roster)
    tokens = tokenise(cleaned.clean, mentions)
    items = rule_extract(tokens.text, maximum)
    valid = validate_extraction({"items": items}, set(tokens.token_map), maximum)
    assert valid.valid, valid.errors
    resolved = detokenise_items(valid.items, tokens.token_map)
    facts = {
        (r.student_id, r.item["field"], r.item["value"]) for r in resolved if r.status == "resolved"
    }
    flagged = {
        (r.student_id, r.item["field"])
        for i, r in enumerate(resolved)
        if r.status == "resolved" and i in valid.out_of_range
    }
    return {
        "facts": facts,
        "flagged": flagged,
        "mentions": [(m.text, m.status, m.student_id) for m in mentions],
        "mention_objs": mentions,
        "clean": cleaned.clean,
        "tokens": tokens,
        "unresolved": [r for r in resolved if r.status != "resolved"],
    }


# ── Priority 1: a verb is not part of the name (B13–B15, B7, B3) ───────────────────────────────
@pytest.mark.parametrize(
    ("note", "student", "fact"),
    [
        ("سيف ماجاشا النهارده", "سيف", ("attendance", "absent")),  # B13, Whisper spelling
        ("سيف ماجاش النهارده", "سيف", ("attendance", "absent")),
        ("وعمر جهه متأخر ربع ساعة", "عمر", ("late_minutes", 15)),  # B13
        ("ويوسف تأخر عشر دقائق", "يوسف", ("late_minutes", 10)),  # B15, تأخر without ا
        ("يوسف أتأخر عشر دقائق", "يوسف", ("attendance", "late")),  # Whisper: أتأخر
        ("ليلى جابت سبعة تاشر من عشرين", "ليلى", ("score", 17)),
    ],
)
def test_b13_b15_a_verb_after_a_first_name_ends_the_name(note, student, fact) -> None:
    out = run(note, FIRST_NAMES)
    assert (BY_NAME[student], *fact) in out["facts"]
    assert all(" " not in text for text, _s, _id in out["mentions"])  # no "سيف ماجاشا" span


def test_b14_a_habitual_verb_is_not_a_surname() -> None:
    out = run("زياد بيلخبط في إشارات الضرب", FIRST_NAMES)
    assert out["mentions"] == [("زياد", "unique", BY_NAME["زياد"])]


def test_b7_wakan_is_not_a_name_and_a_continuation_clause_carries_participation() -> None:
    note = "نور علي كان حاضر من أول الحصة وجاب تسعتاشر ونص من عشرين، وكان مشارك كويس في حل مثال الإشارات."
    out = run(note, GOLD)
    assert [m for m in out["mentions"] if m[0] != "نور علي"] == []  # «وكان» is not a person
    assert {("s09", "attendance", "present"), ("s09", "score", 19.5)} <= out["facts"]
    assert ("s09", "participation", "high") in out["facts"]


def test_b3_full_name_then_possessive_noun_ends_the_name() -> None:
    out = run("ملك إيهاب مشاركتها عادية النهارده، جاوبت لما سألتها", GOLD)
    assert ("ملك إيهاب", "unique", "s14") in out["mentions"]
    assert ("s14", "participation", "normal") in out["facts"]


# ── Priority 2: A5, an unknown span stops at the name ──────────────────────────────────────────
@pytest.mark.parametrize(
    "note",
    [
        "الحصة الجاية هنبدأ بتصحيحها على السبورة قبل أي شرح جديد",  # B9
        "فخدوا المعلومة على الاسم الكامل اللي قولته بعد التصحيح",  # B9
        "الدرس كان على sign rules وحلينا أمثلة",  # B9, another script
        "الحصة الجاية هنا راجع المعادلات",  # B16 second part
    ],
)
def test_a5_b9_an_unknown_span_never_runs_on_into_ordinary_words(note) -> None:
    out = run(note, GOLD)
    assert all(len(text.split()) <= 2 for text, _s, _id in out["mentions"]), out["mentions"]
    assert out["facts"] == set()


def test_a5_a_real_unknown_full_name_is_still_one_mention() -> None:
    out = run("كريم مجهول غاب", GOLD)
    assert out["mentions"] == [("كريم مجهول", "unknown", None)]
    out = run("عبد الرحمن غاب", [])
    assert out["mentions"] == [("عبد الرحمن", "unknown", None)]


def test_b20_names_before_a_verb_are_not_one_run_on_span() -> None:
    out = run("عمر ونور حلوا كل الواجب. زياد ما عملش الواجب.", FIRST_NAMES)
    assert all("حلوا" not in text for text, _s, _id in out["mentions"])
    assert out["facts"] == set()  # homework is not extracted; nothing invented


# ── A4: only contending candidates for an ambiguous name ────────────────────────────────────────
def test_a4_ambiguous_candidates_are_only_the_contenders() -> None:
    mention = find_name_mentions("أحمد غاب", GOLD)[0]
    assert mention.status == "ambiguous"
    assert {sid for sid, _score in mention.candidates} == {"s01", "s02"}


def test_b10_misheard_name_stays_unknown_with_the_close_roster_name_ranked_first() -> None:
    out = run("ليلة جابت سبعتاشر من عشرين", FIRST_NAMES)
    unknown = [m for m in out["mention_objs"] if m.status == "unknown"]
    assert unknown and unknown[0].student_id is None
    assert unknown[0].candidates[0][0] == BY_NAME["ليلى"]
    assert out["facts"] == set()  # the score is never attached by itself
    assert out["unresolved"] and out["unresolved"][0].status == "who_is_this"


# ── A3: self-corrections in code, and the abstentions exposed ───────────────────────────────────
def test_b2_a_corrected_name_moves_the_fact_to_the_corrected_mention() -> None:
    out = run("مريم... لا قصدي مريم حسين، غابت النهارده.", GOLD)
    assert ("s04", "attendance", "absent") in out["facts"]
    assert not any(f[0] == "s03" for f in out["facts"])
    reasons = {a.reason for a in rule_abstentions(out["tokens"].text)}
    assert "name_corrected" in reasons


def test_b5_a_corrected_predicate_keeps_the_final_statement() -> None:
    note = "أحمد سمير غاب، لا استنى، هو حاضر النهارده؛ أنا كنت باصص على كشف الحصة اللي فاتت."
    out = run(note, GOLD)
    assert ("s01", "attendance", "present") in out["facts"]
    assert ("s01", "attendance", "absent") not in out["facts"]


def test_a3_unclear_correction_and_hypotheticals_abstain_with_a_reason() -> None:
    cases = {
        "أحمد سمير غاب، لا استنى": "correction_unclear",
        "أحمد سمير لو غاب بكره هنكلمه": "negation_or_hypothetical",
        "أحمد سمير غاب الحصة اللي فاتت": "other_session",
    }
    for note, reason in cases.items():
        out = run(note, GOLD)
        assert not any(f[1] == "attendance" for f in out["facts"]), note
        abstentions = rule_abstentions(out["tokens"].text)
        assert [a.reason for a in abstentions] == [reason], note
        assert all(a.token in out["tokens"].token_map for a in abstentions)
        a = abstentions[0]
        assert 0 <= a.start < a.end <= len(out["tokens"].text)


# ── The rest of B1–B20 ───────────────────────────────────────────────────────────────────────────
def test_b1_a_spoken_negative_score_is_kept_and_flagged_never_capped() -> None:
    out = run("زياد عاصم جاب سالب واحد من عشرين، ودي درجة محتاجة مراجعة", GOLD)
    assert ("s17", "score", -1) in out["facts"]
    assert ("s17", "score") in out["flagged"]


def test_b4_participation_in_a_following_clause_about_the_same_student() -> None:
    note = "حودة اتأخر خمس دقايق، لكنه بعد ما دخل كان مشارك كويس في حل السؤال."
    out = run(note, GOLD)
    assert {
        ("s05", "attendance", "late"),
        ("s05", "late_minutes", 5),
        ("s05", "participation", "high"),
    } <= out["facts"]


def test_b6_a_third_of_an_hour_is_twenty_minutes() -> None:
    out = run("سلمى طارق اتأخرت تلت ساعة", GOLD)
    assert {("s07", "attendance", "late"), ("s07", "late_minutes", 20)} <= out["facts"]


def test_b8_each_one_is_not_the_number_one() -> None:
    assert "كل واحد كتب الحل" in run("في آخر الوقت كل واحد كتب الحل", GOLD)["clean"]
    assert "21/20" in run("جاب واحد وعشرين من عشرين", GOLD)["clean"]


def test_b11_split_teens_including_whisper_digit_form() -> None:
    assert run("ليلى جابت 7 تاشر من عشرين", FIRST_NAMES)["clean"].endswith("17/20")
    assert "15/20" in run("خمس تاشر من عشرين", FIRST_NAMES)["clean"]


def test_b12_misspelt_teen_is_not_guessed() -> None:
    # «التاشر» (Whisper for «تلتاشر») is NOT converted: guessing 13 could be wrong. Safe outcome:
    # no score at all (the teacher types it).
    out = run("زياد جابت التاشر من عشرين", FIRST_NAMES)
    assert not any(f[1] == "score" for f in out["facts"])


def test_b16_bare_common_word_name_with_kan_and_a_state() -> None:
    out = run("نور شاركت كويس جدا، وهنا كانت ساكتة طول الحصة.", FIRST_NAMES)
    assert (BY_NAME["هنا"], "participation", "low") in out["facts"]
    assert (BY_NAME["نور"], "participation", "high") in out["facts"]  # B18


def test_b17_bare_scores_once_the_maximum_is_known() -> None:
    note = "عمل الطلبة امتحان قصير من خمستاشر درجة. نور جابت أربعتاشر، وسيف جاب عشرة، وهنا جابت تمانية."
    out = run(note, FIRST_NAMES, maximum=None)
    assert {
        (BY_NAME["نور"], "score", 14),
        (BY_NAME["سيف"], "score", 10),
        (BY_NAME["هنا"], "score", 8),
    } <= out["facts"]
    assert out["flagged"] == set()
    # Without a maximum anywhere, a bare number is not a score.
    assert not any(f[1] == "score" for f in run("نور جابت أربعتاشر", FIRST_NAMES, None)["facts"])


def test_b19_present_and_low_participation_in_one_clause() -> None:
    out = run("مريم حضرت بس مشاركتها كانت قليلة", FIRST_NAMES)
    assert {
        (BY_NAME["مريم"], "attendance", "present"),
        (BY_NAME["مريم"], "participation", "low"),
    } <= out["facts"]


def test_b21_silent_all_session_is_low_participation() -> None:
    out = run("ميمي كانت ساكتة خالص أثناء المناقشة", GOLD)
    assert ("s03", "participation", "low") in out["facts"]


# ── Property: never a wrong student, with first-name-only rosters and verb-adjacent names ───────
VERBS = [
    "غاب", "غابت", "ماجاش", "ماجاشا", "مجاش", "اتأخر", "أتأخر", "تأخر", "جه", "جهه", "جت", "جاب",
    "جابت", "خد", "شارك", "شاركت", "بيلخبط", "بتتكلم", "ساكت", "حضر", "حضرت", "كان", "كانت",
    "وكان", "لو", "مشاركتها", "ماعملش",
]  # fmt: skip
FIRSTS = [
    "مريم", "يوسف", "ليلى", "زياد", "سيف", "سلمى", "ياسين", "حبيبة", "جنى", "مصطفى", "فريدة",
    "رنا", "حمزة", "آدم", "كريم", "سارة", "نور", "هنا", "ملك", "عمر",
]  # fmt: skip
STRANGERS = ["زغلول", "مجهول", "بيومي", "بيشوي", "عاطف", "الشريف"]  # never on these rosters


def _assert_no_wrong(mentions, expected_id: str | None) -> None:
    for m in mentions:
        if m.student_id is not None:
            assert m.student_id == expected_id, (m, expected_id)


def test_property_first_name_rosters_never_point_at_a_wrong_student() -> None:
    import random

    rng = random.Random(4242)
    for _ in range(400):
        names = rng.sample(FIRSTS, 9)
        roster = [RosterStudent(f"p{i}", n) for i, n in enumerate(names)]
        # Two students sharing a first name, told apart by an initial (as the pilot import asks).
        roster += [RosterStudent("pa", "أحمد س."), RosterStudent("pb", "أحمد م.")]
        student = rng.choice(roster[:9])
        verb = rng.choice(VERBS)
        for conj in ("", "و"):
            text = f"{conj}{student.display_name} {verb} النهارده"
            mentions = find_name_mentions(clean_transcript(text).clean, roster)
            _assert_no_wrong(mentions, student.id)
        # A word that is not on the roster between the name and the verb: never the roster student.
        stranger = rng.choice(STRANGERS)
        text = f"{student.display_name} {stranger} {verb}"
        mentions = find_name_mentions(clean_transcript(text).clean, roster)
        _assert_no_wrong(mentions, None)
        # A shared first name before a verb is ambiguous, never one of the two.
        mentions = find_name_mentions(clean_transcript(f"أحمد {verb} النهارده").clean, roster)
        _assert_no_wrong(mentions, None)
        assert all(m.status != "unique" for m in mentions if m.text.startswith("أحمد"))


def test_property_unshared_ordinary_first_names_are_found_before_any_verb() -> None:
    # Recall side of the same property (not homographs: those need a person cue by design).
    ordinary = [n for n in FIRSTS if n not in {"كريم", "نور", "هنا", "ملك", "عمر"}]
    roster = [RosterStudent(f"q{i}", n) for i, n in enumerate(ordinary)]
    for student in roster:
        for verb in VERBS:
            if verb in {"لو", "كان", "كانت", "وكان", "مشاركتها"}:
                continue  # not evidence that a person is meant
            mentions = find_name_mentions(f"{student.display_name} {verb} النهارده", roster)
            assert [(m.status, m.student_id) for m in mentions] == [("unique", student.id)], (
                student.display_name,
                verb,
            )


def test_property_full_name_rosters_with_verbs_and_foreign_surnames() -> None:
    import random

    rng = random.Random(9090)
    firsts = ["أحمد", "مريم", "يوسف", "سلمى", "كريم", "ليلى"]
    lasts = ["سمير", "سامي", "حسن", "حسين", "فوزي", "نادر", "مراد", "رامز"]
    for _ in range(200):
        names = rng.sample([f"{f} {last}" for f in firsts for last in lasts], 10)
        roster = [RosterStudent(f"r{i}", n) for i, n in enumerate(names)]
        student = rng.choice(roster)
        verb = rng.choice(VERBS)
        mentions = find_name_mentions(f"{student.display_name} {verb}", roster)
        _assert_no_wrong(mentions, student.id)
        # Same first name, a surname that is not on the roster, then a verb: never resolved.
        first = student.display_name.split()[0]
        stranger = rng.choice(STRANGERS)
        mentions = find_name_mentions(f"{first} {stranger} {verb}", roster)
        _assert_no_wrong(mentions, None)


def test_placeholders_are_not_names_for_the_leak_check() -> None:
    from link_nlp import find_pii_leaks

    assert find_pii_leaks("<U1> غاب النهارده و<S2> جاب 14/20، كلموا <CONTACT1>", GOLD) == []
    # A real leftover name next to a placeholder is still caught.
    assert "مريم حسن" in [leak.text for leak in find_pii_leaks("<U1> غاب ومريم حسن جت", GOLD)]


def test_a_conjunction_attached_to_a_placeholder_is_not_a_name() -> None:
    from link_nlp import find_pii_leaks

    assert find_pii_leaks("<S1> غابت، و<A1> جاب 14/20، و<S2> اتأخر 10 min", GOLD) == []


def test_english_text_after_an_english_cue_is_not_a_name() -> None:
    from link_nlp import find_pii_leaks

    assert find_pii_leaks("Each student and field at most once", []) == []
    assert find_name_mentions("the student Karim was absent", [])[0].text == "Karim"
