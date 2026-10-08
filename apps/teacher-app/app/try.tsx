import { useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { StateView } from '@link/ui-native';
import { isLocale } from '@link/i18n';
import { useLocale } from '@/locale';
import { useSession } from '@/session';
import { SAMPLE_TEACHER, startTeacherTry } from '@/demo';
import { API_MODE, PILOT } from '@/api-mode';
import { Screen } from '@/ui/Screen';

/**
 * `/try?lang=…` — "Teacher" on the website's role chooser: signs in the sample teacher (Ms Salma)
 * and opens My groups, the teacher's home. Joins the shared demo story without resetting it. Mock
 * modes only; the pilot and live builds go to the start.
 */
export default function Try() {
  const { lang } = useLocalSearchParams<{ lang?: string }>();
  const { locale, t, setLocale } = useLocale();
  const { signIn } = useSession();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const available = !PILOT && API_MODE !== 'live' && SAMPLE_TEACHER && startTeacherTry;

  useEffect(() => {
    if (!available) return;
    const l = isLocale(lang ?? '') ? (lang as 'ar' | 'en') : locale;
    setLocale(l);
    (async () => {
      try {
        await startTeacherTry!(l);
        signIn(SAMPLE_TEACHER!);
        router.replace('/groups');
      } catch {
        setFailed(true);
      }
    })();
    // Once per visit.
  }, []);

  if (!available) return <Redirect href="/" />;
  return (
    <Screen title={t('site.try.title')}>
      <StateView
        locale={locale}
        kind={failed ? 'error' : 'loading'}
        title={failed ? t('states.error.title') : t('site.try.opening')}
        body={failed ? t('states.error.body') : undefined}
      />
    </Screen>
  );
}
