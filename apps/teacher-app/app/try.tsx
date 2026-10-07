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
 * `/try?centre=…&lang=…` — the website's "Try Link with your centre" as a teacher (path A): renames
 * this app's sample scenario after the visitor's centre, signs in the sample teacher, opens Today.
 * Mock modes only; the pilot and live builds go to the start.
 */
export default function Try() {
  const { centre, lang } = useLocalSearchParams<{ centre?: string; lang?: string }>();
  const { locale, t, setLocale } = useLocale();
  const { signIn } = useSession();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const available = !PILOT && API_MODE !== 'live' && SAMPLE_TEACHER && startTeacherTry;

  useEffect(() => {
    if (!available) return;
    const name = (centre ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const l = isLocale(lang ?? '') ? (lang as 'ar' | 'en') : locale;
    setLocale(l);
    (async () => {
      try {
        await startTeacherTry!(name, l);
        signIn(SAMPLE_TEACHER!);
        router.replace('/today');
      } catch {
        setFailed(true);
      }
    })();
    // Once per visit.
  }, []);

  if (!available) return <Redirect href="/" />;
  return (
    <Screen title={t('landing.try.title')}>
      <StateView
        locale={locale}
        kind={failed ? 'error' : 'loading'}
        title={failed ? t('states.error.title') : t('landing.try.opening')}
        body={failed ? t('states.error.body') : undefined}
      />
    </Screen>
  );
}
