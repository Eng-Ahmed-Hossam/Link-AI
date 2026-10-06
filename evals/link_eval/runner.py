from __future__ import annotations

import copy
import json
import math
import tempfile
from collections import Counter, defaultdict
from collections.abc import Sequence
from pathlib import Path
from typing import Any, TypeGuard, cast

from link_nlp.normalize import normalize_for_match
from link_nlp.schema import confidence_band

from .alignment import align_mentions

Json = dict[str, Any]
FIELDS = (
    "attendance",
    "late_minutes",
    "score",
    "participation",
    "homework",
    "observation",
    "observation_tag",
)


def _object_pairs(pairs: list[tuple[str, Any]]) -> Json:
    result: Json = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def _read(path: Path) -> Json:
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"), object_pairs_hook=_object_pairs)
    except (OSError, ValueError) as exc:
        raise ValueError(f"Invalid JSON in {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected a JSON object")  # noqa: TRY004 - uniform external-input error
    return cast(Json, value)


def _string(obj: Json, key: str, *, empty: bool = False) -> str:
    value = obj.get(key)
    if not isinstance(value, str) or (not empty and not value.strip()):
        raise ValueError(f"{key} must be a {'possibly empty ' if empty else ''}string")
    return value


def _objects(obj: Json, key: str) -> list[Json]:
    value = obj.get(key)
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise ValueError(f"{key} must be an array of objects")
    return cast(list[Json], value)


def _strings(obj: Json, key: str) -> list[str]:
    value = obj.get(key)
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ValueError(f"{key} must be an array of strings")
    return cast(list[str], value)


def _number(value: object) -> TypeGuard[int | float]:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _validate_mentions(mentions: list[Json], roster_ids: set[str] | None = None) -> None:
    for mention in mentions:
        _string(mention, "text")
        if mention.get("status") not in ("unique", "ambiguous", "unknown"):
            raise ValueError("mention status must be unique, ambiguous or unknown")
        identity = mention.get("student_id")
        if identity is not None and (not isinstance(identity, str) or not identity):
            raise ValueError("mention student_id must be a string or null")
        if mention["status"] == "unique" and identity is None:
            raise ValueError("unique mention requires student_id")
        if roster_ids is not None and identity is not None and identity not in roster_ids:
            raise ValueError("gold mention points outside the roster")
        if roster_ids is not None and mention["status"] != "unique" and identity is not None:
            raise ValueError("unresolved gold mention cannot have a student_id")
        if "start" in mention or "end" in mention:
            start, end = mention.get("start"), mention.get("end")
            if type(start) is not int or type(end) is not int or start < 0 or end <= start:
                raise ValueError("mention offsets must be integers with 0 <= start < end")


def _validate_items(items: list[Json], prediction: bool) -> None:
    for item in items:
        _string(item, "student_id")
        if item.get("field") not in FIELDS:
            raise ValueError("unsupported evaluation field")
        value = item.get("value")
        if "value" not in item or (
            value is not None and not isinstance(value, str) and not _number(value)
        ):
            raise ValueError("item value must be a string, finite number, or null")
        if prediction:
            confidence = item.get("confidence")
            if not _number(confidence) or not 0 <= confidence <= 1:
                raise ValueError("prediction item confidence must be between 0 and 1")


