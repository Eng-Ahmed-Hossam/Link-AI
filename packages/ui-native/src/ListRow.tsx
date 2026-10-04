import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, space, type Locale } from '@link/tokens';
import { Avatar } from './Avatar';
import { textStyle, touchTarget } from './theme';

/** List row with an initials avatar (11 §3). Names may wrap to two lines (RTL-09). */
export function ListRow({
  locale,
  name,
  subtitle,
  trailing,
  onPress,
  accessibilityHint,
  testID,
}: {
  locale: Locale;
  name: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
  testID?: string;
}) {
  const body = (
    <>
      <Avatar locale={locale} name={name} />
      <View style={styles.text}>
        <Text numberOfLines={2} style={textStyle(locale, 'label')}>
          {name}
        </Text>
        {subtitle ? (
          <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {trailing}
    </>
  );
  return onPress ? (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
    >
      {body}
    </Pressable>
  ) : (
    <View testID={testID} style={styles.row}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    minHeight: touchTarget + 8,
    paddingVertical: space[8],
  },
  text: { flex: 1, gap: 2 },
});
