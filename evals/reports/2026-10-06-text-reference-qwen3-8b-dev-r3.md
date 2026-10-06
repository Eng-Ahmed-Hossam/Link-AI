On 15 synthetic notes, 15 predictions were evaluated; 0 identified speakers have available recordings. WER was 0.0000, CER 0.0000, and 0 of 12 automatic name assignments were wrong. The identity gate is PASS. 15 recordings are missing. The metrics compare supplied predictions with human references. All notes are synthetic; accuracy on real teacher speech is not measured. A prediction file alone does not prove that a speech model processed audio.

# PASS — identity release gate

| Metric | Value |
|---|---:|
| wer | 0.0000 |
| cer | 0.0000 |
| word_edits | 0 |
| reference_words | 77 |
| character_edits | 0 |
| reference_characters | 365 |
| wrong_student_rate | 0.0000 |
| wrong_student_count | 0 |
| alignment_uncertain_count | 0 |
| unsafe_item_identity_count | 0 |
| autoassigned_names | 12 |
| score_exact_match | 1.0000 |
| score_exact_denominator | 6 |
| abstain_rate | 0.0000 |
| blank_items | 0 |
| emitted_items | 12 |
| unmentioned_handling_errors | 0 |
| latency_p50_ms | 1054.0000 |
| latency_p95_ms | 3437.4000 |
| latency_observations | 15 |
| name_precision | 1.0000 |
| name_recall | 1.0000 |
| name_f1 | 1.0000 |
| name_true_positive | 12 |
| name_false_positive | 0 |
| name_false_negative | 0 |
| name_predicted | 12 |
| name_expected | 12 |
| attendance_precision | 1.0000 |
| attendance_recall | 1.0000 |
| attendance_f1 | 1.0000 |
| attendance_true_positive | 5 |
| attendance_false_positive | 0 |
| attendance_false_negative | 0 |
| attendance_predicted | 5 |
| attendance_expected | 5 |
| late_minutes_precision | N/A |
| late_minutes_recall | N/A |
| late_minutes_f1 | N/A |
| late_minutes_true_positive | 0 |
| late_minutes_false_positive | 0 |
| late_minutes_false_negative | 0 |
| late_minutes_predicted | 0 |
| late_minutes_expected | 0 |
| score_precision | 1.0000 |
| score_recall | 1.0000 |
| score_f1 | 1.0000 |
| score_true_positive | 6 |
| score_false_positive | 0 |
| score_false_negative | 0 |
| score_predicted | 6 |
| score_expected | 6 |
| participation_precision | N/A |
| participation_recall | N/A |
| participation_f1 | N/A |
| participation_true_positive | 0 |
| participation_false_positive | 0 |
| participation_false_negative | 0 |
| participation_predicted | 0 |
| participation_expected | 0 |
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
| observation_false_positive | 1 |
| observation_false_negative | 0 |
| observation_predicted | 1 |
| observation_expected | 0 |
| observation_tag_precision | N/A |
| observation_tag_recall | N/A |
| observation_tag_f1 | N/A |
| observation_tag_true_positive | 0 |
| observation_tag_false_positive | 0 |
| observation_tag_false_negative | 0 |
| observation_tag_predicted | 0 |
| observation_tag_expected | 0 |

## Sample sizes

| Sample | Count |
|---|---:|
| notes | 15 |
| synthetic_notes | 15 |
| real_notes | 0 |
| predictions | 15 |
| speakers | 0 |
| missing_recordings | 15 |
| latency_observations | 15 |

Model versions: reference-transcript\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v8

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
| candidate_only | 1 | 0.0000 | 0.0000 | N/A | N/A | 0.0000 | N/A | N/A | 0 | 585.0000 |
| common_word | 3 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | N/A | 0.0000 | 0 | 7486.0000 |
| date_negative | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | N/A | 0.0000 | 0 | 1377.0000 |
| half_score | 2 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 1149.8000 |
| joined_teen | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 1035.0000 |
| misheard_name | 1 | 0.0000 | 0.0000 | N/A | N/A | 0.0000 | N/A | N/A | 0 | 585.0000 |
| mixed_digits | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 1037.0000 |
| names | 2 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | N/A | 0.0000 | 0 | 7890.2500 |
| negative | 2 | 0.0000 | 0.0000 | N/A | N/A | 0.0000 | N/A | N/A | 0 | 622.3500 |
| page_negative | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | N/A | 0.0000 | 0 | 1034.0000 |
| score | 2 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 1053.0500 |
| split_teen | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 1054.0000 |
| student_count_negative | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | N/A | 0.0000 | 0 | 1282.0000 |
| tens_with_waw | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 1329.0000 |
| time_negative | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | N/A | 0.0000 | 0 | 1046.0000 |
| vocative | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | N/A | 0.0000 | 0 | 1150.0000 |
| whisper_teen | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 1037.0000 |

