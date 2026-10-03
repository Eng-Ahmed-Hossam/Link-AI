import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { color, radius, space, type Locale } from '@link/tokens';
import { textStyle, touchTarget } from './theme';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  locale: Locale;
  label: string;
  help?: string;
  error?: string;
  /** Phone numbers, codes and IDs: LTR text, still start-aligned (RTL-04). */
  ltr?: boolean;
}

export function TextField({ locale, label, help, error, ltr, ...rest }: TextFieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={textStyle(locale, 'label')}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={color.muted}
        style={[
          textStyle(locale, 'body'),
          styles.input,
          error ? { borderColor: color.red } : null,
          ltr
            ? { writingDirection: 'ltr', textAlign: locale === 'ar' ? 'right' : 'left' }
            : { textAlign: 'auto' },
        ]}
        {...rest}
      />
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[textStyle(locale, 'caption'), { color: color.red }]}
        >
          {error}
        </Text>
      ) : help ? (
        <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>{help}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[8] },
  input: {
    minHeight: touchTarget + 4,
    paddingHorizontal: space[16],
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius[12],
  },
});
