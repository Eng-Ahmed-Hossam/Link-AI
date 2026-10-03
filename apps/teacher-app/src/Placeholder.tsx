import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, StatusBadge, textStyle } from '@link/ui-native';
import { color, radius, space } from '@link/tokens';
import { useLocale } from '@/locale';

/** Tab screen stand-in until Batch 3: title, note, and the language switch. */
export function Placeholder({ title }: { title: string }) {
  const { locale, t, setLocale } = useLocale();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top + space[16] }]}>
      <Text accessibilityRole="header" style={textStyle(locale, 'title')}>
        {title}
      </Text>
      <View style={styles.card}>
        <StatusBadge locale={locale} tone="neutral" label={t('common.status.neutral')} />
        <Text style={[textStyle(locale, 'body'), { color: color.muted }]}>{t('teacher.shell.placeholder')}</Text>
      </View>
      <View style={styles.row}>
        <Button
          locale={locale}
          variant={locale === 'ar' ? 'primary' : 'secondary'}
          label={t('common.languageSwitch.ar')}
          onPress={() => setLocale('ar')}
        />
        <Button
          locale={locale}
          variant={locale === 'en' ? 'primary' : 'secondary'}
          label={t('common.languageSwitch.en')}
          onPress={() => setLocale('en')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space[16], gap: space[16] },
  card: {
    gap: space[12],
    padding: space[16],
    backgroundColor: color.white,
    borderRadius: radius[16],
    borderWidth: 1,
    borderColor: color.border,
  },
  row: { flexDirection: 'row', gap: space[12] },
});
