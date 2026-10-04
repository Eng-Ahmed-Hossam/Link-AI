import { useRouter } from 'expo-router';
import { Text } from 'react-native';
import { Button, Callout, textStyle } from '@link/ui-native';
import { color } from '@link/tokens';
import { useLocale } from '@/locale';
import { SAMPLE_TEACHER, useSession } from '@/session';
import { API_MODE } from '@/api-mode';
import { Screen } from '@/ui/Screen';

/**
 * Stand-in sign-in for the mock-data app. Phone + code sign-in (T14) is Batch 3; until then mock
 * modes offer the sample teacher only, and live mode shows nothing to sign in with.
 */
export default function SignIn() {
  const { locale, t } = useLocale();
  const { signIn } = useSession();
  const router = useRouter();
  return (
    <Screen title={t('teacher.signIn.title')}>
      <Callout locale={locale} tone="info" body={t('teacher.signIn.pending')} />
      {API_MODE !== 'live' ? (
        <Button
          locale={locale}
          testID="sign-in-sample"
          label={t('teacher.signIn.sample')}
          onPress={() => {
            signIn(SAMPLE_TEACHER);
            router.replace('/');
          }}
        />
      ) : (
        <Text style={[textStyle(locale, 'body'), { color: color.muted }]}>
          {t('teacher.signIn.liveUnavailable')}
        </Text>
      )}
    </Screen>
  );
}
