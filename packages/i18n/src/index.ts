import { IntlMessageFormat } from 'intl-messageformat';
import en from '../messages/en.json';
import ar from '../messages/ar.json';
import { defaultLocale, fallbackLocale, type Locale } from './locale';

export * from './locale';
export * from './format';
export * from './names';

export type MessageKey = keyof typeof en;
export type Values = Record<string, string | number | Date>;
export type Translate = (key: MessageKey, values?: Values) => string;

const catalogs: Record<Locale, Record<string, string>> = { en, ar };
const cache = new Map<string, IntlMessageFormat>();

const formatterFor = (locale: Locale, key: string) => {
  const id = `${locale}:${key}`;
  let f = cache.get(id);
  if (!f) {
    const source = catalogs[locale][key] ?? catalogs[fallbackLocale][key] ?? key;
    f = new IntlMessageFormat(source, locale === 'ar' ? 'ar-EG' : 'en');
    cache.set(id, f);
  }
  return f;
};

/** ICU MessageFormat translator. Falls back to `en`, then to the key itself. */
export function createTranslator(locale: Locale = defaultLocale): Translate {
  return (key, values) => String(formatterFor(locale, key).format(values));
}

export const messages = catalogs;
