"""The NLP core: `link_nlp` (py/link_nlp, owned by the Codex track; docs/ai/link-nlp.md).

Every other module imports from here only. `link_nlp/__init__` re-exports nothing yet, so the names
come from its submodules (a public API is requested in docs/ai/handoff-to-codex.md).
"""

from __future__ import annotations

from importlib.metadata import version

from link_nlp.normalize import (
    CleanedTranscript,
    clean_transcript,
    normalize_digits,
    normalize_for_match,
)
from link_nlp.roster import NameMention, RosterStudent, find_name_mentions
from link_nlp.rules import rule_extract
from link_nlp.schema import (
    VOICE_EXTRACTION_SCHEMA,
    ValidationResult,
    confidence_band,
    validate_extraction,
)
from link_nlp.tokens import ResolvedItem, Tokenised, detokenise_items, tokenise

NLP_VERSION = f"link_nlp@{version('link-nlp')}"

# link_nlp bands → the app's ConfidenceBand (docs/ai/link-nlp.md "Rule extraction and confidence").
UI_BAND = {"prefill": "high", "check": "medium", "blank": "low"}

__all__ = [
    "NLP_VERSION",
    "UI_BAND",
    "VOICE_EXTRACTION_SCHEMA",
    "CleanedTranscript",
    "NameMention",
    "ResolvedItem",
    "RosterStudent",
    "Tokenised",
    "ValidationResult",
    "clean_transcript",
    "confidence_band",
    "detokenise_items",
    "find_name_mentions",
    "normalize_digits",
    "normalize_for_match",
    "rule_extract",
    "tokenise",
    "validate_extraction",
]