| Group | Field | Expected | Predicted | Precision | Recall | F1 |
|---|---|---:|---:|---:|---:|---:|
| candidate_only | attendance | 0 | 0 | N/A | N/A | N/A |
| candidate_only | late_minutes | 0 | 0 | N/A | N/A | N/A |
| candidate_only | score | 0 | 0 | N/A | N/A | N/A |
| candidate_only | participation | 0 | 0 | N/A | N/A | N/A |
| candidate_only | homework | 0 | 0 | N/A | N/A | N/A |
| candidate_only | observation | 0 | 0 | N/A | N/A | N/A |
| candidate_only | observation_tag | 0 | 0 | N/A | N/A | N/A |
| common_word | attendance | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| common_word | late_minutes | 0 | 0 | N/A | N/A | N/A |
| common_word | score | 0 | 0 | N/A | N/A | N/A |
| common_word | participation | 0 | 0 | N/A | N/A | N/A |
| common_word | homework | 0 | 0 | N/A | N/A | N/A |
| common_word | observation | 0 | 0 | N/A | N/A | N/A |
| common_word | observation_tag | 0 | 0 | N/A | N/A | N/A |
| date_negative | attendance | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| date_negative | late_minutes | 0 | 0 | N/A | N/A | N/A |
| date_negative | score | 0 | 0 | N/A | N/A | N/A |
| date_negative | participation | 0 | 0 | N/A | N/A | N/A |
| date_negative | homework | 0 | 0 | N/A | N/A | N/A |
| date_negative | observation | 0 | 0 | N/A | N/A | N/A |
| date_negative | observation_tag | 0 | 0 | N/A | N/A | N/A |
| half_score | attendance | 0 | 0 | N/A | N/A | N/A |
| half_score | late_minutes | 0 | 0 | N/A | N/A | N/A |
| half_score | score | 2 | 2 | 1.0000 | 1.0000 | 1.0000 |
| half_score | participation | 0 | 0 | N/A | N/A | N/A |
| half_score | homework | 0 | 0 | N/A | N/A | N/A |
| half_score | observation | 0 | 0 | N/A | N/A | N/A |
| half_score | observation_tag | 0 | 0 | N/A | N/A | N/A |
| joined_teen | attendance | 0 | 0 | N/A | N/A | N/A |
| joined_teen | late_minutes | 0 | 0 | N/A | N/A | N/A |
| joined_teen | score | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| joined_teen | participation | 0 | 0 | N/A | N/A | N/A |
| joined_teen | homework | 0 | 0 | N/A | N/A | N/A |
| joined_teen | observation | 0 | 0 | N/A | N/A | N/A |
| joined_teen | observation_tag | 0 | 0 | N/A | N/A | N/A |
| misheard_name | attendance | 0 | 0 | N/A | N/A | N/A |
| misheard_name | late_minutes | 0 | 0 | N/A | N/A | N/A |
| misheard_name | score | 0 | 0 | N/A | N/A | N/A |
| misheard_name | participation | 0 | 0 | N/A | N/A | N/A |
| misheard_name | homework | 0 | 0 | N/A | N/A | N/A |
| misheard_name | observation | 0 | 0 | N/A | N/A | N/A |
| misheard_name | observation_tag | 0 | 0 | N/A | N/A | N/A |
| mixed_digits | attendance | 0 | 0 | N/A | N/A | N/A |
| mixed_digits | late_minutes | 0 | 0 | N/A | N/A | N/A |
| mixed_digits | score | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| mixed_digits | participation | 0 | 0 | N/A | N/A | N/A |
| mixed_digits | homework | 0 | 0 | N/A | N/A | N/A |
| mixed_digits | observation | 0 | 0 | N/A | N/A | N/A |
| mixed_digits | observation_tag | 0 | 0 | N/A | N/A | N/A |
| names | attendance | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| names | late_minutes | 0 | 0 | N/A | N/A | N/A |
| names | score | 0 | 0 | N/A | N/A | N/A |
| names | participation | 0 | 0 | N/A | N/A | N/A |
| names | homework | 0 | 0 | N/A | N/A | N/A |
| names | observation | 0 | 1 | 0.0000 | N/A | 0.0000 |
| names | observation_tag | 0 | 0 | N/A | N/A | N/A |
| negative | attendance | 0 | 0 | N/A | N/A | N/A |
| negative | late_minutes | 0 | 0 | N/A | N/A | N/A |
| negative | score | 0 | 0 | N/A | N/A | N/A |
| negative | participation | 0 | 0 | N/A | N/A | N/A |
| negative | homework | 0 | 0 | N/A | N/A | N/A |
| negative | observation | 0 | 0 | N/A | N/A | N/A |
| negative | observation_tag | 0 | 0 | N/A | N/A | N/A |
| page_negative | attendance | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| page_negative | late_minutes | 0 | 0 | N/A | N/A | N/A |
| page_negative | score | 0 | 0 | N/A | N/A | N/A |
| page_negative | participation | 0 | 0 | N/A | N/A | N/A |
| page_negative | homework | 0 | 0 | N/A | N/A | N/A |
| page_negative | observation | 0 | 0 | N/A | N/A | N/A |
| page_negative | observation_tag | 0 | 0 | N/A | N/A | N/A |
| score | attendance | 0 | 0 | N/A | N/A | N/A |
| score | late_minutes | 0 | 0 | N/A | N/A | N/A |
| score | score | 2 | 2 | 1.0000 | 1.0000 | 1.0000 |
| score | participation | 0 | 0 | N/A | N/A | N/A |
| score | homework | 0 | 0 | N/A | N/A | N/A |
| score | observation | 0 | 0 | N/A | N/A | N/A |
| score | observation_tag | 0 | 0 | N/A | N/A | N/A |
| split_teen | attendance | 0 | 0 | N/A | N/A | N/A |
| split_teen | late_minutes | 0 | 0 | N/A | N/A | N/A |
| split_teen | score | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| split_teen | participation | 0 | 0 | N/A | N/A | N/A |
| split_teen | homework | 0 | 0 | N/A | N/A | N/A |
| split_teen | observation | 0 | 0 | N/A | N/A | N/A |
| split_teen | observation_tag | 0 | 0 | N/A | N/A | N/A |
| student_count_negative | attendance | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| student_count_negative | late_minutes | 0 | 0 | N/A | N/A | N/A |
| student_count_negative | score | 0 | 0 | N/A | N/A | N/A |
| student_count_negative | participation | 0 | 0 | N/A | N/A | N/A |
| student_count_negative | homework | 0 | 0 | N/A | N/A | N/A |
| student_count_negative | observation | 0 | 0 | N/A | N/A | N/A |
| student_count_negative | observation_tag | 0 | 0 | N/A | N/A | N/A |
| tens_with_waw | attendance | 0 | 0 | N/A | N/A | N/A |
| tens_with_waw | late_minutes | 0 | 0 | N/A | N/A | N/A |
| tens_with_waw | score | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| tens_with_waw | participation | 0 | 0 | N/A | N/A | N/A |
| tens_with_waw | homework | 0 | 0 | N/A | N/A | N/A |
| tens_with_waw | observation | 0 | 0 | N/A | N/A | N/A |
| tens_with_waw | observation_tag | 0 | 0 | N/A | N/A | N/A |
| time_negative | attendance | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| time_negative | late_minutes | 0 | 0 | N/A | N/A | N/A |
| time_negative | score | 0 | 0 | N/A | N/A | N/A |
| time_negative | participation | 0 | 0 | N/A | N/A | N/A |
| time_negative | homework | 0 | 0 | N/A | N/A | N/A |
| time_negative | observation | 0 | 0 | N/A | N/A | N/A |
| time_negative | observation_tag | 0 | 0 | N/A | N/A | N/A |
| vocative | attendance | 0 | 0 | N/A | N/A | N/A |
| vocative | late_minutes | 0 | 0 | N/A | N/A | N/A |
| vocative | score | 0 | 0 | N/A | N/A | N/A |
| vocative | participation | 0 | 0 | N/A | N/A | N/A |
| vocative | homework | 0 | 0 | N/A | N/A | N/A |
| vocative | observation | 0 | 1 | 0.0000 | N/A | 0.0000 |
| vocative | observation_tag | 0 | 0 | N/A | N/A | N/A |
| whisper_teen | attendance | 0 | 0 | N/A | N/A | N/A |
| whisper_teen | late_minutes | 0 | 0 | N/A | N/A | N/A |
| whisper_teen | score | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| whisper_teen | participation | 0 | 0 | N/A | N/A | N/A |
| whisper_teen | homework | 0 | 0 | N/A | N/A | N/A |
| whisper_teen | observation | 0 | 0 | N/A | N/A | N/A |
| whisper_teen | observation_tag | 0 | 0 | N/A | N/A | N/A |