def load_gold(directory: Path) -> list[Json]:
    if not directory.is_dir():
        raise ValueError(f"Gold directory does not exist: {directory}")
    notes: list[Json] = []
    ids: set[str] = set()
    for path in sorted(directory.rglob("*.json")):
        note = _read(path)
        identity = _string(note, "id")
        if identity in ids or path.stem != identity:
            raise ValueError(f"Duplicate or filename-mismatched gold id: {path}")
        ids.add(identity)
        if note.get("data_class") not in ("synthetic", "real"):
            raise ValueError("data_class must be synthetic or real")
        _string(note, "reference_transcript", empty=True)
        audio = Path(_string(note, "audio_file"))
        if audio.is_absolute() or ".." in audio.parts:
            raise ValueError("audio_file must be a relative path inside the gold directory")
        recording = note.get("recording")
        if not isinstance(recording, dict):
            raise ValueError("recording must be an object")  # noqa: TRY004 - uniform external-input error
        _string(recording, "condition")
        _string(recording, "speaker")
        roster = _objects(note, "roster")
        roster_ids = {_string(student, "id") for student in roster}
        if len(roster_ids) != len(roster):
            raise ValueError("roster ids must be unique")
        for student in roster:
            _string(student, "display_name")
        _validate_mentions(_objects(note, "expected_mentions"), roster_ids)
        expected = _objects(note, "expected_items")
        _validate_items(expected, False)
        if any(item["student_id"] not in roster_ids for item in expected):
            raise ValueError("gold item points outside roster")
        unmentioned = _strings(note, "expected_unmentioned")
        if not set(unmentioned) <= roster_ids:
            raise ValueError("expected_unmentioned points outside roster")
        _strings(note, "hard_case_tags")
        _objects(note, "expected_needs_identity")
        note["_audio_exists"] = (path.parent / audio).is_file()
        notes.append(note)
    if not notes:
        raise ValueError("Gold directory contains no JSON notes")
    return notes


def load_predictions(directory: Path, ids: set[str]) -> dict[str, Json]:
    if not directory.is_dir():
        raise ValueError(f"Prediction directory does not exist: {directory}")
    predictions: dict[str, Json] = {}
    for path in sorted(directory.glob("*.json")):
        if not path.name.endswith(".pred.json"):
            raise ValueError(f"Unexpected prediction filename: {path.name}")
        pred = _read(path)
        identity = _string(pred, "id")
        if identity not in ids or path.name != f"{identity}.pred.json" or identity in predictions:
            raise ValueError(f"Extraneous, duplicate or filename-mismatched prediction id: {path}")
        _string(pred, "model_version")
        _string(pred, "transcript", empty=True)
        _validate_mentions(_objects(pred, "mentions"))
        _validate_items(_objects(pred, "items"), True)
        _objects(pred, "needs_identity")
        if "latency_ms" in pred and (not _number(pred["latency_ms"]) or pred["latency_ms"] < 0):
            raise ValueError("latency_ms must be a finite nonnegative number when supplied")
        predictions[identity] = pred
    return predictions


def _edits(reference: Sequence[str], hypothesis: Sequence[str]) -> int:
    if reference == hypothesis:
        return 0
    row = list(range(len(hypothesis) + 1))
    for i, ref in enumerate(reference, 1):
        next_row = [i]
        for j, hyp in enumerate(hypothesis, 1):
            next_row.append(min(next_row[-1] + 1, row[j] + 1, row[j - 1] + (ref != hyp)))
        row = next_row
    return row[-1]


def _ratio(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def _prf(tp: int, predicted: int, expected: int) -> Json:
    precision, recall = _ratio(tp, predicted), _ratio(tp, expected)
    f1 = 2 * tp / (predicted + expected) if predicted + expected else None
    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "true_positive": tp,
        "false_positive": predicted - tp,
        "false_negative": expected - tp,
        "predicted": predicted,
        "expected": expected,
    }


def _item_key(item: Json) -> tuple[str, str, str]:
    value = item["value"]
    if _number(value) and float(value).is_integer():
        value = int(value)
    return (
        item["student_id"],
        item["field"],
        json.dumps(value, ensure_ascii=False, sort_keys=True),
    )


