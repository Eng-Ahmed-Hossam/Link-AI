"""The NLP core: `link_nlp` (py/link_nlp; docs/ai/link-nlp.md). Every other module imports from here.

Names come from the package's public API (`link_nlp.__all__`, stable since round 2).
"""

from __future__ import annotations

from importlib.metadata import version

from link_nlp import (
    VOICE_EXTRACTION_SCHEMA,
    CleanedTranscript,
    Leak,
    NameMention,
    Redacted,
    ResolvedItem,
    RosterStudent,
    RuleAbstention,
    Tokenised,
    ValidationResult,
    clean_transcript,
    confidence_band,
    detokenise_items,
    find_name_mentions,
    find_pii_leaks,
    normalize_digits,
    normalize_for_match,
    redact_contacts,
    rule_abstentions,
    rule_extract,
    tokenise,
    validate_extraction,
)

NLP_VERSION = f"link_nlp@{version('link-nlp')}"

# link_nlp bands → the app's ConfidenceBand (docs/ai/link-nlp.md "Rule extraction and confidence").
UI_BAND = {"prefill": "high", "check": "medium", "blank": "low"}

__all__ = [
    "NLP_VERSION",
    "UI_BAND",
    "VOICE_EXTRACTION_SCHEMA",
    "CleanedTranscript",
    "Leak",
    "NameMention",
    "Redacted",
    "ResolvedItem",
    "RosterStudent",
    "RuleAbstention",
    "Tokenised",
    "ValidationResult",
    "clean_transcript",
    "confidence_band",
    "detokenise_items",
    "find_name_mentions",
    "find_pii_leaks",
    "normalize_digits",
    "normalize_for_match",
    "redact_contacts",
    "rule_abstentions",
    "rule_extract",
    "tokenise",
    "validate_extraction",
]
