import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { Button, textStyle } from '@link/ui-native';
import { color, radius, space } from '@link/tokens';
import { demoApi } from '@link/api-client/demo';
import { useLocale } from '@/locale';

/**
 * "Try Link with your centre" as a teacher (landing page, path A): the "Demo — sample data" banner
 * with "Reset demo", and after two minutes — on Today only, between tasks — a card offering a free
 * pilot on the website. Demo-only (`@/demo`); the pilot build has a stub.
 */
export const TRY_KEY = 'link.try';
const SITE = process.env.EXPO_PUBLIC_SITE_URL || 'http://localhost:3000';
const CARD_AFTER_MS = 2 * 60_000;
const DEMO_KEYS = [TRY_KEY, 'link.teacher.session', 'link.mock.fu.v4', 'link.mock.db.v1'];

/** The website, in this tab on the web (react-native-web's Linking opens a new tab). */
const go = (url: string) => {
  if (Platform.OS === 'web') window.location.assign(url);
  else void Linking.openURL(url);
};

export interface TeacherTry {
  centreName: string;
  lang: 'ar' | 'en';
  startedAt: number;
  cardDone?: boolean;
}

/** True while a personalised demo is on (the follow-up product, no marketplace). */
export const teacherTryOn = () => readTeacherTry() !== null;

export function readTeacherTry(): TeacherTry | null {
  try {
    const raw = globalThis.localStorage?.getItem(TRY_KEY);
    return raw ? (JSON.parse(raw) as TeacherTry) : null;
  } catch {
    return null;
  }
}
export function writeTeacherTry(s: TeacherTry) {
  try {
    globalThis.localStorage?.setItem(TRY_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}

/** Renames this app's sample scenario after the visitor's centre and remembers the demo. */
export async function startTeacherTry(centreName: string, lang: 'ar' | 'en') {
  await demoApi.reset(centreName || undefined);
  await demoApi.settings({ phase2: true, marketplace: false, offline: false, realStt: false });
  writeTeacherTry({ centreName, lang, startedAt: Date.now() });
}

export function TryBanner() {
  const { locale, t } = useLocale();
  const pathname = usePathname();
  const [demo, setDemo] = useState<TeacherTry | null>(null);
  const [card, setCard] = useState(false);
  const [about, setAbout] = useState(false);

  useEffect(() => {
    const s = readTeacherTry();
    setDemo(s);
    if (!s || s.cardDone || pathname !== '/today') return;
    const id = setTimeout(
      () => setCard(true),
      Math.max(0, s.startedAt + CARD_AFTER_MS - Date.now()),
    );
    return () => clearTimeout(id);
  }, [pathname]);

  if (!demo) return null;
  const reset = () => {
    try {
      for (const k of DEMO_KEYS) globalThis.localStorage?.removeItem(k);
    } catch {
      /* nothing stored */
    }
    go(`${SITE}/${demo.lang}`);
  };
  const closeCard = () => {
    setCard(false);
    writeTeacherTry({ ...demo, cardDone: true });
  };
  const pilot = `${SITE}/${locale}/pilot?centre=${encodeURIComponent(demo.centreName)}`;

  return (
    <>
      <View style={styles.banner} testID="try-banner" accessibilityRole="summary">
        <Text style={[textStyle(locale, 'caption'), styles.bannerText]}>
          {t('landing.demo.banner')} · {demo.centreName}
        </Text>
        <Pressable
          onPress={() => setAbout(!about)}
          testID="try-about"
          accessibilityRole="button"
          accessibilityState={{ expanded: about }}
          style={styles.reset}
        >
          <Text style={[textStyle(locale, 'caption'), styles.bannerText, styles.link]}>
            {t('landing.demo.about')}
          </Text>
        </Pressable>
        <Pressable
          onPress={reset}
          testID="try-reset"
          accessibilityRole="button"
          style={styles.reset}
        >
          <Text style={[textStyle(locale, 'label'), { color: color.blue }]}>
            {t('landing.demo.reset')}
          </Text>
        </Pressable>
      </View>
      {about ? (
        <Text style={[textStyle(locale, 'caption'), styles.about]} testID="try-about-text">
          {t('landing.demo.teacherNote')}
        </Text>
      ) : null}
      {card ? (
        <View style={styles.card} testID="try-pilot-card">
          <Text style={[textStyle(locale, 'heading'), { color: color.navy }]}>
            {t('landing.demo.cardTitle')}
          </Text>
          <Text style={[textStyle(locale, 'body'), { color: color.muted }]}>
            {t('landing.demo.cardBody')}
          </Text>
          <Button
            locale={locale}
            label={t('landing.demo.cardCta')}
            onPress={() => {
              closeCard();
              go(pilot);
            }}
          />
          <Button
            locale={locale}
            variant="quiet"
            label={t('landing.demo.cardLater')}
            onPress={closeCard}
          />
        </View>
      ) : null}
    </>
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
  about: {
    backgroundColor: color.navy,
    color: color.white,
    paddingHorizontal: space[16],
    paddingBottom: space[12],
  },
  reset: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space[8] },
  card: {
    position: 'absolute',
    start: space[16],
    end: space[16],
    bottom: 96,
    gap: space[8],
    padding: space[20],
    borderRadius: radius[24],
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.border,
  },
});
