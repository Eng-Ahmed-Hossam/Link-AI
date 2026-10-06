On 35 synthetic notes, 35 predictions were evaluated; 0 identified speakers have available recordings. WER was 0.0000, CER 0.0000, and 0 of 49 automatic name assignments were wrong. The identity gate is PASS. 35 recordings are missing. The metrics compare supplied predictions with human references. All notes are synthetic; accuracy on real teacher speech is not measured. A prediction file alone does not prove that a speech model processed audio.

# PASS — identity release gate

| Metric | Value |
|---|---:|
| wer | 0.0000 |
| cer | 0.0000 |
| word_edits | 0 |
| reference_words | 2098 |
| character_edits | 0 |
| reference_characters | 11474 |
| wrong_student_rate | 0.0000 |
| wrong_student_count | 0 |
| alignment_uncertain_count | 0 |
| unsafe_item_identity_count | 0 |
| autoassigned_names | 49 |
| score_exact_match | 0.9600 |
| score_exact_denominator | 25 |
| abstain_rate | 0.0000 |
| blank_items | 0 |
| emitted_items | 129 |
| unmentioned_handling_errors | 0 |
| latency_p50_ms | 9432.0000 |
| latency_p95_ms | 11381.4000 |
| latency_observations | 35 |
| name_precision | 1.0000 |
| name_recall | 0.9245 |
| name_f1 | 0.9608 |
| name_true_positive | 49 |
| name_false_positive | 0 |
| name_false_negative | 4 |
| name_predicted | 49 |
| name_expected | 53 |
| attendance_precision | 1.0000 |
| attendance_recall | 0.8095 |
| attendance_f1 | 0.8947 |
| attendance_true_positive | 17 |
| attendance_false_positive | 0 |
| attendance_false_negative | 4 |
| attendance_predicted | 17 |
| attendance_expected | 21 |
| late_minutes_precision | 1.0000 |
| late_minutes_recall | 0.8333 |
| late_minutes_f1 | 0.9091 |
| late_minutes_true_positive | 5 |
| late_minutes_false_positive | 0 |
| late_minutes_false_negative | 1 |
| late_minutes_predicted | 5 |
| late_minutes_expected | 6 |
| score_precision | 1.0000 |
| score_recall | 0.9600 |
| score_f1 | 0.9796 |
| score_true_positive | 24 |
| score_false_positive | 0 |
| score_false_negative | 1 |
| score_predicted | 24 |
| score_expected | 25 |
| participation_precision | 1.0000 |
| participation_recall | 0.5714 |
| participation_f1 | 0.7273 |
| participation_true_positive | 4 |
| participation_false_positive | 0 |
| participation_false_negative | 3 |
| participation_predicted | 4 |
| participation_expected | 7 |
| homework_precision | N/A |
| homework_recall | N/A |
| homework_f1 | N/A |
| homework_true_positive | 0 |
| homework_false_positive | 0 |
| homework_false_negative | 0 |
| homework_predicted | 0 |
| homework_expected | 0 |
| observation_precision | 0.0500 |
| observation_recall | 0.4000 |
| observation_f1 | 0.0889 |
| observation_true_positive | 2 |
| observation_false_positive | 38 |
| observation_false_negative | 3 |
| observation_predicted | 40 |
| observation_expected | 5 |
| observation_tag_precision | 0.1026 |
| observation_tag_recall | 0.8000 |
| observation_tag_f1 | 0.1818 |
| observation_tag_true_positive | 4 |
| observation_tag_false_positive | 35 |
| observation_tag_false_negative | 1 |
| observation_tag_predicted | 39 |
| observation_tag_expected | 5 |

## Sample sizes

| Sample | Count |
|---|---:|
| notes | 35 |
| synthetic_notes | 35 |
| real_notes | 0 |
| predictions | 35 |
| speakers | 0 |
| missing_recordings | 35 |
| latency_observations | 35 |

