import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, space, type Locale } from '@link/tokens';
import { Logo } from './Logo';
import { textStyle, touchTarget } from './theme';

/**
 * Teacher app header (T01–T13): lockup + role, the context line ("Al Nour Centre • Sample data"),
 * the title, and an optional subtitle / stepper line. `onBack` adds a back button that mirrors in RTL.
 */
export function ScreenHeader({
  locale,
  role,
  context,
  title,
  subtitle,
  step,
  onBack,
  backLabel,
  trailing,
}: {
  locale: Locale;
  role: string;
  context?: string;
  title: string;
  subtitle?: string;
  /** "Step 1 of 4" — shown with a progress bar. */
  step?: { label: string; index: number; total: number };
  onBack?: () => void;
  backLabel?: string;
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            onPress={onBack}
            hitSlop={8}
            style={styles.back}
          >
            {/* RTL-03: directional arrow mirrors with the layout. */}
            <Text
              style={[
                textStyle(locale, 'heading'),
                { transform: [{ scaleX: locale === 'ar' ? -1 : 1 }] },
              ]}
            >
              ←
            </Text>
          </Pressable>
        ) : null}
        <Logo size={24} label="Link" />
        <Text style={[textStyle(locale, 'caption'), styles.role]}>{role}</Text>
        <View style={{ flex: 1 }} />
        {trailing}
      </View>
      {context ? (
        <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>{context}</Text>
      ) : null}
      <Text accessibilityRole="header" style={textStyle(locale, 'title')}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[textStyle(locale, 'body'), { color: color.muted }]}>{subtitle}</Text>
      ) : null}
      {step ? (
        <View style={{ gap: space[8] }}>
          <Text style={[textStyle(locale, 'body'), { color: color.muted }]}>{step.label}</Text>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: step.total, now: step.index }}
            style={styles.track}
          >
            <View style={[styles.fill, { width: `${(step.index / step.total) * 100}%` }]} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[8], paddingBottom: space[8] },
  top: { flexDirection: 'row', alignItems: 'center', gap: space[12], minHeight: touchTarget },
  role: { color: color.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  back: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: -space[12],
  },
  track: { height: 4, borderRadius: 2, backgroundColor: color.soft, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: color.blue },
});
