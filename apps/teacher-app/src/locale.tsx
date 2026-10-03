import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DevSettings, I18nManager, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createTranslator,
  defaultLocale,
  dirOf,
  isLocale,
  type Locale,
  type Translate,
} from '@link/i18n';

interface LocaleValue {
  locale: Locale;
  t: Translate;
  setLocale: (l: Locale) => void;
}

const Ctx = createContext<LocaleValue | null>(null);
const KEY = 'link.locale';

/**
 * RTL-01: Arabic is the default. On native the direction is applied with
 * `I18nManager.forceRTL` and takes effect after a reload; on web we set `dir` on the document.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (isLocale(v)) setLocaleState(v);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      document.documentElement.lang = locale;
      document.documentElement.dir = dirOf(locale);
    }
  }, [locale]);

  // Align native direction with the saved locale, then reload once if it differs.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const rtl = dirOf(locale) === 'rtl';
    if (I18nManager.isRTL !== rtl) {
      I18nManager.allowRTL(rtl);
      I18nManager.forceRTL(rtl);
      DevSettings.reload();
    }
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    AsyncStorage.setItem(KEY, l).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ locale, t: createTranslator(locale), setLocale }),
    [locale, setLocale],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLocale outside LocaleProvider');
  return v;
}