Model versions: reference-transcript\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v7

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
| absence_context | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | N/A | 0.0000 | 0 | 10091.0000 |
| accuracy_run | 5 | 0.0000 | 0.0000 | 1.0000 | 0.5000 | 0.0000 | 1.0000 | 0.0000 | 0 | 1450.6000 |
| all_present_except | 2 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | N/A | 0.0000 | 0 | 11024.3000 |
| ambiguous_first_name | 3 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | N/A | 0.0000 | 0 | 8623.0000 |
| attendance_retraction | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | N/A | 0.0000 | 0 | 10913.0000 |
| behaviour | 1 | 0.0000 | 0.0000 | 1.0000 | 0.5000 | 0.0000 | N/A | 0.0000 | 0 | 9432.0000 |
| candidate_only | 1 | 0.0000 | 0.0000 | N/A | N/A | 0.0000 | N/A | N/A | 0 | 684.0000 |
| code_switching | 4 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 10984.8000 |
| common_word | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 1465.0000 |
| digit_scores | 2 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 11135.0500 |
| digit_variants | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 10451.0000 |
| durations | 2 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 10672.8500 |
| egyptian_absence | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | N/A | 0.0000 | 0 | 10520.0000 |
| explicit_present | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | N/A | 0.0000 | 0 | 11171.0000 |
| half_score | 2 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 10884.3500 |
| here_negative | 1 | 0.0000 | 0.0000 | N/A | 0.0000 | 0.0000 | N/A | N/A | 0 | 1.0000 |
| lateness | 4 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 11268.7500 |
| long_full_name | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 11838.0000 |
| misheard_name | 1 | 0.0000 | 0.0000 | N/A | N/A | 0.0000 | N/A | N/A | 0 | 684.0000 |
| missing_not_absent | 6 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 11333.0000 |
| multiple_fields | 2 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 11115.2000 |
| needs_revisit | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | N/A | 0.0000 | 0 | 10918.0000 |
| negative_score | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 0.6667 | 0.0000 | 0 | 7830.0000 |
| nicknames | 2 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 11249.5500 |
| no_names | 1 | 0.0000 | 0.0000 | N/A | N/A | 0.0000 | N/A | N/A | 0 | 2635.0000 |
| normal_participation | 1 | 0.0000 | 0.0000 | 1.0000 | 0.5000 | 0.0000 | N/A | 0.0000 | 0 | 10402.0000 |
| observations | 3 | 0.0000 | 0.0000 | 1.0000 | 0.8000 | 0.0000 | N/A | 0.0000 | 0 | 10835.3000 |
| participation | 3 | 0.0000 | 0.0000 | 1.0000 | 0.8333 | 0.0000 | N/A | 0.0000 | 0 | 11197.6000 |
| positive | 1 | 0.0000 | 0.0000 | 1.0000 | 0.5000 | 0.0000 | N/A | 0.0000 | 0 | 9432.0000 |
| repeated_mentions | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 13.0000 |
| score_out_of_range | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 0.6667 | 0.0000 | 0 | 7830.0000 |
| self_correction | 2 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | N/A | 0.0000 | 0 | 10818.0500 |
| similar_full_names | 3 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 11161.8000 |
| split_exception | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | N/A | 0.0000 | 0 | 1393.0000 |
| split_teen | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 1465.0000 |
| spoken_scores | 8 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 0.9286 | 0.0000 | 0 | 11507.9500 |
| teacher_guardian_names | 2 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 14.9000 |
| understanding | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | N/A | 0.0000 | 0 | 10918.0000 |
| unknown_full_name | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 10.0000 |
| unknown_identity_block | 2 | 0.0000 | 0.0000 | N/A | N/A | 0.0000 | N/A | N/A | 0 | 2576.9500 |
| unknown_name | 3 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 14.8000 |
| whisper_negation | 1 | 0.0000 | 0.0000 | N/A | 0.0000 | 0.0000 | N/A | N/A | 0 | 610.0000 |
| zero_score | 1 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 9160.0000 |

