import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@link/ui';
import { SPRITE } from './sprite';

/**
 * Shared pieces of the landing page (Figma 68:616, desktop 1440: content 1200 wide, sections
 * padded 120). Assets are Figma's own exports in `public/landing/figma` (icons in `i/`).
 */
export const FIGMA = '/landing/figma';
export const iconSrc = (name: string) => `${FIGMA}/i/${name}`;

export const wrap = 'mx-auto w-full max-w-[1200px]';
/** Section padding: Figma's 120 on desktop, tighter on phones. */
export const pad = 'px-4 py-16 sm:px-6 lg:px-8 lg:py-[120px] xl:px-0';

/**
 * A Figma icon (exact colours), drawn from the icon sprite (scripts/landing-sprite.mjs builds it
 * from the files in `public/landing/figma/i`): one cached request for every icon. Decorative.
 */
export function Icon({
  name,
  size,
  className,
  style,
}: {
  name: string;
  size: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      className={cn('block shrink-0', className)}
      style={style}
    >
      <use href={`${SPRITE}#${name.replace(/\.svg$/, '')}`} />
    </svg>
  );
}

/** A Figma decoration (rings, glow, track, connector) as a lazy image; decorative. */
export function Decor({ name, className }: { name: string; className?: string }) {
  return (
    <img
      src={iconSrc(name)}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      className={className}
    />
  );
}

/** The rounded square (or circle) behind an icon. */
export function IconBox({
  name,
  box = 48,
  icon = 22,
  radius = 14,
  className,
  style,
}: {
  name: string;
  box?: number;
  icon?: number;
  radius?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center', className)}
      style={{ width: box, height: box, borderRadius: radius, ...style }}
    >
      <Icon name={name} size={icon} />
    </span>
  );
}

/** Eyebrow + H2 + lead, as in every Figma section heading. */
export function Heading({
  id,
  eyebrow,
  title,
  lead,
  center = true,
  dark = false,
  titleClass,
  leadClass,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
  center?: boolean;
  dark?: boolean;
  titleClass?: string;
  leadClass?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-[18px]',
        center ? 'items-center text-center' : 'items-start',
      )}
    >
      <p className={cn('text-web-eyebrow', dark ? 'text-[#7ee0ff]' : 'text-blueText')}>{eyebrow}</p>
      <h2 id={id} className={cn('text-web-h2', dark ? 'text-white' : 'text-navy', titleClass)}>
        {title}
      </h2>
      {lead ? (
        <p className={cn('text-web-lead', dark ? 'text-white/72' : 'text-muted', leadClass)}>
          {lead}
        </p>
      ) : null}
      {children}
    </div>
  );
}
