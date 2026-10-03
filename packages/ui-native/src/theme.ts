import { color, text, touchTarget, type Locale, type TextStyleName } from '@link/tokens';

export { color, touchTarget };

/**
 * Font family names as registered by expo-font in the app
 * (@expo-google-fonts/cairo and @expo-google-fonts/plus-jakarta-sans, both OFL).
 */
const families = {
  ar: { 400: 'Cairo_400Regular', 600: 'Cairo_600SemiBold', 700: 'Cairo_700Bold' },
  en: {
    400: 'PlusJakartaSans_400Regular',
    600: 'PlusJakartaSans_600SemiBold',
    700: 'PlusJakartaSans_700Bold',
  },
} as const;

/** Figma text style `Link/EN/*` or `Link/AR/*` as a React Native text style (Arabic is 155% line height). */
export function textStyle(locale: Locale, name: TextStyleName) {
  const s = text[locale][name];
  return {
    fontFamily: families[locale][s.weight],
    fontSize: s.size,
    lineHeight: Math.round(s.size * s.lineHeight),
    color: color.navy,
  } as const;
}