| Group | Field | Expected | Predicted | Precision | Recall | F1 |
|---|---|---:|---:|---:|---:|---:|
| absence_context | attendance | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| absence_context | late_minutes | 0 | 0 | N/A | N/A | N/A |
| absence_context | score | 0 | 0 | N/A | N/A | N/A |
| absence_context | participation | 0 | 0 | N/A | N/A | N/A |
| absence_context | homework | 0 | 0 | N/A | N/A | N/A |
| absence_context | observation | 1 | 1 | 0.0000 | 0.0000 | 0.0000 |
| absence_context | observation_tag | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| accuracy_run | attendance | 4 | 2 | 1.0000 | 0.5000 | 0.6667 |
| accuracy_run | late_minutes | 0 | 0 | N/A | N/A | N/A |
| accuracy_run | score | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| accuracy_run | participation | 0 | 0 | N/A | N/A | N/A |
| accuracy_run | homework | 0 | 0 | N/A | N/A | N/A |
| accuracy_run | observation | 0 | 0 | N/A | N/A | N/A |
| accuracy_run | observation_tag | 0 | 0 | N/A | N/A | N/A |
| all_present_except | attendance | 4 | 4 | 1.0000 | 1.0000 | 1.0000 |
| all_present_except | late_minutes | 0 | 0 | N/A | N/A | N/A |
| all_present_except | score | 0 | 0 | N/A | N/A | N/A |
| all_present_except | participation | 0 | 0 | N/A | N/A | N/A |
| all_present_except | homework | 0 | 0 | N/A | N/A | N/A |
| all_present_except | observation | 0 | 2 | 0.0000 | N/A | 0.0000 |
| all_present_except | observation_tag | 0 | 2 | 0.0000 | N/A | 0.0000 |
| ambiguous_first_name | attendance | 1 | 0 | N/A | 0.0000 | 0.0000 |
| ambiguous_first_name | late_minutes | 0 | 0 | N/A | N/A | N/A |
| ambiguous_first_name | score | 0 | 0 | N/A | N/A | N/A |
| ambiguous_first_name | participation | 0 | 0 | N/A | N/A | N/A |
| ambiguous_first_name | homework | 0 | 0 | N/A | N/A | N/A |
| ambiguous_first_name | observation | 0 | 1 | 0.0000 | N/A | 0.0000 |
| ambiguous_first_name | observation_tag | 0 | 1 | 0.0000 | N/A | 0.0000 |
| attendance_retraction | attendance | 1 | 0 | N/A | 0.0000 | 0.0000 |
| attendance_retraction | late_minutes | 0 | 0 | N/A | N/A | N/A |
| attendance_retraction | score | 0 | 0 | N/A | N/A | N/A |
| attendance_retraction | participation | 0 | 0 | N/A | N/A | N/A |
| attendance_retraction | homework | 0 | 0 | N/A | N/A | N/A |
| attendance_retraction | observation | 0 | 1 | 0.0000 | N/A | 0.0000 |
| attendance_retraction | observation_tag | 0 | 1 | 0.0000 | N/A | 0.0000 |
| behaviour | attendance | 0 | 0 | N/A | N/A | N/A |
| behaviour | late_minutes | 0 | 0 | N/A | N/A | N/A |
| behaviour | score | 0 | 0 | N/A | N/A | N/A |
| behaviour | participation | 0 | 0 | N/A | N/A | N/A |
| behaviour | homework | 0 | 0 | N/A | N/A | N/A |
| behaviour | observation | 2 | 1 | 1.0000 | 0.5000 | 0.6667 |
| behaviour | observation_tag | 2 | 1 | 1.0000 | 0.5000 | 0.6667 |
| candidate_only | attendance | 0 | 0 | N/A | N/A | N/A |
| candidate_only | late_minutes | 0 | 0 | N/A | N/A | N/A |
| candidate_only | score | 0 | 0 | N/A | N/A | N/A |
| candidate_only | participation | 0 | 0 | N/A | N/A | N/A |
| candidate_only | homework | 0 | 0 | N/A | N/A | N/A |
| candidate_only | observation | 0 | 0 | N/A | N/A | N/A |
| candidate_only | observation_tag | 0 | 0 | N/A | N/A | N/A |
| code_switching | attendance | 0 | 0 | N/A | N/A | N/A |
| code_switching | late_minutes | 0 | 0 | N/A | N/A | N/A |
| code_switching | score | 6 | 6 | 1.0000 | 1.0000 | 1.0000 |
| code_switching | participation | 0 | 0 | N/A | N/A | N/A |
| code_switching | homework | 0 | 0 | N/A | N/A | N/A |
| code_switching | observation | 0 | 4 | 0.0000 | N/A | 0.0000 |
| code_switching | observation_tag | 0 | 4 | 0.0000 | N/A | 0.0000 |
| common_word | attendance | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| common_word | late_minutes | 0 | 0 | N/A | N/A | N/A |
| common_word | score | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| common_word | participation | 0 | 0 | N/A | N/A | N/A |
| common_word | homework | 0 | 0 | N/A | N/A | N/A |
| common_word | observation | 0 | 0 | N/A | N/A | N/A |
| common_word | observation_tag | 0 | 0 | N/A | N/A | N/A |
| digit_scores | attendance | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| digit_scores | late_minutes | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| digit_scores | score | 4 | 4 | 1.0000 | 1.0000 | 1.0000 |
| digit_scores | participation | 0 | 0 | N/A | N/A | N/A |
| digit_scores | homework | 0 | 0 | N/A | N/A | N/A |
| digit_scores | observation | 0 | 4 | 0.0000 | N/A | 0.0000 |
| digit_scores | observation_tag | 0 | 4 | 0.0000 | N/A | 0.0000 |
| digit_variants | attendance | 0 | 0 | N/A | N/A | N/A |
| digit_variants | late_minutes | 0 | 0 | N/A | N/A | N/A |
| digit_variants | score | 2 | 2 | 1.0000 | 1.0000 | 1.0000 |
| digit_variants | participation | 0 | 0 | N/A | N/A | N/A |
| digit_variants | homework | 0 | 0 | N/A | N/A | N/A |
| digit_variants | observation | 0 | 2 | 0.0000 | N/A | 0.0000 |
| digit_variants | observation_tag | 0 | 2 | 0.0000 | N/A | 0.0000 |
| durations | attendance | 4 | 4 | 1.0000 | 1.0000 | 1.0000 |
| durations | late_minutes | 3 | 2 | 1.0000 | 0.6667 | 0.8000 |
| durations | score | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| durations | participation | 1 | 0 | N/A | 0.0000 | 0.0000 |
| durations | homework | 0 | 0 | N/A | N/A | N/A |
| durations | observation | 0 | 4 | 0.0000 | N/A | 0.0000 |
| durations | observation_tag | 0 | 4 | 0.0000 | N/A | 0.0000 |
| egyptian_absence | attendance | 2 | 2 | 1.0000 | 1.0000 | 1.0000 |
| egyptian_absence | late_minutes | 0 | 0 | N/A | N/A | N/A |
| egyptian_absence | score | 0 | 0 | N/A | N/A | N/A |
| egyptian_absence | participation | 0 | 0 | N/A | N/A | N/A |
| egyptian_absence | homework | 0 | 0 | N/A | N/A | N/A |
| egyptian_absence | observation | 0 | 2 | 0.0000 | N/A | 0.0000 |
| egyptian_absence | observation_tag | 0 | 2 | 0.0000 | N/A | 0.0000 |
| explicit_present | attendance | 2 | 2 | 1.0000 | 1.0000 | 1.0000 |
| explicit_present | late_minutes | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| explicit_present | score | 0 | 0 | N/A | N/A | N/A |
| explicit_present | participation | 0 | 0 | N/A | N/A | N/A |
| explicit_present | homework | 0 | 0 | N/A | N/A | N/A |
| explicit_present | observation | 0 | 2 | 0.0000 | N/A | 0.0000 |
| explicit_present | observation_tag | 0 | 2 | 0.0000 | N/A | 0.0000 |
| half_score | attendance | 2 | 2 | 1.0000 | 1.0000 | 1.0000 |
| half_score | late_minutes | 1 | 0 | N/A | 0.0000 | 0.0000 |
| half_score | score | 3 | 3 | 1.0000 | 1.0000 | 1.0000 |
| half_score | participation | 1 | 0 | N/A | 0.0000 | 0.0000 |
| half_score | homework | 0 | 0 | N/A | N/A | N/A |
| half_score | observation | 0 | 4 | 0.0000 | N/A | 0.0000 |
| half_score | observation_tag | 0 | 4 | 0.0000 | N/A | 0.0000 |
| here_negative | attendance | 1 | 0 | N/A | 0.0000 | 0.0000 |
| here_negative | late_minutes | 0 | 0 | N/A | N/A | N/A |
| here_negative | score | 0 | 0 | N/A | N/A | N/A |
| here_negative | participation | 0 | 0 | N/A | N/A | N/A |
| here_negative | homework | 0 | 0 | N/A | N/A | N/A |
| here_negative | observation | 0 | 0 | N/A | N/A | N/A |
| here_negative | observation_tag | 0 | 0 | N/A | N/A | N/A |
| lateness | attendance | 6 | 6 | 1.0000 | 1.0000 | 1.0000 |
| lateness | late_minutes | 5 | 5 | 1.0000 | 1.0000 | 1.0000 |
| lateness | score | 2 | 2 | 1.0000 | 1.0000 | 1.0000 |
| lateness | participation | 2 | 1 | 1.0000 | 0.5000 | 0.6667 |
| lateness | homework | 0 | 0 | N/A | N/A | N/A |
| lateness | observation | 0 | 8 | 0.0000 | N/A | 0.0000 |
| lateness | observation_tag | 0 | 7 | 0.0000 | N/A | 0.0000 |
| long_full_name | attendance | 0 | 0 | N/A | N/A | N/A |
| long_full_name | late_minutes | 0 | 0 | N/A | N/A | N/A |
| long_full_name | score | 2 | 2 | 1.0000 | 1.0000 | 1.0000 |
| long_full_name | participation | 0 | 0 | N/A | N/A | N/A |
| long_full_name | homework | 0 | 0 | N/A | N/A | N/A |
| long_full_name | observation | 0 | 2 | 0.0000 | N/A | 0.0000 |
| long_full_name | observation_tag | 0 | 2 | 0.0000 | N/A | 0.0000 |
| misheard_name | attendance | 0 | 0 | N/A | N/A | N/A |
| misheard_name | late_minutes | 0 | 0 | N/A | N/A | N/A |
| misheard_name | score | 0 | 0 | N/A | N/A | N/A |
| misheard_name | participation | 0 | 0 | N/A | N/A | N/A |
| misheard_name | homework | 0 | 0 | N/A | N/A | N/A |
| misheard_name | observation | 0 | 0 | N/A | N/A | N/A |
| misheard_name | observation_tag | 0 | 0 | N/A | N/A | N/A |
| missing_not_absent | attendance | 6 | 6 | 1.0000 | 1.0000 | 1.0000 |
| missing_not_absent | late_minutes | 0 | 0 | N/A | N/A | N/A |
| missing_not_absent | score | 2 | 2 | 1.0000 | 1.0000 | 1.0000 |
| missing_not_absent | participation | 2 | 2 | 1.0000 | 1.0000 | 1.0000 |
| missing_not_absent | homework | 0 | 0 | N/A | N/A | N/A |
| missing_not_absent | observation | 0 | 8 | 0.0000 | N/A | 0.0000 |
| missing_not_absent | observation_tag | 0 | 8 | 0.0000 | N/A | 0.0000 |
| multiple_fields | attendance | 3 | 3 | 1.0000 | 1.0000 | 1.0000 |
| multiple_fields | late_minutes | 2 | 1 | 1.0000 | 0.5000 | 0.6667 |
| multiple_fields | score | 3 | 3 | 1.0000 | 1.0000 | 1.0000 |
| multiple_fields | participation | 1 | 0 | N/A | 0.0000 | 0.0000 |
| multiple_fields | homework | 0 | 0 | N/A | N/A | N/A |
| multiple_fields | observation | 0 | 4 | 0.0000 | N/A | 0.0000 |
| multiple_fields | observation_tag | 0 | 4 | 0.0000 | N/A | 0.0000 |
| needs_revisit | attendance | 0 | 0 | N/A | N/A | N/A |
| needs_revisit | late_minutes | 0 | 0 | N/A | N/A | N/A |
| needs_revisit | score | 0 | 0 | N/A | N/A | N/A |
| needs_revisit | participation | 0 | 0 | N/A | N/A | N/A |
| needs_revisit | homework | 0 | 0 | N/A | N/A | N/A |
| needs_revisit | observation | 2 | 2 | 0.5000 | 0.5000 | 0.5000 |
| needs_revisit | observation_tag | 2 | 2 | 1.0000 | 1.0000 | 1.0000 |
| negative_score | attendance | 0 | 0 | N/A | N/A | N/A |
| negative_score | late_minutes | 0 | 0 | N/A | N/A | N/A |
| negative_score | score | 3 | 2 | 1.0000 | 0.6667 | 0.8000 |
| negative_score | participation | 0 | 0 | N/A | N/A | N/A |
| negative_score | homework | 0 | 0 | N/A | N/A | N/A |
| negative_score | observation | 0 | 3 | 0.0000 | N/A | 0.0000 |
| negative_score | observation_tag | 0 | 3 | 0.0000 | N/A | 0.0000 |
| nicknames | attendance | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| nicknames | late_minutes | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| nicknames | score | 2 | 2 | 1.0000 | 1.0000 | 1.0000 |
| nicknames | participation | 2 | 1 | 1.0000 | 0.5000 | 0.6667 |
| nicknames | homework | 0 | 0 | N/A | N/A | N/A |
| nicknames | observation | 0 | 4 | 0.0000 | N/A | 0.0000 |
| nicknames | observation_tag | 0 | 3 | 0.0000 | N/A | 0.0000 |
| no_names | attendance | 0 | 0 | N/A | N/A | N/A |
| no_names | late_minutes | 0 | 0 | N/A | N/A | N/A |
| no_names | score | 0 | 0 | N/A | N/A | N/A |
| no_names | participation | 0 | 0 | N/A | N/A | N/A |
| no_names | homework | 0 | 0 | N/A | N/A | N/A |
| no_names | observation | 0 | 0 | N/A | N/A | N/A |
| no_names | observation_tag | 0 | 0 | N/A | N/A | N/A |
| normal_participation | attendance | 0 | 0 | N/A | N/A | N/A |
| normal_participation | late_minutes | 0 | 0 | N/A | N/A | N/A |
| normal_participation | score | 0 | 0 | N/A | N/A | N/A |
| normal_participation | participation | 2 | 1 | 1.0000 | 0.5000 | 0.6667 |
| normal_participation | homework | 0 | 0 | N/A | N/A | N/A |
| normal_participation | observation | 0 | 1 | 0.0000 | N/A | 0.0000 |
| normal_participation | observation_tag | 0 | 1 | 0.0000 | N/A | 0.0000 |
| observations | attendance | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| observations | late_minutes | 0 | 0 | N/A | N/A | N/A |
| observations | score | 0 | 0 | N/A | N/A | N/A |
| observations | participation | 0 | 0 | N/A | N/A | N/A |
| observations | homework | 0 | 0 | N/A | N/A | N/A |
| observations | observation | 5 | 4 | 0.5000 | 0.4000 | 0.4444 |
| observations | observation_tag | 5 | 4 | 1.0000 | 0.8000 | 0.8889 |
| participation | attendance | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| participation | late_minutes | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| participation | score | 0 | 0 | N/A | N/A | N/A |
| participation | participation | 6 | 4 | 1.0000 | 0.6667 | 0.8000 |
| participation | homework | 0 | 0 | N/A | N/A | N/A |
| participation | observation | 0 | 5 | 0.0000 | N/A | 0.0000 |
| participation | observation_tag | 0 | 4 | 0.0000 | N/A | 0.0000 |
| positive | attendance | 0 | 0 | N/A | N/A | N/A |
| positive | late_minutes | 0 | 0 | N/A | N/A | N/A |
| positive | score | 0 | 0 | N/A | N/A | N/A |
| positive | participation | 0 | 0 | N/A | N/A | N/A |
| positive | homework | 0 | 0 | N/A | N/A | N/A |
| positive | observation | 2 | 1 | 1.0000 | 0.5000 | 0.6667 |
| positive | observation_tag | 2 | 1 | 1.0000 | 0.5000 | 0.6667 |
| repeated_mentions | attendance | 0 | 0 | N/A | N/A | N/A |
| repeated_mentions | late_minutes | 0 | 0 | N/A | N/A | N/A |
| repeated_mentions | score | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| repeated_mentions | participation | 0 | 0 | N/A | N/A | N/A |
| repeated_mentions | homework | 0 | 0 | N/A | N/A | N/A |
| repeated_mentions | observation | 0 | 0 | N/A | N/A | N/A |
| repeated_mentions | observation_tag | 0 | 0 | N/A | N/A | N/A |
| score_out_of_range | attendance | 0 | 0 | N/A | N/A | N/A |
| score_out_of_range | late_minutes | 0 | 0 | N/A | N/A | N/A |
| score_out_of_range | score | 3 | 2 | 1.0000 | 0.6667 | 0.8000 |
| score_out_of_range | participation | 0 | 0 | N/A | N/A | N/A |
| score_out_of_range | homework | 0 | 0 | N/A | N/A | N/A |
| score_out_of_range | observation | 0 | 3 | 0.0000 | N/A | 0.0000 |
| score_out_of_range | observation_tag | 0 | 3 | 0.0000 | N/A | 0.0000 |
| self_correction | attendance | 2 | 0 | N/A | 0.0000 | 0.0000 |
| self_correction | late_minutes | 0 | 0 | N/A | N/A | N/A |
| self_correction | score | 0 | 0 | N/A | N/A | N/A |
| self_correction | participation | 0 | 0 | N/A | N/A | N/A |
| self_correction | homework | 0 | 0 | N/A | N/A | N/A |
| self_correction | observation | 0 | 2 | 0.0000 | N/A | 0.0000 |
| self_correction | observation_tag | 0 | 2 | 0.0000 | N/A | 0.0000 |
| similar_full_names | attendance | 2 | 2 | 1.0000 | 1.0000 | 1.0000 |
| similar_full_names | late_minutes | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| similar_full_names | score | 4 | 4 | 1.0000 | 1.0000 | 1.0000 |
| similar_full_names | participation | 0 | 0 | N/A | N/A | N/A |
| similar_full_names | homework | 0 | 0 | N/A | N/A | N/A |
| similar_full_names | observation | 0 | 6 | 0.0000 | N/A | 0.0000 |
| similar_full_names | observation_tag | 0 | 6 | 0.0000 | N/A | 0.0000 |
| split_exception | attendance | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| split_exception | late_minutes | 0 | 0 | N/A | N/A | N/A |
| split_exception | score | 0 | 0 | N/A | N/A | N/A |
| split_exception | participation | 0 | 0 | N/A | N/A | N/A |
| split_exception | homework | 0 | 0 | N/A | N/A | N/A |
| split_exception | observation | 0 | 0 | N/A | N/A | N/A |
| split_exception | observation_tag | 0 | 0 | N/A | N/A | N/A |
| split_teen | attendance | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| split_teen | late_minutes | 0 | 0 | N/A | N/A | N/A |
| split_teen | score | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| split_teen | participation | 0 | 0 | N/A | N/A | N/A |
| split_teen | homework | 0 | 0 | N/A | N/A | N/A |
| split_teen | observation | 0 | 0 | N/A | N/A | N/A |
| split_teen | observation_tag | 0 | 0 | N/A | N/A | N/A |
| spoken_scores | attendance | 0 | 0 | N/A | N/A | N/A |
| spoken_scores | late_minutes | 0 | 0 | N/A | N/A | N/A |
| spoken_scores | score | 14 | 13 | 1.0000 | 0.9286 | 0.9630 |
| spoken_scores | participation | 0 | 0 | N/A | N/A | N/A |
| spoken_scores | homework | 0 | 0 | N/A | N/A | N/A |
| spoken_scores | observation | 0 | 13 | 0.0000 | N/A | 0.0000 |
| spoken_scores | observation_tag | 0 | 13 | 0.0000 | N/A | 0.0000 |
| teacher_guardian_names | attendance | 0 | 0 | N/A | N/A | N/A |
| teacher_guardian_names | late_minutes | 0 | 0 | N/A | N/A | N/A |
| teacher_guardian_names | score | 3 | 3 | 1.0000 | 1.0000 | 1.0000 |
| teacher_guardian_names | participation | 0 | 0 | N/A | N/A | N/A |
| teacher_guardian_names | homework | 0 | 0 | N/A | N/A | N/A |
| teacher_guardian_names | observation | 0 | 0 | N/A | N/A | N/A |
| teacher_guardian_names | observation_tag | 0 | 0 | N/A | N/A | N/A |
| understanding | attendance | 0 | 0 | N/A | N/A | N/A |
| understanding | late_minutes | 0 | 0 | N/A | N/A | N/A |
| understanding | score | 0 | 0 | N/A | N/A | N/A |
| understanding | participation | 0 | 0 | N/A | N/A | N/A |
| understanding | homework | 0 | 0 | N/A | N/A | N/A |
| understanding | observation | 2 | 2 | 0.5000 | 0.5000 | 0.5000 |
| understanding | observation_tag | 2 | 2 | 1.0000 | 1.0000 | 1.0000 |
| unknown_full_name | attendance | 0 | 0 | N/A | N/A | N/A |
| unknown_full_name | late_minutes | 0 | 0 | N/A | N/A | N/A |
| unknown_full_name | score | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| unknown_full_name | participation | 0 | 0 | N/A | N/A | N/A |
| unknown_full_name | homework | 0 | 0 | N/A | N/A | N/A |
| unknown_full_name | observation | 0 | 0 | N/A | N/A | N/A |
| unknown_full_name | observation_tag | 0 | 0 | N/A | N/A | N/A |
| unknown_identity_block | attendance | 0 | 0 | N/A | N/A | N/A |
| unknown_identity_block | late_minutes | 0 | 0 | N/A | N/A | N/A |
| unknown_identity_block | score | 0 | 0 | N/A | N/A | N/A |
| unknown_identity_block | participation | 0 | 0 | N/A | N/A | N/A |
| unknown_identity_block | homework | 0 | 0 | N/A | N/A | N/A |
| unknown_identity_block | observation | 0 | 0 | N/A | N/A | N/A |
| unknown_identity_block | observation_tag | 0 | 0 | N/A | N/A | N/A |
| unknown_name | attendance | 0 | 0 | N/A | N/A | N/A |
| unknown_name | late_minutes | 0 | 0 | N/A | N/A | N/A |
| unknown_name | score | 3 | 3 | 1.0000 | 1.0000 | 1.0000 |
| unknown_name | participation | 0 | 0 | N/A | N/A | N/A |
| unknown_name | homework | 0 | 0 | N/A | N/A | N/A |
| unknown_name | observation | 0 | 0 | N/A | N/A | N/A |
| unknown_name | observation_tag | 0 | 0 | N/A | N/A | N/A |
| whisper_negation | attendance | 1 | 0 | N/A | 0.0000 | 0.0000 |
| whisper_negation | late_minutes | 0 | 0 | N/A | N/A | N/A |
| whisper_negation | score | 0 | 0 | N/A | N/A | N/A |
| whisper_negation | participation | 0 | 0 | N/A | N/A | N/A |
| whisper_negation | homework | 0 | 0 | N/A | N/A | N/A |
| whisper_negation | observation | 0 | 0 | N/A | N/A | N/A |
| whisper_negation | observation_tag | 0 | 0 | N/A | N/A | N/A |
| zero_score | attendance | 0 | 0 | N/A | N/A | N/A |
| zero_score | late_minutes | 0 | 0 | N/A | N/A | N/A |
| zero_score | score | 2 | 2 | 1.0000 | 1.0000 | 1.0000 |
| zero_score | participation | 0 | 0 | N/A | N/A | N/A |
| zero_score | homework | 0 | 0 | N/A | N/A | N/A |
| zero_score | observation | 0 | 2 | 0.0000 | N/A | 0.0000 |
| zero_score | observation_tag | 0 | 2 | 0.0000 | N/A | 0.0000 |

