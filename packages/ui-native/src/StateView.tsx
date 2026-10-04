import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { color, space, type Locale } from '@link/tokens';
import { Button } from './Button';
import { Card } from './Card';
import { textStyle } from './theme';

export type StateKind = 'loading' | 'empty' | 'offline' | 'error';

/** Loading / empty / offline / error for every list and form (11 §4). */
export function StateView({
  locale,
  kind,
  title,
  body,
  actionLabel,
  onAction,
}: {
  locale: Locale;
  kind: StateKind;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card tone={kind === 'error' ? 'error' : kind === 'offline' ? 'warning' : 'default'}>
      <View
        accessibilityRole={kind === 'error' || kind === 'offline' ? 'alert' : undefined}
        accessibilityLiveRegion="polite"
        aria-busy={kind === 'loading'}
        style={styles.box}
      >
        {kind === 'loading' ? <ActivityIndicator color={color.blueText} /> : null}
        <Text style={textStyle(locale, 'label')}>{title}</Text>
        {body ? (
          <Text style={[textStyle(locale, 'body'), { color: color.muted }]}>{body}</Text>
        ) : null}
        {actionLabel && onAction ? (
          <Button locale={locale} variant="secondary" label={actionLabel} onPress={onAction} />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({ box: { gap: space[8], alignItems: 'flex-start' } });
