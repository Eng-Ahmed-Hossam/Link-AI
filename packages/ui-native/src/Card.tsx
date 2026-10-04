import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { color, elevationNative, radius, semantic, space, type Locale } from '@link/tokens';
import { textStyle } from './theme';

export type CardTone = 'default' | 'info' | 'warning' | 'success' | 'error' | 'dark';

const toneStyle: Record<CardTone, ViewStyle> = {
  default: { backgroundColor: color.white, borderColor: color.border, ...elevationNative.card },
  info: { backgroundColor: semantic.info.bg, borderColor: semantic.info.bg },
  warning: { backgroundColor: semantic.warning.bg, borderColor: semantic.warning.bg },
  success: { backgroundColor: semantic.success.bg, borderColor: semantic.success.bg },
  error: { backgroundColor: semantic.error.bg, borderColor: semantic.error.bg },
  dark: { backgroundColor: color.navy, borderColor: color.navy },
};

/** Card surface (11 §1: radius 16, card elevation). Tinted tones carry callouts. */
export function Card({
  tone = 'default',
  children,
  style,
  testID,
}: {
  tone?: CardTone;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[styles.card, toneStyle[tone], style]}>
      {children}
    </View>
  );
}

const fg: Record<Exclude<CardTone, 'default' | 'dark'>, string> = {
  info: semantic.info.fg,
  warning: semantic.warning.fg,
  success: semantic.success.fg,
  error: semantic.error.fg,
};

/** Title + body on a tinted card — the "operational honesty" pattern (11 §4). */
export function Callout({
  locale,
  tone,
  title,
  body,
  children,
  role,
}: {
  locale: Locale;
  tone: keyof typeof fg;
  title?: string;
  body?: string;
  children?: ReactNode;
  /** `alert` for errors the user must notice. */
  role?: 'alert' | 'summary';
}) {
  return (
    <Card tone={tone}>
      <View accessibilityRole={role} style={{ gap: space[8] }}>
        {title ? (
          <Text style={[textStyle(locale, 'label'), { color: fg[tone] }]}>{title}</Text>
        ) : null}
        {body ? <Text style={[textStyle(locale, 'body'), { color: fg[tone] }]}>{body}</Text> : null}
        {children}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius[16], borderWidth: 1, padding: space[16], gap: space[12] },
});
