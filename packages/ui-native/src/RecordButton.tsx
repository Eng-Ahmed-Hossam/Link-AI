import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { formatCountdown } from '@link/i18n';
import { color, radius, space, type Locale } from '@link/tokens';
import { Logo } from './Logo';
import { textStyle } from './theme';

/** Distance (pt) toward the start edge that arms "cancel". */
const CANCEL_DISTANCE = 80;

export interface RecordButtonLabels {
  /** Idle hint: "Hold to speak". */
  hold: string;
  /** While recording: "Release to finish". */
  release: string;
  /** While recording: "Slide toward the start to cancel" (CF: V01 gesture follows direction). */
  slide: string;
  /** Cancel is armed: "Release to cancel". */
  cancelArmed: string;
  /** "Recording" (timer pill; shown with a dot and the time, never colour alone). */
  recording: string;
  /** Screen-reader name of the button. */
  a11yName: string;
}

/**
 * V01 record button: hold to record, release to finish, slide toward the START edge to cancel
 * (RTL: rightwards; LTR: leftwards). Screen readers get a tap-to-start / tap-to-finish action,
 * and the screen shows a separate Cancel button, so nothing depends on the gesture alone.
 */
export function RecordButton({
  locale,
  recording,
  elapsedMs,
  levels,
  labels,
  disabled,
  onStart,
  onFinish,
  onCancel,
}: {
  locale: Locale;
  recording: boolean;
  elapsedMs: number;
  /** Recent input levels 0..1, newest last (level meter). */
  levels: number[];
  labels: RecordButtonLabels;
  disabled?: boolean;
  onStart: () => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);
  const rtl = locale === 'ar';
  const cbs = useRef({ onStart, onFinish, onCancel });
  cbs.current = { onStart, onFinish, onCancel };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: () => {
          armedRef.current = false;
          setArmed(false);
          cbs.current.onStart();
        },
        onPanResponderMove: (_e, g) => {
          // Toward the start edge: negative dx in LTR, positive dx in RTL.
          const towardStart = rtl ? g.dx : -g.dx;
          const next = towardStart > CANCEL_DISTANCE;
          if (next !== armedRef.current) {
            armedRef.current = next;
            setArmed(next);
          }
        },
        onPanResponderRelease: () => {
          if (armedRef.current) cbs.current.onCancel();
          else cbs.current.onFinish();
          armedRef.current = false;
          setArmed(false);
        },
        onPanResponderTerminate: () => {
          cbs.current.onCancel();
          armedRef.current = false;
          setArmed(false);
        },
      }),
    [disabled, rtl],
  );

  const hint = !recording
    ? labels.hold
    : armed
      ? labels.cancelArmed
      : `${labels.release} • ${labels.slide}`;

  return (
    <View style={styles.wrap}>
      {recording ? (
        <View accessibilityLiveRegion="polite" style={styles.pill}>
          <View style={styles.dot} />
          <Text style={[textStyle(locale, 'label'), { color: color.white }]}>
            {labels.recording} {formatCountdown(elapsedMs / 1000, locale)}
          </Text>
        </View>
      ) : (
        <View style={{ height: 32 }} />
      )}
      <View
        {...responder.panHandlers}
        testID="record-button"
        accessible
        accessibilityRole="button"
        accessibilityLabel={labels.a11yName}
        accessibilityState={{ disabled: !!disabled, busy: recording }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={() => (recording ? onFinish() : onStart())}
        style={[styles.orb, armed && { opacity: 0.5 }, disabled && { opacity: 0.4 }]}
      >
        <Logo variant="mark-halo" size={recording ? 132 : 112} label="" />
      </View>
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={styles.meter}
      >
        {Array.from({ length: 24 }, (_, i) => {
          const v = levels[levels.length - 24 + i] ?? 0;
          return (
            <View
              key={i}
              style={[styles.bar, { height: 6 + Math.round(v * 30), opacity: recording ? 1 : 0.3 }]}
            />
          );
        })}
      </View>
      <Text style={[textStyle(locale, 'caption'), { color: color.white, textAlign: 'center' }]}>
        {hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: space[16],
    backgroundColor: color.navy,
    borderRadius: radius[24],
    padding: space[20],
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
    alignSelf: 'flex-start',
    backgroundColor: color.red,
    borderRadius: radius[24],
    paddingHorizontal: space[12],
    minHeight: 32,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.white },
  orb: { width: 168, height: 168, alignItems: 'center', justifyContent: 'center' },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 40 },
  bar: { width: 4, borderRadius: 2, backgroundColor: color.blue },
});
