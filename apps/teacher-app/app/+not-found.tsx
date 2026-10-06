import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, textStyle } from '@link/ui-native';
import { color } from '@link/tokens';
import { useLocale } from '@/locale';
import { Screen } from '@/ui/Screen';

/** Any path no screen matches: "not found" in the app's language, with a way back to the start. */
export default function NotFound() {
  const { locale, t } = useLocale();
  const router = useRouter();
  return (
    <Screen title={t('states.notFound.title')} testID="screen-not-found">
      <Text style={[textStyle(locale, 'body'), { color: color.muted }]}>
        {t('states.notFound.body')}
      </Text>
      <Button
        locale={locale}
        testID="not-found-home"
        label={t('states.notFound.home')}
        onPress={() => router.replace('/')}
      />
    </Screen>
  );
}
