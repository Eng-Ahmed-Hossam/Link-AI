"""Exact wire schema plus Phase 2 semantic checks and separate blocking metadata."""

from __future__ import annotations

import json
import math
from copy import deepcopy
from dataclasses import dataclass
from importlib.resources import files
from typing import Any, Literal

from jsonschema import Draft202012Validator

VOICE_EXTRACTION_SCHEMA: dict[str, Any] = json.loads(
    files("link_nlp").joinpath("schemas/voice_extraction.schema.json").read_text(encoding="utf-8")
)


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    items: list[dict[str, Any]]
    errors: tuple[str, ...]
    out_of_range: tuple[int, ...] = ()
    dropped_topics: int = 0
    unassigned: tuple[str, ...] = ()


_ALLOWED = {
    "attendance": {"present", "absent", "late"},
    "participation": {"low", "normal", "high"},
    "observation_tag": {
        "understanding",
        "needs_revisit",
        "behaviour",
        "positive",
        "absence_context",
    },
    # Homework has no documented enum: accept only null until a contract is agreed.
    "homework": set(),
}


def confidence_band(
    c: float, high: float = 0.85, low: float = 0.60
) -> Literal["prefill", "check", "blank"]:
    if not math.isfinite(c) or not 0 <= c <= 1 or not 0 <= low <= high <= 1:
        raise ValueError("Confidence and thresholds must be finite probabilities")
    return "prefill" if c >= high else "check" if c >= low else "blank"


def validate_extraction(
    obj: object, sent_tokens: set[str], assessment_max: int | None
) -> ValidationResult:
    if assessment_max is not None and (isinstance(assessment_max, bool) or assessment_max < 0):
        raise ValueError("assessment_max must be nonnegative")
    errors = [e.message for e in Draft202012Validator(VOICE_EXTRACTION_SCHEMA).iter_errors(obj)]
    if errors:
        return ValidationResult(False, [], tuple(errors))
    assert isinstance(obj, dict)
    accepted: list[dict[str, Any]] = []
    ranges: list[int] = []
    dropped = 0
    for index, raw in enumerate(obj["items"]):
        field, value = raw["field"], raw["value"]
        if raw["student"] not in sent_tokens:
            errors.append(f"items[{index}]: token was not sent")
        span = raw["span"]
        if span["start"] < 0 or span["end"] <= span["start"]:
            errors.append(f"items[{index}]: invalid source span")
        if not math.isfinite(raw["confidence"]):
            errors.append(f"items[{index}]: non-finite confidence")
        numeric = isinstance(value, (int, float)) and not isinstance(value, bool)
        if numeric and not math.isfinite(value):
            errors.append(f"items[{index}]: non-finite value")
        if value is not None:
            if field in _ALLOWED and (not isinstance(value, str) or value not in _ALLOWED[field]):
                errors.append(f"items[{index}]: unsupported {field} value")
            elif field in {"score", "late_minutes"} and not numeric:
                errors.append(f"items[{index}]: {field} must be numeric")
            elif field == "late_minutes" and (value < 0 or int(value) != value):
                errors.append(f"items[{index}]: late_minutes must be a nonnegative integer")
            elif field in {"observation", "topic"} and not isinstance(value, str):
                errors.append(f"items[{index}]: {field} must be text")
        if field == "topic":
            dropped += 1
            continue
        if (
            field == "score"
            and numeric
            and (value < 0 or (assessment_max is not None and value > assessment_max))
        ):
            ranges.append(len(accepted))
        accepted.append(deepcopy(raw))
    if errors:
        return ValidationResult(False, [], tuple(errors), dropped_topics=dropped)
    return ValidationResult(
        True, accepted, (), tuple(ranges), dropped, tuple(obj.get("unassigned", []))
    )
