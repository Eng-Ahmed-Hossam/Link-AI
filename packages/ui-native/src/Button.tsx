import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';
import { color, elevationNative, radius, space, type Locale } from '@link/tokens';
import { textStyle, touchTarget } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  locale: Locale;
  label: string;
  variant?: ButtonVariant;
  danger?: boolean;
}

/** Primary / Secondary / Quiet / Disabled (11 §3). Touch target is at least 44 pt. */
export function Button({ locale, label, variant = 'primary', danger, disabled, ...rest }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'primary' && !disabled && elevationNative.glow,
        variant === 'secondary' && styles.secondary,
        disabled && styles.disabled,
        pressed && !disabled && { opacity: 0.85 },
      ]}
      {...rest}
    >
      <Text
        style={[
          textStyle(locale, 'label'),
          variant === 'quiet' && { color: color.blueText },
          danger && { color: color.red },
          disabled && { color: color.muted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    paddingHorizontal: space[20],
    borderRadius: radius[12],
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: color.blue },
  secondary: { backgroundColor: color.white, borderWidth: 1, borderColor: color.border },
  disabled: { backgroundColor: color.soft, borderColor: color.soft },
});
