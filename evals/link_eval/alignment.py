"""Align name occurrences through transcript text, without consulting student IDs."""

from __future__ import annotations

import re
from itertools import pairwise
from typing import Any

from link_nlp.normalize import normalize_for_match

Json = dict[str, Any]
Token = tuple[str, int, int]


def _tokens(text: str, boundaries: set[int] | None = None) -> list[Token]:
    tokens: list[Token] = []
    for match in re.finditer(r"[\w\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]+", text):
        cuts = (
            [match.start()]
            + sorted(c for c in (boundaries or set()) if match.start() < c < match.end())
            + [match.end()]
        )
        for start, end in pairwise(cuts):
            normalized = normalize_for_match(text[start:end])
            if normalized:
                tokens.append((normalized, start, end))
    return tokens


def _mention_tokens(text: str, mentions: list[Json]) -> list[Token]:
    boundaries: set[int] = set()
    for mention in mentions:
        start, end = mention.get("start"), mention.get("end")
        if (
            isinstance(start, int)
            and isinstance(end, int)
            and end <= len(text)
            and normalize_for_match(text[start:end]) == normalize_for_match(mention["text"])
        ):
            boundaries.update((start, end))
    return _tokens(text, boundaries)


def _intervals(
    text: str, tokens: list[Token], mentions: list[Json]
) -> list[tuple[int, int] | None]:
    intervals: list[tuple[int, int] | None] = []
    for mention in mentions:
        phrase = tuple(t[0] for t in _tokens(mention["text"]))
        start, end = mention.get("start"), mention.get("end")
        if (
            isinstance(start, int)
            and isinstance(end, int)
            and end <= len(text)
            and tuple(t[0] for t in _tokens(text[start:end])) == phrase
        ):
            included = [
                i for i, token in enumerate(tokens) if token[1] >= start and token[2] <= end
            ]
            if included:
                intervals.append((included[0], included[-1] + 1))
                continue
        matches = [
            (i, i + len(phrase))
            for i in range(len(tokens) - len(phrase) + 1)
            if phrase and tuple(t[0] for t in tokens[i : i + len(phrase)]) == phrase
        ]
        # A repeated name cannot be located from list order: the detector may
        # have omitted earlier occurrences or used another coordinate system.
        # Only an unambiguous textual location can recover missing/wrong offsets.
        intervals.append(matches[0] if len(matches) == 1 else None)
    return intervals


def _distance_rows(reference: list[str], hypothesis: list[str]) -> list[list[int]]:
    rows = [list(range(len(hypothesis) + 1))]
    for i, ref in enumerate(reference, 1):
        row = [i]
        for j, hyp in enumerate(hypothesis, 1):
            row.append(
                min(
                    row[-1] + 1,
                    rows[-1][j] + 1,
                    rows[-1][j - 1] if ref == hyp else len(reference) + len(hypothesis) + 1,
                )
            )
        rows.append(row)
    return rows


def _token_options(reference: list[str], hypothesis: list[str]) -> list[set[int | None]]:
    """All optimal exact-word edit anchors, with substitutions in bounded equal gaps.

    Insert/delete alignment preserves the longest exact context instead of treating a
    deleted sentence and an inserted sentence as cheaper unrelated substitutions.
    Ambiguous repeated-word anchors retain all possibilities for review.
    """
    forward = _distance_rows(reference, hypothesis)
    reverse = _distance_rows(reference[::-1], hypothesis[::-1])
    n, m = len(reference), len(hypothesis)
    optimum = forward[n][m]
    options: list[set[int | None]] = [set() for _ in hypothesis]
    for j, hyp in enumerate(hypothesis):
        for i in range(n + 1):
            if forward[i][j] + 1 + reverse[n - i][m - j - 1] == optimum:
                options[j].add(None)
            if (
                i < n
                and reference[i] == hyp
                and forward[i][j] + reverse[n - i - 1][m - j - 1] == optimum
            ):
                options[j].add(i)
    anchors = (
        [(-1, -1)]
        + [
            (j, next(iter(values)))
            for j, values in enumerate(options)
            if len(values) == 1 and None not in values
        ]
        + [(m, n)]
    )
    for (left_h, left_r), (right_h, right_r) in pairwise(anchors):
        assert left_r is not None and right_r is not None
        h_gap, r_gap = right_h - left_h - 1, right_r - left_r - 1
        if (
            h_gap == r_gap
            and h_gap
            and all(options[j] == {None} for j in range(left_h + 1, right_h))
        ):
            for delta in range(1, h_gap + 1):
                options[left_h + delta] = {left_r + delta}
    return options


def align_mentions(
    reference_text: str,
    predicted_text: str,
    expected: list[Json],
    predicted: list[Json],
) -> list[tuple[str, int | None]]:
    """Return aligned gold occurrence, proven extra, or uncertainty per prediction.

    Offsets are accepted only when they locate that mention in its own transcript.
    Shared coordinate labels alone never override text evidence.
    """
    ref_tokens, hyp_tokens = (
        _mention_tokens(reference_text, expected),
        _mention_tokens(predicted_text, predicted),
    )
    ref_intervals = _intervals(reference_text, ref_tokens, expected)
    hyp_intervals = _intervals(predicted_text, hyp_tokens, predicted)
    options = _token_options([t[0] for t in ref_tokens], [t[0] for t in hyp_tokens])
    owner: dict[int, int] = {}
    for index, interval in enumerate(ref_intervals):
        if interval is not None:
            for position in range(*interval):
                owner[position] = index
    results: list[tuple[str, int | None]] = []
    used: set[int] = set()
    for interval in hyp_intervals:
        if interval is None:
            results.append(("uncertain", None))
            continue
        owners: set[int] = set()
        nonname = False
        for position in range(*interval):
            for candidate in options[position]:
                if candidate is not None:
                    if candidate in owner:
                        owners.add(owner[candidate])
                    else:
                        nonname = True
        coherent = {
            index
            for index in owners
            if all(
                any(
                    candidate is None or owner.get(candidate) == index
                    for candidate in options[position]
                )
                for position in range(*interval)
            )
        }
        if len(coherent) == 1 and not nonname:
            index = next(iter(coherent))
            results.append(("extra", index) if index in used else ("aligned", index))
            used.add(index)
        elif not owners and all(i is not None for i in ref_intervals):
            results.append(("extra", None))
        else:
            results.append(("uncertain", None))
    return results
