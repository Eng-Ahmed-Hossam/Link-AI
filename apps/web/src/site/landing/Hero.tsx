import type { CSSProperties } from 'react';
import Image from 'next/image';
import type { Locale } from '@link/i18n';
import { WebArrow, webButtonClass } from '@link/ui';
import { getT } from '../../i18n';
import { heroAr, heroEn } from '../fonts';
import { TrackedLink } from '../Tracked';
import { AfterLoad } from './AfterLoad';
import { Decor, FIGMA, Icon, wrap } from './parts';

type T = ReturnType<typeof getT>;

/** Figma "Hero visual" (70:639) is 600 × 640; children are placed in percent of that box. */
const at = (x: number, y: number, w: number, h = w): CSSProperties => ({
  position: 'absolute',
  insetInlineStart: `${(x / 600) * 100}%`,
  top: `${(y / 640) * 100}%`,
  width: `${(w / 600) * 100}%`,
  height: `${(h / 640) * 100}%`,
});

/**
 * The four cards are Figma's own renders (SVG export → 2x WebP, shadow included). Each export is
 * padded for its drop shadow, so the image sits that much before and above the card's position.
 */
const CARDS = [
  {
    key: 'voice',
    x: 0 - 56,
    y: 16 - 16,
    w: 402,
    h: 305,
    cls: 'lp-card-voice',
    alt: 'site.hero.altVoice',
  },
  {
    key: 'record',
    x: 364 - 56,
    y: 0,
    w: 292,
    h: 277,
    cls: 'lp-card-record',
    alt: 'site.hero.altRecord',
  },
  {
    key: 'whatsapp',
    x: 0 - 56,
    y: 404 - 32,
    w: 412,
    h: 268,
    cls: 'lp-card-wa',
    alt: 'site.hero.altWhatsApp',
  },
  {
    key: 'flag',
    x: 350 - 56,
    y: 446 - 50,
    w: 306,
    h: 226,
    cls: 'lp-card-flag',
    alt: 'site.hero.altFlag',
  },
] as const;

function HeroVisual({ t }: { t: T }) {
  const deco = (name: string, style: CSSProperties, cls = '') => (
    <span aria-hidden className={cls} style={style}>
      <Decor name={name} className="block size-full" />
    </span>
  );
  return (
    <figure
      aria-label={t('site.hero.visualLabel')}
      className="relative m-0 aspect-[600/640] w-full max-w-[600px]"
    >
      <AfterLoad>
        {deco('hero-glow.svg', at(10, 18, 600), 'lp-glow')}
        {deco('hero-ring1.svg', at(185, 193, 250), 'lp-ring-1')}
        {deco('hero-ring2.svg', at(130, 138, 360), 'lp-ring-2')}
        {deco('hero-sat1.svg', at(400.76 - 12, 232.65 - 12, 34), 'lp-sat')}
        {deco('hero-sat2.svg', at(136.36 - 12, 251.94 - 12, 33), 'lp-sat lp-sat-2')}
        {deco('hero-sat3.svg', at(188.5 - 12, 517.52 - 12, 32), 'lp-sat lp-sat-3')}
        {deco('hero-ring3.webp', at(75, 83, 470), 'lp-ring-3')}
        <span
          aria-hidden
          className="lp-float overflow-hidden rounded-[48px]"
          style={at(218.8, 226.8, 182.4)}
        >
          <Image
            src={`${FIGMA}/i/hero-orb.webp`}
            alt=""
            width={365}
            height={365}
            className="size-full"
          />
        </span>
        {CARDS.map((c) => (
          <span key={c.key} className={`lp-card ${c.cls}`} style={at(c.x, c.y, c.w, c.h)}>
            <Image
              src={`${FIGMA}/hero-${c.key}.webp`}
              alt={t(c.alt)}
              width={c.w * 2}
              height={c.h * 2}
              sizes="(min-width: 1024px) 412px, 70vw"
              className="size-full"
            />
          </span>
        ))}
      </AfterLoad>
      <figcaption
        className="absolute w-full text-center text-[12px] font-medium text-white/45"
        style={{ top: `${(612 / 640) * 100}%`, insetInlineStart: 0 }}
      >
        {t('site.hero.sample')}
      </figcaption>
    </figure>
  );
}

/** Section 1, "Speak after class. Link does the follow-up." (Figma 68:618). */
export function Hero({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const font = (locale === 'ar' ? heroAr : heroEn).className;
  return (
    <section
      aria-labelledby="hero-title"
      className="lp-hero-bg overflow-hidden px-4 pt-10 pb-16 sm:px-6 lg:px-8 lg:pt-16 lg:pb-24 xl:px-0"
    >
      <div
        className={`${wrap} flex flex-col items-center gap-12 lg:flex-row lg:items-center lg:justify-between lg:gap-6`}
      >
        <div className="flex w-full max-w-[580px] flex-col items-start gap-7">
          <p className="inline-flex items-center gap-2.5 rounded-full border border-blue/35 bg-blue/12 py-[7px] ps-2.5 pe-3.5">
            <span aria-hidden className="relative size-3 shrink-0">
              <Icon name="hero-live-ring.svg" size={12} className="lp-live absolute inset-0" />
              <Icon name="hero-live-core.svg" size={6} className="absolute top-[3px] start-[3px]" />
            </span>
            <span className="text-[12px] leading-[1.4] font-bold tracking-[0.12em] text-[#7ee0ff] uppercase rtl:tracking-normal">
              {t('site.hero.eyebrow')}
            </span>
          </p>
          <h1 id="hero-title" className={`text-web-hero text-white ${font}`}>
            <span className="block">{t('site.hero.title1')}</span>
            <span className="block">{t('site.hero.title2')}</span>
            <span className="block">
              <span className="bg-linear-to-r from-blue to-[#7ee0ff] bg-clip-text text-transparent rtl:bg-linear-to-l">
                {t('site.hero.titleAccent')}
              </span>
              .
            </span>
          </h1>
          <p className={`max-w-[560px] text-web-lead text-white/74`}>{t('site.hero.lead')}</p>
          <div className="flex flex-wrap items-center gap-3.5">
            <TrackedLink
              prefetch={false}
              href={`/${locale}/try`}
              event="landing_try_click"
              lang={locale}
              placement="hero"
              className={webButtonClass('primary')}
              data-testid="cta-try-hero"
            >
              {t('site.hero.joinFree')}
              <WebArrow />
            </TrackedLink>
            <a href="#how-it-works" className={webButtonClass('onDark')}>
              {t('site.hero.seeHow')}
            </a>
          </div>
          <ul className="flex w-full flex-wrap items-center gap-x-[22px] gap-y-2.5">
            {(['site.hero.trust1', 'site.hero.trust2', 'site.hero.trust3'] as const).map((k) => (
              <li
                key={k}
                className="flex items-center gap-2 text-[13px] leading-[1.5] font-medium text-white/72"
              >
                <Icon name="hero-tick.svg" size={20} />
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
        <HeroVisual t={t} />
      </div>
    </section>
  );
}
