import { StyleSheet, Text, View } from 'react-native';
import { initialsOf } from '@link/i18n';
import { color, type Locale } from '@link/tokens';
import { textStyle } from './theme';

const tones = {
  blue: { bg: color.blueSoft, fg: color.blueText },
  green: { bg: color.greenSoft, fg: color.green },
  amber: { bg: color.amberSoft, fg: color.amber },
  navy: { bg: color.navy, fg: color.white },
} as const;

/** Initials avatar: two letters in the name's own script (11 §3). Decorative: the name is next to it. */
export function Avatar({
  locale,
  name,
  tone = 'blue',
  size = 36,
  mode = 'person',
}: {
  locale: Locale;
  name: string;
  tone?: keyof typeof tones;
  size?: number;
  /** `place` for groups and centres: the first two words ("Secondary 2" → "S2"). */
  mode?: 'person' | 'place';
}) {
  const t = tones[tone];
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        styles.box,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg },
      ]}
    >
      <Text style={[textStyle(locale, 'label'), { color: t.fg, lineHeight: undefined }]}>
        {initialsOf(name, mode)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ box: { alignItems: 'center', justifyContent: 'center' } });
