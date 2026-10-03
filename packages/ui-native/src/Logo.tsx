import { Image, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { color } from '@link/tokens';
import { WORDMARK } from './brand/wordmark';
// Metro picks logo-mark@2x.png / @3x.png for the screen density.
import MARK from './brand/logo-mark.png';
import HALO from './brand/logo-mark-halo.png';

/** The halo version is for hero sizes only (11 §3: sign-in, voice capture). */
export const HALO_MIN_SIZE = 56;

export type LogoVariant = 'lockup-light' | 'lockup-dark' | 'mark' | 'mark-halo';

/**
 * Link / Logo (Figma 65:385). Orb: density PNGs (raster until OD-49 gives a vector).
 * Wordmark: SVG outlines (Plus Jakarta Sans Bold, SIL OFL 1.1). Never mirrored in RTL (RTL-03).
 */
export function Logo({
  variant = 'lockup-light',
  size,
  label = 'Link',
}: {
  variant?: LogoVariant;
  size?: number;
  /** Accessible name; pass "" when decorative. */
  label?: string;
}) {
  const a11y = label
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants' as const,
      };
  if (variant === 'mark' || variant === 'mark-halo') {
    const s = size ?? (variant === 'mark-halo' ? 96 : 48);
    const src = variant === 'mark-halo' && s >= HALO_MIN_SIZE ? HALO : MARK;
    return <Image source={src} style={{ width: s, height: s }} {...a11y} />;
  }
  const orb = size ?? 32;
  const k = orb / 32;
  return (
    <View
      {...a11y}
      style={{ flexDirection: 'row', direction: 'ltr', alignItems: 'center', gap: 8 * k }}
    >
      <Image source={MARK} style={{ width: orb, height: orb }} />
      <Svg
        width={WORDMARK.width * k}
        height={WORDMARK.height * k}
        viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`}
      >
        <Path d={WORDMARK.d} fill={variant === 'lockup-dark' ? color.white : color.blue} />
      </Svg>
    </View>
  );
}
