"""Adapter to the NLP core (`link_nlp`, docs/09 §2.3–2.5).

`link_nlp` is built on the Codex track (branch `codex/nlp-eval`, `py/link_nlp`). Until it is merged and
added as a uv path dependency, this module falls back to `_nlp_stub` with the same contract. Every
other module imports from here only, so swapping the stub for the real package touches this file.
"""

from __future__ import annotations

from typing import Any

try:  # the real package (uv path dependency on py/link_nlp, once merged)
    import link_nlp as _impl  # type: ignore[import-not-found]

    STUB = False
except ImportError:  # pragma: no cover - exercised until the merge
    from . import _nlp_stub as _impl

    STUB = True

normalize_for_match = _impl.normalize_for_match
normalize_digits = _impl.normalize_digits
clean_transcript = _impl.clean_transcript
RosterStudent = _impl.RosterStudent
find_name_mentions = _impl.find_name_mentions
tokenise = _impl.tokenise
detokenise_items = _impl.detokenise_items
rule_extract = _impl.rule_extract
VOICE_EXTRACTION_SCHEMA = _impl.VOICE_EXTRACTION_SCHEMA
validate_extraction = _impl.validate_extraction
confidence_band = _impl.confidence_band

NLP_VERSION = f"link_nlp@{getattr(_impl, '__version__', 'stub' if STUB else 'unknown')}"


def display_span(cleaned: Any, start: int, end: int) -> tuple[int, int]:
    """Map a span in the cleaned text back to the display transcript (the receipt the teacher sees)."""
    om = getattr(cleaned, "offset_map", None)
    if isinstance(om, list) and om:
        clamp = lambda i: max(0, min(i, len(om) - 1))  # noqa: E731
        return om[clamp(start)], om[clamp(end)]
    if callable(om):
        return om(start), om(end)
    return start, end
