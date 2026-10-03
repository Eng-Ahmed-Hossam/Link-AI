// Source of truth: docs/11-design-system.md §1–2 (matches Figma variables).
// `tokens.css` is generated from this file by `pnpm --filter @link/tokens build`.

export const color = {
  blue: '#00ADF7', // brand fill, active indicators. NEVER for text (2.5:1 on white).
  navy: '#0A1824',
  bg: '#FAFDFF',
  soft: '#F1F6FB',
  border: '#DCE5EC',
  muted: '#526575',
  white: '#FFFFFF',
  blueSoft: '#E8F7FE',
  blueText: '#006FA3',
  amber: '#946000',
  amberSoft: '#FFF4D6',
  green: '#187447',
  greenSoft: '#E6F5EC',
  red: '#BB3340',
  redSoft: '#FFF0F1',
} as const;

/** Semantic aliases (code only). */
export const semantic = {
  primary: color.blue,
  text: color.navy,
  textMuted: color.muted,
  info: { fg: color.blueText, bg: color.blueSoft },
  warning: { fg: color.amber, bg: color.amberSoft },
  success: { fg: color.green, bg: color.greenSoft },
  error: { fg: color.red, bg: color.redSoft },
} as const;

export const space = {
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  20: 20,
  24: 24,
  32: 32,
  40: 40,
  48: 48,
} as const;
export const radius = { 8: 8, 12: 12, 16: 16, 24: 24 } as const;

/** CSS box-shadow strings (web). `shadow` has RN-friendly equivalents below. */
export const elevation = {
  subtle: '0 1px 2px #0A18240D',
  card: '0 1px 3px #0A18240A, 0 8px 24px -4px #0A18240F',
  glow: '0 6px 16px -2px #00ADF747',
  // Figma-only (P01 frame); not in doc 11 §1 yet — see docs/frontend/token-audit.md.
  raised: '0 2px 6px #0A18240F, 0 24px 48px -8px #0A18241F',
} as const;

/** React Native shadow props (approximate: RN has no spread or multi-shadow). */
export const elevationNative = {
  subtle: {
    shadowColor: color.navy,
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  card: {
    shadowColor: color.navy,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  glow: {
    shadowColor: color.blue,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  raised: {
    shadowColor: color.navy,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
} as const;

export type Locale = 'ar' | 'en';

export const fontFamily = {
  ar: '"Cairo", "Plus Jakarta Sans", system-ui, sans-serif',
  en: '"Plus Jakarta Sans", "Cairo", system-ui, sans-serif',
} as const;

const lineHeight = { en: 1.45, ar: 1.55 } as const; // Arabic is always 155%.

const scale = {
  display: { size: 32, weight: 700 },
  metric: { size: 30, weight: 700 },
  title: { size: 24, weight: 700 },
  heading: { size: 18, weight: 700 },
  body: { size: 14, weight: 400 },
  label: { size: 14, weight: 600 },
  caption: { size: 12, weight: 400 },
} as const;

export type TextStyleName = keyof typeof scale;

const build = (l: Locale) =>
  Object.fromEntries(
    Object.entries(scale).map(([k, v]) => [k, { ...v, lineHeight: lineHeight[l] }]),
  ) as Record<TextStyleName, { size: number; weight: 400 | 600 | 700; lineHeight: number }>;

/** Figma text styles `Link/EN/*` and `Link/AR/*`. */
export const text = { en: build('en'), ar: build('ar') } as const;

/** Minimum touch target in mobile apps (pt). */
export const touchTarget = 44;

export const tokens = {
  color,
  semantic,
  space,
  radius,
  elevation,
  elevationNative,
  fontFamily,
  text,
  touchTarget,
};
