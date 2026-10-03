export const locales = ['ar', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ar';
export const fallbackLocale: Locale = 'en';

export const isLocale = (v: unknown): v is Locale => v === 'ar' || v === 'en';
export const dirOf = (locale: Locale): 'rtl' | 'ltr' => (locale === 'ar' ? 'rtl' : 'ltr');