## Breakdown: recording_condition

| Group | Notes | WER | CER | Name precision | Name recall | Wrong-student rate | Score exact | Abstain | Unmentioned errors | p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| classroom_noise | 7 | 0.0000 | 0.0000 | 1.0000 | 0.9231 | 0.0000 | 1.0000 | 0.0000 | 0 | 11767.8000 |
| fan | 7 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 10847.2000 |
| quiet | 16 | 0.0000 | 0.0000 | 1.0000 | 0.8636 | 0.0000 | 0.9333 | 0.0000 | 0 | 10954.5000 |
| street | 5 | 0.0000 | 0.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | 0 | 11263.0000 |

| Group | Field | Expected | Predicted | Precision | Recall | F1 |
|---|---|---:|---:|---:|---:|---:|
| classroom_noise | attendance | 6 | 5 | 1.0000 | 0.8333 | 0.9091 |
| classroom_noise | late_minutes | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| classroom_noise | score | 4 | 4 | 1.0000 | 1.0000 | 1.0000 |
| classroom_noise | participation | 2 | 2 | 1.0000 | 1.0000 | 1.0000 |
| classroom_noise | homework | 0 | 0 | N/A | N/A | N/A |
| classroom_noise | observation | 2 | 10 | 0.1000 | 0.5000 | 0.1667 |
| classroom_noise | observation_tag | 2 | 10 | 0.1000 | 0.5000 | 0.1667 |
| fan | attendance | 5 | 5 | 1.0000 | 1.0000 | 1.0000 |
| fan | late_minutes | 1 | 0 | N/A | 0.0000 | 0.0000 |
| fan | score | 5 | 5 | 1.0000 | 1.0000 | 1.0000 |
| fan | participation | 1 | 0 | N/A | 0.0000 | 0.0000 |
| fan | homework | 0 | 0 | N/A | N/A | N/A |
| fan | observation | 3 | 11 | 0.0909 | 0.3333 | 0.1429 |
| fan | observation_tag | 3 | 11 | 0.2727 | 1.0000 | 0.4286 |
| quiet | attendance | 5 | 2 | 1.0000 | 0.4000 | 0.5714 |
| quiet | late_minutes | 0 | 0 | N/A | N/A | N/A |
| quiet | score | 15 | 14 | 1.0000 | 0.9333 | 0.9655 |
| quiet | participation | 2 | 1 | 1.0000 | 0.5000 | 0.6667 |
| quiet | homework | 0 | 0 | N/A | N/A | N/A |
| quiet | observation | 0 | 13 | 0.0000 | N/A | 0.0000 |
| quiet | observation_tag | 0 | 13 | 0.0000 | N/A | 0.0000 |
| street | attendance | 5 | 5 | 1.0000 | 1.0000 | 1.0000 |
| street | late_minutes | 4 | 4 | 1.0000 | 1.0000 | 1.0000 |
| street | score | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |
| street | participation | 2 | 1 | 1.0000 | 0.5000 | 0.6667 |
| street | homework | 0 | 0 | N/A | N/A | N/A |
| street | observation | 0 | 6 | 0.0000 | N/A | 0.0000 |
| street | observation_tag | 0 | 5 | 0.0000 | N/A | 0.0000 |

