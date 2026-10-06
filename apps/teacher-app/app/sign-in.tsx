import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from 'react-native';
import { Button, Callout, textStyle } from '@link/ui-native';
import { color } from '@link/tokens';
import { useLocale } from '@/locale';
import { useSession } from '@/session';
import { SAMPLE_TEACHER } from '@/demo';
import { API_MODE, PILOT } from '@/api-mode';
import { PilotSignIn } from '@/screens/PilotSignIn';
import { Screen } from '@/ui/Screen';

/**
 * Stand-in sign-in for the mock-data app. Phone + code sign-in (T14) is Batch 3; until then mock
 * modes offer the sample teacher only, and live mode shows nothing to sign in with.
 */
export default function SignIn() {
  if (PILOT) return <PilotSignIn />;
  return <SampleSignIn />;
}

function SampleSignIn() {
  const { locale, t } = useLocale();
  const { signIn } = useSession();
  const router = useRouter();
  // `/sign-in?sample=1` (the web dev index's one-click sign-in): straight in as the sample teacher.
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  useEffect(() => {
    if (sample === '1' && API_MODE !== 'live' && SAMPLE_TEACHER) {
      signIn(SAMPLE_TEACHER);
      router.replace('/');
    }
  }, [sample, signIn, router]);
  return (
    <Screen title={t('teacher.signIn.title')}>
      <Callout locale={locale} tone="info" body={t('teacher.signIn.pending')} />
      {API_MODE !== 'live' && SAMPLE_TEACHER ? (
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
