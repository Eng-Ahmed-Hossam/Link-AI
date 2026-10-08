import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { textStyle } from '@link/ui-native';
import { color, space } from '@link/tokens';
import { demoApi } from '@link/api-client/demo';
import { useLocale } from '@/locale';

/**
 * "Try Link" as a teacher (the website's role chooser): the "Demo — sample data" banner with
 * "Switch role" (back to the role chooser) and "Reset demo" — nothing else (2A.6). Demo-only
 * (`@/demo`); the pilot build has a stub.
 */
export const TRY_KEY = 'link.try';
const SITE = process.env.EXPO_PUBLIC_SITE_URL || 'http://localhost:3000';
const DEMO_KEYS = [TRY_KEY, 'link.teacher.session', 'link.mock.fu.v4', 'link.mock.db.v1'];

/** The website, in this tab on the web (react-native-web's Linking opens a new tab). */
const go = (url: string) => {
  if (Platform.OS === 'web') window.location.assign(url);
  else void Linking.openURL(url);
};

export interface TeacherTry {
  lang: 'ar' | 'en';
  startedAt: number;
}

/** True while the demo is on (the whole product: marketplace and the Follow-up extra). */
export const teacherTryOn = () => readTeacherTry() !== null;

export function readTeacherTry(): TeacherTry | null {
  try {
    const raw = globalThis.localStorage?.getItem(TRY_KEY);
    return raw ? (JSON.parse(raw) as TeacherTry) : null;
  } catch {
    return null;
  }
}
function writeTeacherTry(s: TeacherTry) {
  try {
    globalThis.localStorage?.setItem(TRY_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}

/**
 * Joins the shared demo story as the sample teacher. Never resets it: what the parent or the centre
 * did in the other roles stays (only "Reset demo" starts over).
 */
export async function startTeacherTry(lang: 'ar' | 'en') {
  await demoApi.settings({ phase2: true, marketplace: true, offline: false, realStt: false });
  writeTeacherTry({ lang, startedAt: Date.now() });
}

export function TryBanner() {
  const { locale, t } = useLocale();
  const pathname = usePathname();
  const [demo, setDemo] = useState<TeacherTry | null>(null);

  useEffect(() => setDemo(readTeacherTry()), [pathname]);

  if (!demo) return null;
  const reset = async () => {
    try {
      await demoApi.reset();
    } catch {
      /* the shared server is down: still clear this device */
    }
    try {
      for (const k of DEMO_KEYS) globalThis.localStorage?.removeItem(k);
    } catch {
      /* nothing stored */
    }
    go(`${SITE}/${locale}`);
  };

  return (
    <View style={styles.banner} testID="try-banner" accessibilityRole="summary">
      <Text style={[textStyle(locale, 'caption'), styles.bannerText]}>
        {t('landing.demo.banner')}
      </Text>
      <Pressable
        onPress={() => go(`${SITE}/${locale}/try`)}
        testID="switch-role"
        accessibilityRole="link"
        style={styles.reset}
      >
        <Text style={[textStyle(locale, 'caption'), styles.bannerText, styles.link]}>
          {t('common.switchRole')}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => void reset()}
        testID="try-reset"
        accessibilityRole="button"
        style={styles.reset}
      >
        <Text style={[textStyle(locale, 'label'), { color: color.blue }]}>
          {t('landing.demo.reset')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[8],
    backgroundColor: color.navy,
    paddingHorizontal: space[16],
  },
  bannerText: { color: color.white, fontWeight: '600' },
  link: { textDecorationLine: 'underline' },
  reset: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space[8] },
});
