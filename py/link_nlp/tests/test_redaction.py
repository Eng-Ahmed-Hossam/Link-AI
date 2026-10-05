import pytest

from link_nlp.redaction import find_pii_leaks, redact_contacts
from link_nlp.roster import RosterStudent


@pytest.mark.parametrize(
    "contact",
    [
        "01012345678",
        "٠١٠ ١٢٣ ٤٥٦٧٨",
        "+20 10 1234-5678",
        "0020-11-2345-6789",
        "02 2345 6789",
        "teacher@example.com",
        "@miss_dalia",
    ],
)
def test_redact_contacts_removes_supported_contact(contact: str) -> None:
    result = redact_contacts(f"كلم {contact} دلوقتي")
    assert contact not in result.text
    assert result.spans
    assert result.spans[0].text == contact


def test_find_pii_leaks_finds_roster_alias_first_name_extra_name_and_contact() -> None:
    roster = [RosterStudent("s1", "أحمد سمير", ("حودة",))]
    text = "أحمد سمير وحودة وكريم وميس داليا على ٠١٠ ١٢٣ ٤٥٦٧٨"
    leaks = find_pii_leaks(text, roster, extra_names=("داليا",))
    kinds = {leak.kind for leak in leaks}
    assert {"roster_name", "nickname", "first_name", "extra_name", "contact"} <= kinds


def test_redacted_text_has_no_contact_leak() -> None:
    roster = [RosterStudent("s1", "أحمد سمير")]
    redacted = redact_contacts("<S1> اتصل على +20 10 1234 5678")
    assert find_pii_leaks(redacted.text, roster) == []
