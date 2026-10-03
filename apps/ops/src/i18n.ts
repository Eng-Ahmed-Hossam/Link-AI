import { notFound } from 'next/navigation';
import { createTranslator, isLocale, type Locale } from '@link/i18n';

export function parseLocale(lang: string): Locale {
  if (!isLocale(lang)) notFound();
  return lang;
}

export const getT = (lang: Locale) => createTranslator(lang);
