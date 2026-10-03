import { StyleSheet, Text, View } from 'react-native';
import { color, radius, semantic, space, type Locale } from '@link/tokens';
import { textStyle } from './theme';

export type StatusTone = 'info' | 'warning' | 'success' | 'error' | 'neutral';

const tones: Record<StatusTone, { fg: string; bg: string }> = {
  info: semantic.info,
  warning: semantic.warning,
  success: semantic.success,
  error: semantic.error,
  neutral: { fg: color.muted, bg: color.soft },
};

/** A dot AND text, never colour alone (11 §6). */
export function StatusBadge({ locale, tone = 'neutral', label }: { locale: Locale; tone?: StatusTone; label: string }) {
  const t = tones[tone];
  return (
    <View style={[styles.box, { backgroundColor: t.bg }]}>
      <View style={[styles.dot, { backgroundColor: t.fg }]} />
      <Text style={[textStyle(locale, 'caption'), { color: t.fg, fontFamily: textStyle(locale, 'label').fontFamily }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space[8],
    paddingVertical: space[4],
    paddingHorizontal: space[12],
    borderRadius: radius[8],
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