## Breakdown: recording_condition

| Group | Notes | WER | CER | Name precision | Name recall | Wrong-student rate | Score exact | Abstain | Unmentioned errors | p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| development_text | 15 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 3437.4000 |

| Group | Field | Expected | Predicted | Precision | Recall | F1 |
|---|---|---:|---:|---:|---:|---:|
| development_text | attendance | 5 | 5 | 1.0000 | 1.0000 | 1.0000 |
| development_text | late_minutes | 0 | 0 | N/A | N/A | N/A |
| development_text | score | 6 | 6 | 1.0000 | 1.0000 | 1.0000 |
| development_text | participation | 0 | 0 | N/A | N/A | N/A |
| development_text | homework | 0 | 0 | N/A | N/A | N/A |
| development_text | observation | 0 | 1 | 0.0000 | N/A | 0.0000 |
| development_text | observation_tag | 0 | 0 | N/A | N/A | N/A |

## Breakdown: model_version

| Group | Notes | WER | CER | Name precision | Name recall | Wrong-student rate | Score exact | Abstain | Unmentioned errors | p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| reference-transcript\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v8 | 15 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 3437.4000 |

| Group | Field | Expected | Predicted | Precision | Recall | F1 |
|---|---|---:|---:|---:|---:|---:|
| reference-transcript\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v8 | attendance | 5 | 5 | 1.0000 | 1.0000 | 1.0000 |
| reference-transcript\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v8 | late_minutes | 0 | 0 | N/A | N/A | N/A |
| reference-transcript\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v8 | score | 6 | 6 | 1.0000 | 1.0000 | 1.0000 |
| reference-transcript\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v8 | participation | 0 | 0 | N/A | N/A | N/A |
| reference-transcript\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v8 | homework | 0 | 0 | N/A | N/A | N/A |
| reference-transcript\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v8 | observation | 0 | 1 | 0.0000 | N/A | 0.0000 |
| reference-transcript\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v8 | observation_tag | 0 | 0 | N/A | N/A | N/A |

