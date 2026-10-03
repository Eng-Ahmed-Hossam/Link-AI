import { StyleSheet, Text, View } from 'react-native';
import { color, space, type Locale } from '@link/tokens';
import { textStyle } from './theme';

/** Dev-only: visible whenever mock data is on. */
export function MockBadge({ locale, label }: { locale: Locale; label: string }) {
  return (
    <View style={styles.badge}>
      <Text style={[textStyle(locale, 'caption'), { color: color.white }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    bottom: 96,
    end: space[12],
    backgroundColor: color.navy,
    borderRadius: 999,
    paddingVertical: space[4],
    paddingHorizontal: space[12],
    opacity: 0.9,
    pointerEvents: 'none',
  },
});
