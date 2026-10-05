On 10 synthetic notes, 10 predictions were evaluated; 0 identified speakers have available recordings. WER was 0.2393, CER 0.0403, and 0 of 17 automatic name assignments were wrong. The identity gate is PASS. 10 recordings are missing. The metrics compare supplied predictions with human references. All notes are synthetic; accuracy on real teacher speech is not measured. A prediction file alone does not prove that a speech model processed audio.

# PASS — identity release gate

| Metric | Value |
|---|---:|
| wer | 0.2393 |
| cer | 0.0403 |
| word_edits | 39 |
| reference_words | 163 |
| character_edits | 37 |
| reference_characters | 917 |
| wrong_student_rate | 0.0000 |
| wrong_student_count | 0 |
| alignment_uncertain_count | 0 |
| unsafe_item_identity_count | 0 |
| autoassigned_names | 17 |
| score_exact_match | 0.1250 |
| score_exact_denominator | 8 |
| abstain_rate | 0.0000 |
| blank_items | 0 |
| emitted_items | 25 |
| unmentioned_handling_errors | 0 |
| latency_p50_ms | 5311.5000 |
| latency_p95_ms | 8531.9500 |
| latency_observations | 10 |
| name_precision | 1.0000 |
| name_recall | 0.6538 |
| name_f1 | 0.7907 |
| name_true_positive | 17 |
| name_false_positive | 0 |
| name_false_negative | 9 |
| name_predicted | 17 |
| name_expected | 26 |
| attendance_precision | 1.0000 |
| attendance_recall | 0.6667 |
| attendance_f1 | 0.8000 |
| attendance_true_positive | 6 |
| attendance_false_positive | 0 |
| attendance_false_negative | 3 |
| attendance_predicted | 6 |
| attendance_expected | 9 |
| late_minutes_precision | 1.0000 |
| late_minutes_recall | 0.3333 |
| late_minutes_f1 | 0.5000 |
| late_minutes_true_positive | 1 |
| late_minutes_false_positive | 0 |
| late_minutes_false_negative | 2 |
| late_minutes_predicted | 1 |
| late_minutes_expected | 3 |
| score_precision | 1.0000 |
| score_recall | 0.1250 |
| score_f1 | 0.2222 |
| score_true_positive | 1 |
| score_false_positive | 0 |
| score_false_negative | 7 |
| score_predicted | 1 |
| score_expected | 8 |
| participation_precision | N/A |
| participation_recall | 0.0000 |
| participation_f1 | 0.0000 |
| participation_true_positive | 0 |
| participation_false_positive | 0 |
| participation_false_negative | 3 |
| participation_predicted | 0 |
| participation_expected | 3 |
| homework_precision | N/A |
| homework_recall | N/A |
| homework_f1 | N/A |
| homework_true_positive | 0 |
| homework_false_positive | 0 |
| homework_false_negative | 0 |
| homework_predicted | 0 |
| homework_expected | 0 |
| observation_precision | 0.0000 |
| observation_recall | N/A |
| observation_f1 | 0.0000 |
| observation_true_positive | 0 |
| observation_false_positive | 9 |
| observation_false_negative | 0 |
| observation_predicted | 9 |
| observation_expected | 0 |
| observation_tag_precision | 0.0000 |
| observation_tag_recall | N/A |
| observation_tag_f1 | 0.0000 |
| observation_tag_true_positive | 0 |
| observation_tag_false_positive | 8 |
| observation_tag_false_negative | 0 |
| observation_tag_predicted | 8 |
| observation_tag_expected | 0 |

## Sample sizes

| Sample | Count |
|---|---:|
| notes | 10 |
| synthetic_notes | 10 |
| real_notes | 0 |
| predictions | 10 |
| speakers | 0 |
| missing_recordings | 10 |
| latency_observations | 10 |

Model versions: faster-whisper:large-v3-turbo@float16/cuda\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v7

Missing predictions: none

## Wrong-student cases

None.

## Alignment requiring review

None.

## Unsafe item identities

None.

## Breakdown: hard_case_tags

| Group | Notes | WER | CER | Name precision | Name recall | Wrong-student rate | Score exact | Abstain | Unmentioned errors | p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| windows_tts | 10 | 0.2393 | 0.0403 | 1.0000 | 0.6538 | 0.0000 | 0.1250 | 0.0000 | 0 | 8531.9500 |

| Group | Field | Expected | Predicted | Precision | Recall | F1 |
|---|---|---:|---:|---:|---:|---:|
| windows_tts | attendance | 9 | 6 | 1.0000 | 0.6667 | 0.8000 |
| windows_tts | late_minutes | 3 | 1 | 1.0000 | 0.3333 | 0.5000 |
| windows_tts | score | 8 | 1 | 1.0000 | 0.1250 | 0.2222 |
| windows_tts | participation | 3 | 0 | N/A | 0.0000 | 0.0000 |
| windows_tts | homework | 0 | 0 | N/A | N/A | N/A |
| windows_tts | observation | 0 | 9 | 0.0000 | N/A | 0.0000 |
| windows_tts | observation_tag | 0 | 8 | 0.0000 | N/A | 0.0000 |

