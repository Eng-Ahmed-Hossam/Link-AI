import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, radius, semantic, space, type Locale } from '@link/tokens';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import { textStyle } from './theme';

export type ReviewBand = 'high' | 'medium' | 'low';
export type ReviewDecision = 'pending' | 'accepted' | 'skipped';

export interface ReviewItemLabels {
  /** Medium confidence: "Check". */
  check: string;
  /** Low confidence: "Not sure — fill it in". */
  blank: string;
  /** Source words: "From: …". */
  from: string;
  accept: string;
  edit: string;
  skip: string;
  accepted: string;
  skipped: string;
}

/**
 * One item of "What the AI understood" (V02). Each item is accepted, edited or skipped on its own
 * (FUP-VOI-03 AC2). High confidence is pre-filled; medium is pre-filled and marked "Check"; low is
 * left BLANK with the source words shown (OD-36). Nothing here is saved until the teacher confirms.
 */
export function ReviewItemCard({
  locale,
  title,
  field,
  value,
  sourceText,
  band,
  decision,
  labels,
  blocking,
  editor,
  onAccept,
  onEdit,
  onSkip,
  testID,
}: {
  locale: Locale;
  title: string;
  /** "Attendance", "Score (out of 20)", "Observation". */
  field: string;
  /** Display value; ignored when band is low (blank). */
  value: string | null;
  sourceText: string;
  band: ReviewBand;
  decision: ReviewDecision;
  labels: ReviewItemLabels;
  /** A blocking problem (e.g. "Confirm identity") replaces Accept. */
  blocking?: ReactNode;
  /** Inline editor while editing / filling a blank. */
  editor?: ReactNode;
  onAccept?: () => void;
  onEdit?: () => void;
  onSkip: () => void;
  testID?: string;
}) {
  const shown = band === 'low' ? null : value;
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        band === 'medium' && decision === 'pending' && styles.check,
        decision === 'skipped' && { opacity: 0.6 },
      ]}
    >
      <View style={styles.head}>
        <Text style={[textStyle(locale, 'label'), { flex: 1 }]}>{title}</Text>
        {decision === 'accepted' ? (
          <StatusBadge locale={locale} tone="success" label={labels.accepted} />
        ) : decision === 'skipped' ? (
          <StatusBadge locale={locale} tone="neutral" label={labels.skipped} />
        ) : band === 'medium' ? (
          <StatusBadge locale={locale} tone="warning" label={labels.check} />
        ) : band === 'low' ? (
          <StatusBadge locale={locale} tone="neutral" label={labels.blank} />
        ) : null}
      </View>
      <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>{field}</Text>
      <Text testID={testID ? `${testID}-value` : undefined} style={textStyle(locale, 'body')}>
        {shown ?? '—'}
      </Text>
      <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
        {/* RTL-05: the source words are Arabic inside either UI language: isolate them. */}
        {labels.from} {'\u00AB\u2068'}
        {sourceText}
        {'\u2069\u00BB'}
      </Text>
      {editor}
      {blocking ??
        (decision === 'pending' ? (
          <View style={styles.actions}>
            {onAccept && shown != null ? (
              <Button
                locale={locale}
                variant="secondary"
                label={labels.accept}
                onPress={onAccept}
              />
            ) : null}
            {onEdit ? (
              <Button locale={locale} variant="secondary" label={labels.edit} onPress={onEdit} />
            ) : null}
            <Button locale={locale} variant="quiet" label={labels.skip} onPress={onSkip} />
          </View>
        ) : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space[8],
    padding: space[16],
    borderRadius: radius[16],
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.white,
  },
  check: { borderColor: semantic.warning.fg, borderWidth: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[8] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
});
