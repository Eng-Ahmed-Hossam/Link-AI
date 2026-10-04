import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, radius, space, type Locale } from '@link/tokens';
import { textStyle, touchTarget } from './theme';

/** Selectable chip (filters, topics, series). 44 pt target even when it looks smaller. */
export function Chip({
  locale,
  label,
  selected,
  onPress,
  testID,
}: {
  locale: Locale;
  label: string;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={onPress ? { selected: !!selected } : undefined}
      onPress={onPress}
      hitSlop={6}
      style={[styles.chip, selected && styles.selected]}
    >
      <Text
        style={[
          textStyle(locale, 'caption'),
          { fontFamily: textStyle(locale, 'label').fontFamily },
          { color: selected ? color.blueText : color.navy },
        ]}
      >
        {selected ? '✓ ' : ''}
        {label}
      </Text>
    </Pressable>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Segmented control with NO default (T02: attendance is chosen explicitly, FUP-REC-02 AC1).
 * `value = null` shows nothing selected.
 */
export function Segmented<T extends string>({
  locale,
  label,
  options,
  value,
  onChange,
  testID,
}: {
  locale: Locale;
  /** Accessible name of the group (e.g. the student's name). */
  label: string;
  options: SegmentOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={styles.seg}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={testID ? `${testID}-${o.value}` : undefined}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${o.label}, ${label}`}
            onPress={() => onChange(o.value)}
            style={[styles.segItem, on && styles.segOn]}
          >
            <Text
              style={[
                textStyle(locale, 'caption'),
                { fontFamily: textStyle(locale, 'label').fontFamily },
                { color: on ? color.white : color.navy },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: space[12],
    borderRadius: radius[24],
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.white,
  },
  selected: { borderColor: color.blue, backgroundColor: color.blueSoft },
  seg: {
    flexDirection: 'row',
    borderRadius: radius[12],
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.white,
    overflow: 'hidden',
  },
  segItem: {
    minHeight: touchTarget,
    minWidth: touchTarget + 8,
    paddingHorizontal: space[8],
    alignItems: 'center',
    justifyContent: 'center',
  },
  segOn: { backgroundColor: color.navy },
});