## Breakdown: model_version

| Group | Notes | WER | CER | Name precision | Name recall | Wrong-student rate | Score exact | Abstain | Unmentioned errors | p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| reference-transcript\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v7 | 35 | 0.0000 | 0.0000 | 1.0000 | 0.9245 | 0.0000 | 0.9600 | 0.0000 | 0 | 11381.4000 |

| Group | Field | Expected | Predicted | Precision | Recall | F1 |
|---|---|---:|---:|---:|---:|---:|
| reference-transcript\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v7 | attendance | 21 | 17 | 1.0000 | 0.8095 | 0.8947 |
| reference-transcript\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v7 | late_minutes | 6 | 5 | 1.0000 | 0.8333 | 0.9091 |
| reference-transcript\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v7 | score | 25 | 24 | 1.0000 | 0.9600 | 0.9796 |
| reference-transcript\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v7 | participation | 7 | 4 | 1.0000 | 0.5714 | 0.7273 |
| reference-transcript\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v7 | homework | 0 | 0 | N/A | N/A | N/A |
| reference-transcript\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v7 | observation | 5 | 40 | 0.0500 | 0.4000 | 0.0889 |
| reference-transcript\|link_nlp@0.1.0\|ollama:qwen3:8b+extract-v7 | observation_tag | 5 | 39 | 0.1026 | 0.8000 | 0.1818 |