## Metric definitions and caveats

WER/CER use aggregate Levenshtein edits after normalize_for_match (CER includes spaces). Missing predictions contribute deletions and missed expected fields; completeness is required for PASS. Empty denominators are N/A.
Name precision/recall evaluate automatic student assignments against unique gold name occurrences. Occurrences are located in their own transcripts (validated offsets, otherwise normalized word occurrences), then aligned independently of IDs through optimal exact-word edit anchors and bounded substitution gaps. Shared coordinate labels do not establish alignment. Confirmed extra assignments and assignments on ambiguous/unknown occurrences block release. Unlocatable or multiply aligned assignments are listed separately, count as unmatched for precision/recall, and force INCOMPLETE rather than being falsely labelled wrong. The name wrong-student rate measures mention assignments; the separate unsafe-item identity count also blocks release when an item is attached without a unique gold identity. Item IDs outside the roster are rejected as invalid input.
Field metrics compare per-note multisets of (student_id, field, value), so duplicates count as false positives. Score exact match is correct score occurrences divided by all expected score occurrences, including missed scores. All emitted proposals are evaluated even in the blank band; abstain is confidence < 0.60 divided by emitted items. It does not measure entirely omitted fields.
Latency percentiles use linear interpolation over supplied nonnegative latencies only. Audio duration is unavailable, so these are per-note values, not duration-normalized measurements per one-minute note. Cost is unavailable in the prediction contract and is not measured. No vendor-regression tolerance is specified; compare results for review.
Hard-case groups overlap. Placeholder speakers (to-fill/unknown) are excluded, and speakers count only when their recording exists. Gold references must remain locked; use a separate development set for tuning.
