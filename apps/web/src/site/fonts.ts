import localFont from 'next/font/local';

/**
 * The hero heading's fonts (Link/Web/Hero: ExtraBold 800), preloaded with size-matched fallbacks
 * so the largest text on the page paints early and does not jump when the font arrives
 * (Lighthouse LCP/CLS). Same OFL files as @fontsource (Cairo Arabic, Plus Jakarta Sans Latin).
 * The rest of the page keeps the shared fonts from @link/ui.
 */
export const heroAr = localFont({
  src: './fonts/cairo-arabic-800-normal.woff2',
  weight: '800',
  display: 'swap',
  fallback: ['Tahoma', 'Arial', 'sans-serif'],
  adjustFontFallback: 'Arial',
});
// Arabic is the default language: only its hero font is preloaded (the English page keeps the
// size-matched fallback until Jakarta arrives, so nothing moves).
export const heroEn = localFont({
  src: './fonts/plus-jakarta-sans-latin-800-normal.woff2',
  weight: '800',
  display: 'swap',
  preload: false,
  fallback: ['Arial', 'sans-serif'],
  adjustFontFallback: 'Arial',
});
