import { createTranslator, type Locale } from '@link/i18n';

/** Translator for the story's current toolbar language. */
export const tFor = (globals: Record<string, unknown>) =>
  createTranslator((globals.locale ?? 'ar') as Locale);
export const localeOf = (globals: Record<string, unknown>) => (globals.locale ?? 'ar') as Locale;
