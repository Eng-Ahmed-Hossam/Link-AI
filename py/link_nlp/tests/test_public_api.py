import link_nlp


def test_public_api_is_explicit() -> None:
    # Round 3 adds RuleAbstention and rule_abstentions; nothing from round 2 changed or went away.
    expected = {
        "RuleAbstention",
        "rule_abstentions",
        "CleanedTranscript",
        "Leak",
        "NameMention",
        "Redacted",
        "RedactedSpan",
        "ResolvedItem",
        "RosterStudent",
        "RuleItem",
        "Tokenised",
        "ValidationResult",
        "VOICE_EXTRACTION_SCHEMA",
        "clean_transcript",
        "confidence_band",
        "detokenise_items",
        "find_name_mentions",
        "find_pii_leaks",
        "normalize_digits",
        "normalize_for_match",
        "redact_contacts",
        "rule_extract",
        "tokenise",
        "validate_extraction",
    }
    assert set(link_nlp.__all__) == expected
    assert all(hasattr(link_nlp, name) for name in expected)