## Breakdown: recording_condition

| Group | Notes | WER | CER | Name precision | Name recall | Wrong-student rate | Score exact | Abstain | Unmentioned errors | p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| windows_tts | 10 | 0.2393 | 0.0403 | 1.0000 | 0.6538 | 0.0000 | 0.1250 | 0.0000 | 0 | 8531.9500 |

| Group | Field | Expected | Predicted | Precision | Recall | F1 |
|---|---|---:|---:|---:|---:|---:|
| windows_tts | attendance | 9 | 6 | 1.0000 | 0.6667 | 0.8000 |
| windows_tts | late_minutes | 3 | 1 | 1.0000 | 0.3333 | 0.5000 |
| windows_tts | score | 8 | 1 | 1.0000 | 0.1250 | 0.2222 |
| windows_tts | participation | 3 | 0 | N/A | 0.0000 | 0.0000 |
| windows_tts | homework | 0 | 0 | N/A | N/A | N/A |
| windows_tts | observation | 0 | 9 | 0.0000 | N/A | 0.0000 |
| windows_tts | observation_tag | 0 | 8 | 0.0000 | N/A | 0.0000 |

## Breakdown: model_version

| Group | Notes | WER | CER | Name precision | Name recall | Wrong-student rate | Score exact | Abstain | Unmentioned errors | p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| faster-whisper:large-v3-turbo@float16/cuda\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v7 | 10 | 0.2393 | 0.0403 | 1.0000 | 0.6538 | 0.0000 | 0.1250 | 0.0000 | 0 | 8531.9500 |

| Group | Field | Expected | Predicted | Precision | Recall | F1 |
|---|---|---:|---:|---:|---:|---:|
| faster-whisper:large-v3-turbo@float16/cuda\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v7 | attendance | 9 | 6 | 1.0000 | 0.6667 | 0.8000 |
| faster-whisper:large-v3-turbo@float16/cuda\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v7 | late_minutes | 3 | 1 | 1.0000 | 0.3333 | 0.5000 |
| faster-whisper:large-v3-turbo@float16/cuda\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v7 | score | 8 | 1 | 1.0000 | 0.1250 | 0.2222 |
| faster-whisper:large-v3-turbo@float16/cuda\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v7 | participation | 3 | 0 | N/A | 0.0000 | 0.0000 |
| faster-whisper:large-v3-turbo@float16/cuda\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v7 | homework | 0 | 0 | N/A | N/A | N/A |
| faster-whisper:large-v3-turbo@float16/cuda\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v7 | observation | 0 | 9 | 0.0000 | N/A | 0.0000 |
| faster-whisper:large-v3-turbo@float16/cuda\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v7 | observation_tag | 0 | 8 | 0.0000 | N/A | 0.0000 |

## Metric definitions and caveats

WER/CER use aggregate Levenshtein edits after normalize_for_match (CER includes spaces). Missing predictions contribute deletions and missed expected fields; completeness is required for PASS. Empty denominators are N/A.
Name precision/recall evaluate automatic student assignments against unique gold name occurrences. Occurrences are located in their own transcripts (validated offsets, otherwise normalized word occurrences), then aligned independently of IDs through optimal exact-word edit anchors and bounded substitution gaps. Shared coordinate labels do not establish alignment. Confirmed extra assignments and assignments on ambiguous/unknown occurrences block release. Unlocatable or multiply aligned assignments are listed separately, count as unmatched for precision/recall, and force INCOMPLETE rather than being falsely labelled wrong. The name wrong-student rate measures mention assignments; the separate unsafe-item identity count also blocks release when an item is attached without a unique gold identity. Item IDs outside the roster are rejected as invalid input.
Field metrics compare per-note multisets of (student_id, field, value), so duplicates count as false positives. Score exact match is correct score occurrences divided by all expected score occurrences, including missed scores. All emitted proposals are evaluated even in the blank band; abstain is confidence < 0.60 divided by emitted items. It does not measure entirely omitted fields.
Latency percentiles use linear interpolation over supplied nonnegative latencies only. Audio duration is unavailable, so these are per-note values, not duration-normalized measurements per one-minute note. Cost is unavailable in the prediction contract and is not measured. No vendor-regression tolerance is specified; compare results for review.
Hard-case groups overlap. Placeholder speakers (to-fill/unknown) are excluded, and speakers count only when their recording exists. Gold references must remain locked; use a separate development set for tuning.