## Metric definitions and caveats

WER/CER use aggregate Levenshtein edits after normalize_for_match (CER includes spaces). Missing predictions contribute deletions and missed expected fields; completeness is required for PASS. Empty denominators are N/A.
Name precision/recall evaluate automatic student assignments against unique gold name occurrences. Occurrences are located in their own transcripts (validated offsets, otherwise normalized word occurrences), then aligned independently of IDs through optimal exact-word edit anchors and bounded substitution gaps. Shared coordinate labels do not establish alignment. Confirmed extra assignments and assignments on ambiguous/unknown occurrences block release. Unlocatable or multiply aligned assignments are listed separately, count as unmatched for precision/recall, and force INCOMPLETE rather than being falsely labelled wrong. The name wrong-student rate measures mention assignments; the separate unsafe-item identity count also blocks release when an item is attached without a unique gold identity. Item IDs outside the roster are rejected as invalid input.
Field metrics compare per-note multisets of (student_id, field, value), so duplicates count as false positives. Score exact match is correct score occurrences divided by all expected score occurrences, including missed scores. All emitted proposals are evaluated even in the blank band; abstain is confidence < 0.60 divided by emitted items. It does not measure entirely omitted fields.
Latency percentiles use linear interpolation over supplied nonnegative latencies only. Audio duration is unavailable, so these are per-note values, not duration-normalized measurements per one-minute note. Cost is unavailable in the prediction contract and is not measured. No vendor-regression tolerance is specified; compare results for review.
Hard-case groups overlap. Placeholder speakers (to-fill/unknown) are excluded, and speakers count only when their recording exists. Gold references must remain locked; use a separate development set for tuning.