def _percentile(values: list[float], quantile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * quantile
    low = math.floor(position)
    high = math.ceil(position)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def _metrics(
    notes: list[Json], predictions: dict[str, Json]
) -> tuple[Json, list[Json], list[Json], list[Json]]:
    words = chars = word_edits = char_edits = expected_names = assigned_names = correct_names = 0
    predicted_fields: dict[str, Counter[tuple[str, str, str]]] = defaultdict(Counter)
    expected_fields: dict[str, Counter[tuple[str, str, str]]] = defaultdict(Counter)
    tp_fields: Counter[str] = Counter()
    blank = emitted = unmentioned_errors = 0
    latencies: list[float] = []
    wrong: list[Json] = []
    uncertain: list[Json] = []
    unsafe_items: list[Json] = []
    for note in notes:
        pred = predictions.get(note["id"], {"transcript": "", "mentions": [], "items": []})
        ref_text, hyp_text = (
            normalize_for_match(note["reference_transcript"]),
            normalize_for_match(pred["transcript"]),
        )
        words += len(ref_text.split())
        chars += len(ref_text)
        word_edits += _edits(ref_text.split(), hyp_text.split())
        char_edits += _edits(list(ref_text), list(hyp_text))
        expected_names += sum(m["status"] == "unique" for m in note["expected_mentions"])
        aligned = align_mentions(
            note["reference_transcript"],
            pred["transcript"],
            note["expected_mentions"],
            pred["mentions"],
        )
        roster_ids = {student["id"] for student in note["roster"]}
        for mention, (alignment, index) in zip(pred["mentions"], aligned, strict=True):
            if mention.get("student_id") is None:
                continue
            assigned_names += 1
            expected = note["expected_mentions"][index] if index is not None else None
            case = {
                "id": note["id"],
                "text": mention["text"],
                "predicted_student_id": mention["student_id"],
                "predicted_status": mention["status"],
                "expected": expected,
            }
            if (
                alignment == "uncertain"
                and mention["student_id"] in roster_ids
                and mention["status"] == "unique"
            ):
                uncertain.append(
                    dict(
                        case,
                        reason="transcript occurrence alignment requires human review",
                    )
                )
                continue
            correct = (
                alignment == "aligned"
                and expected is not None
                and expected["status"] == "unique"
                and mention["status"] == "unique"
                and expected["student_id"] == mention["student_id"]
            )
            if correct:
                correct_names += 1
            else:
                wrong.append(
                    dict(
                        case,
                        reason="auto-assignment does not match a unique gold occurrence",
                    )
                )
        local_expected: dict[str, Counter[tuple[str, str, str]]] = defaultdict(Counter)
        local_predicted: dict[str, Counter[tuple[str, str, str]]] = defaultdict(Counter)
        for item in note["expected_items"]:
            local_expected[item["field"]][_item_key(item)] += 1
        uniquely_mentioned = {
            m["student_id"] for m in note["expected_mentions"] if m["status"] == "unique"
        }
        for item in pred["items"]:
            if item["student_id"] not in roster_ids:
                raise ValueError(f"{note['id']}: prediction item student_id is outside the roster")
            if item["student_id"] not in uniquely_mentioned:
                unsafe_items.append(
                    {
                        "id": note["id"],
                        "student_id": item["student_id"],
                        "field": item["field"],
                        "reason": "item assigned without a unique gold student identity",
                    }
                )
            local_predicted[item["field"]][_item_key(item)] += 1
            emitted += 1
            blank += confidence_band(item["confidence"]) == "blank"
            unmentioned_errors += item["student_id"] in note["expected_unmentioned"]
        for field in FIELDS:
            expected_fields[field].update(local_expected[field])
            predicted_fields[field].update(local_predicted[field])
            tp_fields[field] += sum((local_expected[field] & local_predicted[field]).values())
        if "latency_ms" in pred:
            latencies.append(float(pred["latency_ms"]))
    fields = {
        field: _prf(
            tp_fields[field],
            sum(predicted_fields[field].values()),
            sum(expected_fields[field].values()),
        )
        for field in FIELDS
    }
    return (
        {
            "wer": _ratio(word_edits, words),
            "cer": _ratio(char_edits, chars),
            "word_edits": word_edits,
            "reference_words": words,
            "character_edits": char_edits,
            "reference_characters": chars,
            "names": _prf(correct_names, assigned_names, expected_names),
            "wrong_student_rate": _ratio(len(wrong), assigned_names) if assigned_names else 0.0,
            "wrong_student_count": len(wrong),
            "alignment_uncertain_count": len(uncertain),
            "unsafe_item_identity_count": len(unsafe_items),
            "autoassigned_names": assigned_names,
            "fields": fields,
            "score_exact_match": fields["score"]["recall"],
            "score_exact_denominator": fields["score"]["expected"],
            "abstain_rate": _ratio(blank, emitted),
            "blank_items": blank,
            "emitted_items": emitted,
            "unmentioned_handling_errors": unmentioned_errors,
            "latency_p50_ms": _percentile(latencies, 0.5),
            "latency_p95_ms": _percentile(latencies, 0.95),
            "latency_observations": len(latencies),
        },
        wrong,
        uncertain,
        unsafe_items,
    )


def evaluate(gold_dir: Path, predictions_dir: Path) -> Json:
    notes = load_gold(gold_dir)
    predictions = load_predictions(predictions_dir, {note["id"] for note in notes})
    metrics, wrong, uncertain, unsafe_items = _metrics(notes, predictions)
    missing = [note["id"] for note in notes if note["id"] not in predictions]
    speakers = {
        note["recording"]["speaker"]
        for note in notes
        if note["_audio_exists"]
        and note["recording"]["speaker"].casefold() not in ("to-fill", "unknown", "")
    }
    breakdowns: Json = {}
    for category in ("hard_case_tags", "recording_condition", "model_version"):
        groups: dict[str, list[Json]] = defaultdict(list)
        for note in notes:
            labels = (
                note["hard_case_tags"]
                if category == "hard_case_tags"
                else [note["recording"]["condition"]]
                if category == "recording_condition"
                else [predictions.get(note["id"], {}).get("model_version", "missing_prediction")]
            )
            for label in labels:
                groups[label].append(note)
        breakdowns[category] = {
            label: dict(_metrics(group, predictions)[0], notes=len(group))
            for label, group in sorted(groups.items())
        }
    return {
        "format_version": 1,
        "gold_dir": str(gold_dir),
        "predictions_dir": str(predictions_dir),
        "release_gate": "FAIL"
        if wrong or unsafe_items
        else "INCOMPLETE"
        if missing or uncertain
        else "PASS",
        "metrics": metrics,
        "wrong_student_cases": wrong,
        "alignment_uncertain_cases": uncertain,
        "unsafe_item_identity_cases": unsafe_items,
        "missing_prediction_ids": missing,
        "breakdowns": breakdowns,
        "model_versions": sorted({pred["model_version"] for pred in predictions.values()}),
        "sample_sizes": {
            "notes": len(notes),
            "synthetic_notes": sum(note["data_class"] == "synthetic" for note in notes),
            "real_notes": sum(note["data_class"] == "real" for note in notes),
            "predictions": len(predictions),
            "speakers": len(speakers),
            "missing_recordings": sum(not note["_audio_exists"] for note in notes),
            "latency_observations": metrics["latency_observations"],
        },
    }


def _display(value: object) -> str:
    if value is None:
        return "N/A"
    return (
        f"{value:.4f}"
        if isinstance(value, float)
        else str(value).replace("|", "\\|").replace("\n", " ")
    )


def _flat_metrics(report: Json) -> Json:
    metrics = report["metrics"]
    flat = {key: value for key, value in metrics.items() if key not in ("fields", "names")}
    for key, value in metrics["names"].items():
        flat[f"name_{key}"] = value
    for field, values in metrics["fields"].items():
        for key, value in values.items():
            flat[f"{field}_{key}"] = value
    return flat


def write_report(report: Json, out: Path) -> None:
    samples, metrics = report["sample_sizes"], report["metrics"]
    source = (
        "synthetic notes"
        if not samples["real_notes"]
        else "notes (synthetic and/or consented real)"
    )
    reference_only = bool(report["model_versions"]) and all(
        "reference-ceiling" in version or "selftest" in version
        for version in report["model_versions"]
    )
    caveat = (
        "These reference-text selftest results are software checks; they do not measure accuracy on real teacher speech. "
        if reference_only
        else "The metrics compare supplied predictions with human references. "
        + (
            "All notes are synthetic; accuracy on real teacher speech is not measured. "
            if not samples["real_notes"]
            else ""
        )
    )
    summary = (
        f"On {samples['notes']} {source}, {samples['predictions']} predictions were evaluated; "
        f"{samples['speakers']} identified speakers have available recordings. "
        f"WER was {_display(metrics['wer'])}, CER {_display(metrics['cer'])}, and "
        f"{metrics['wrong_student_count']} of {metrics['autoassigned_names']} automatic name assignments were wrong. "
        f"The identity gate is {report['release_gate']}. {samples['missing_recordings']} recordings are missing. "
        f"{caveat}"
        "A prediction file alone does not prove that a speech model processed audio."
    )
    lines = [
        summary,
        "",
        f"# {report['release_gate']} — identity release gate",
        "",
        "| Metric | Value |",
        "|---|---:|",
    ]
    lines += [f"| {key} | {_display(value)} |" for key, value in _flat_metrics(report).items()]
    lines += ["", "## Sample sizes", "", "| Sample | Count |", "|---|---:|"]
    lines += [f"| {key} | {value} |" for key, value in samples.items()]
    lines += [
        "",
        "Model versions: " + ", ".join(_display(model) for model in report["model_versions"]),
        "",
        "Missing predictions: " + (", ".join(report["missing_prediction_ids"]) or "none"),
        "",
        "## Wrong-student cases",
        "",
    ]
    if report["wrong_student_cases"]:
        lines += [
            f"- `{json.dumps(case, ensure_ascii=False)}`" for case in report["wrong_student_cases"]
        ]
    else:
        lines.append("None.")
    lines += ["", "## Alignment requiring review", ""]
    lines += [
        f"- `{json.dumps(case, ensure_ascii=False)}`"
        for case in report["alignment_uncertain_cases"]
    ] or ["None."]
    lines += ["", "## Unsafe item identities", ""]
    lines += [
        f"- `{json.dumps(case, ensure_ascii=False)}`"
        for case in report["unsafe_item_identity_cases"]
    ] or ["None."]
    for category, groups in report["breakdowns"].items():
        lines += [
            "",
            f"## Breakdown: {category}",
            "",
            "| Group | Notes | WER | CER | Name precision | Name recall | Wrong-student rate | Score exact | Abstain | Unmentioned errors | p95 ms |",
            "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
        ]
        for label, m in groups.items():
            values = [
                label,
                m["notes"],
                m["wer"],
                m["cer"],
                m["names"]["precision"],
                m["names"]["recall"],
                m["wrong_student_rate"],
                m["score_exact_match"],
                m["abstain_rate"],
                m["unmentioned_handling_errors"],
                m["latency_p95_ms"],
            ]
            lines.append("| " + " | ".join(_display(value) for value in values) + " |")
        lines += [
            "",
            "| Group | Field | Expected | Predicted | Precision | Recall | F1 |",
            "|---|---|---:|---:|---:|---:|---:|",
        ]
        for label, m in groups.items():
            for field, f in m["fields"].items():
                lines.append(
                    "| "
                    + " | ".join(
                        _display(v)
                        for v in [
                            label,
                            field,
                            f["expected"],
                            f["predicted"],
                            f["precision"],
                            f["recall"],
                            f["f1"],
                        ]
                    )
                    + " |"
                )
    lines += [
        "",
        "## Metric definitions and caveats",
        "",
        "WER/CER use aggregate Levenshtein edits after normalize_for_match (CER includes spaces). Missing predictions contribute deletions and missed expected fields; completeness is required for PASS. Empty denominators are N/A.",
        "Name precision/recall evaluate automatic student assignments against unique gold name occurrences. Occurrences are located in their own transcripts (validated offsets, otherwise normalized word occurrences), then aligned independently of IDs through optimal exact-word edit anchors and bounded substitution gaps. Shared coordinate labels do not establish alignment. Confirmed extra assignments and assignments on ambiguous/unknown occurrences block release. Unlocatable or multiply aligned assignments are listed separately, count as unmatched for precision/recall, and force INCOMPLETE rather than being falsely labelled wrong. The name wrong-student rate measures mention assignments; the separate unsafe-item identity count also blocks release when an item is attached without a unique gold identity. Item IDs outside the roster are rejected as invalid input.",
        "Field metrics compare per-note multisets of (student_id, field, value), so duplicates count as false positives. Score exact match is correct score occurrences divided by all expected score occurrences, including missed scores. All emitted proposals are evaluated even in the blank band; abstain is confidence < 0.60 divided by emitted items. It does not measure entirely omitted fields.",
        "Latency percentiles use linear interpolation over supplied nonnegative latencies only. Audio duration is unavailable, so these are per-note values, not duration-normalized measurements per one-minute note. Cost is unavailable in the prediction contract and is not measured. No vendor-regression tolerance is specified; compare results for review.",
        "Hard-case groups overlap. Placeholder speakers (to-fill/unknown) are excluded, and speakers count only when their recording exists. Gold references must remain locked; use a separate development set for tuning.",
    ]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    out.with_suffix(".json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def compare_reports(left: Path, right: Path) -> str:
    a = _read(left if left.suffix == ".json" else left.with_suffix(".json"))
    b = _read(right if right.suffix == ".json" else right.with_suffix(".json"))
    if a.get("format_version") != 1 or b.get("format_version") != 1:
        raise ValueError("Unsupported report format")
    ma, mb = _flat_metrics(a), _flat_metrics(b)
    lines = [
        f"| Metric | {_display(left.name)} | {_display(right.name)} |",
        "|---|---:|---:|",
        f"| release_gate | {a['release_gate']} | {b['release_gate']} |",
    ]
    lines += [
        f"| {key} | {_display(ma.get(key))} | {_display(mb.get(key))} |"
        for key in sorted(ma.keys() | mb.keys())
    ]
    lines += [
        "",
        "Review sample sizes and model versions in each source report; no regression tolerance has been specified.",
    ]
    return "\n".join(lines)


def selftest(gold_dir: Path, *, unlock_gold: bool = False) -> Json:
    gold_root = gold_dir.parent if gold_dir.name in {"synthetic", "real"} else gold_dir
    if not unlock_gold:
        from .gold_lock import verify_lock

        verify_lock(gold_root)
    notes = load_gold(gold_dir)
    with tempfile.TemporaryDirectory(prefix="link-eval-") as temp:
        root = Path(temp)
        perfect, broken = root / "perfect", root / "broken"
        perfect.mkdir()
        broken.mkdir()
        for note in notes:
            pred: Json = {
                "id": note["id"],
                "model_version": "reference-ceiling-selftest",
                "transcript": note["reference_transcript"],
                "mentions": copy.deepcopy(note["expected_mentions"]),
                "items": [dict(item, confidence=1.0) for item in note["expected_items"]],
                "needs_identity": copy.deepcopy(note["expected_needs_identity"]),
            }
            (perfect / f"{note['id']}.pred.json").write_text(
                json.dumps(pred, ensure_ascii=False), encoding="utf-8"
            )
            pred["transcript"] = ""
            for mention in pred["mentions"]:
                mention["student_id"] = "deliberately-wrong-id"
            for item in pred["items"]:
                item["value"] = "deliberately-wrong-value"
                item["confidence"] = 0.2
            (broken / f"{note['id']}.pred.json").write_text(
                json.dumps(pred, ensure_ascii=False), encoding="utf-8"
            )
        good, bad = evaluate(gold_dir, perfect), evaluate(gold_dir, broken)
        assert good["release_gate"] == "PASS"
        assert good["metrics"]["wer"] in (0, None) and good["metrics"]["cer"] in (
            0,
            None,
        )
        for field in FIELDS:
            if good["metrics"]["fields"][field]["expected"]:
                assert good["metrics"]["fields"][field]["f1"] == 1
                assert bad["metrics"]["fields"][field]["f1"] == 0
        assert good["metrics"]["wrong_student_rate"] == 0
        assert bad["release_gate"] == "FAIL", (
            "Selftest gold must contain at least one person mention"
        )
        assert bad["metrics"]["wrong_student_rate"] == 1
        assert bad["metrics"]["wer"] in (1, None) and bad["metrics"]["cer"] in (1, None)
        if bad["metrics"]["emitted_items"]:
            assert bad["metrics"]["abstain_rate"] == 1
        if bad["metrics"]["score_exact_denominator"]:
            assert (
                good["metrics"]["score_exact_match"] == 1
                and bad["metrics"]["score_exact_match"] == 0
            )
        return {
            "perfect_gate": good["release_gate"],
            "broken_gate": bad["release_gate"],
            "notes": len(notes),
            "caveat": "Reference ceiling only; no speech model or recording was evaluated.",
        }
