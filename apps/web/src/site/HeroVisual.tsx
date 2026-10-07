import { Check, Play } from 'lucide-react';
import { Logo } from '@link/ui';
import type { Locale } from '@link/i18n';
import { getT } from '../i18n';

/** Waveform bar heights from the Figma voice card (70:656); the last 12 are "not yet played". */
const BARS = [
  6, 21, 31, 26, 21, 14, 7, 9, 17, 18, 20, 15, 14, 28, 32, 29, 21, 11, 12, 15, 13, 9, 12, 11, 17,
  29, 32, 26, 16, 16, 21, 25, 22, 10,
];

const card =
  'rounded-[18px] bg-white p-4 text-start shadow-[0_2px_6px_rgba(0,6,12,0.14),0_24px_56px_rgba(0,6,12,0.42)]';

/**
 * Hero visual (Figma 70:649…70:725, motion: one 8-second loop): a voice note becomes a confirmed
 * record, a flag and an approved WhatsApp update, around the Link orb. Sample data, labelled.
 * Wide screens: the four cards around the orb, animated (still with prefers-reduced-motion).
 * Narrow screens: three cards stacked, no motion.
 */
export function HeroVisual({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const voice = (
    <div className={`${card} flex w-full flex-col gap-3`}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-blue text-white"
        >
          <Play className="size-4 fill-current rtl:-scale-x-100" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-navy">{t('landing.hero.voiceTitle')}</p>
          <p className="text-[12px] font-medium text-muted">{t('landing.hero.voiceMeta')}</p>
        </div>
      </div>
      <div aria-hidden dir="ltr" className="flex h-[34px] items-center gap-[3px] overflow-hidden">
        {BARS.map((h, i) => (
          <span
            key={i}
            className={`site-bar w-[3.6px] shrink-0 rounded-[2px] ${i < 22 ? 'bg-blue' : 'bg-[#b9e9fc]'}`}
            style={{ height: h, animationDelay: `${(i % 7) * -0.17}s` }}
          />
        ))}
      </div>
      <p lang="ar" dir="rtl" className="text-[14px] leading-[1.65] text-navy">
        {t('landing.hero.voiceText')}
      </p>
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-greenSoft px-2.5 py-1 text-[12px] font-semibold text-green">
        <span aria-hidden className="size-2 rounded-full bg-green" />
        {t('landing.hero.transcribed')}
      </span>
    </div>
  );
  const record = (
    <div className={`${card} flex w-full flex-col gap-2`}>
      <span className="w-fit rounded-full bg-blueSoft px-2.5 py-1 text-[12px] font-semibold text-blueText">
        {t('landing.hero.recordTag')}
      </span>
      <p className="text-[17px] font-bold text-navy">{t('landing.hero.recordName')}</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[13px]">
        <dt className="text-muted">{t('landing.hero.attendance')}</dt>
        <dd className="font-bold text-green">{t('landing.hero.present')}</dd>
        <dt className="text-muted">{t('landing.hero.quiz')}</dt>
        <dd className="font-bold text-navy">
          <bdi>{t('landing.hero.quizScore')}</bdi>
        </dd>
      </dl>
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-green">
        <Check aria-hidden className="size-3.5" />
        {t('landing.hero.teacherConfirmed')}
      </p>
    </div>
  );
  const flag = (
    <div className={`${card} flex w-full flex-col gap-2 border-s-4 border-[#f5a524]`}>
      <p className="flex items-center gap-2 text-[11px] font-bold text-amber">
        <span aria-hidden className="size-2 rounded-full bg-[#f5a524]" />
        {t('landing.hero.flagType')}
      </p>
      <p className="text-[16px] font-bold text-navy">{t('landing.hero.flagTitle')}</p>
      <p className="text-[13px] font-medium text-muted">{t('landing.hero.flagAssigned')}</p>
      <span className="w-fit rounded-full bg-amberSoft px-2.5 py-1 text-[12px] font-semibold text-amber">
        {t('landing.hero.flagDue')}
      </span>
    </div>
  );
  const whatsapp = (
    <div className={`${card} flex w-full flex-col gap-3`}>
      <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
        <span
          aria-hidden
          className="flex size-5 items-center justify-center rounded-full bg-[#25d366] text-white"
        >
          <Check className="size-3" />
        </span>
        {t('landing.hero.waTitle')}
      </p>
      <p
        lang="ar"
        dir="rtl"
        className="rounded-[12px] bg-[#dcf8c6] px-4 py-3 text-[14px] leading-[1.65] text-navy"
      >
        {t('landing.hero.waText')}
      </p>
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-green">
        <Check aria-hidden className="size-3.5" />
        {t('landing.hero.waApproved')}
      </p>
    </div>
  );

  return (
    <figure aria-label={t('landing.hero.visualLabel')} className="m-0 flex flex-col gap-4">
      {/* Narrow screens: a calm stack. */}
      <div className="flex flex-col gap-4 lg:hidden">
        {voice}
        {flag}
        {whatsapp}
      </div>
      {/* Wide screens: the Figma composition and its loop. */}
      <div aria-hidden className="relative hidden h-[600px] lg:block">
        <div className="absolute inset-0 m-auto size-[420px]">
          <span className="site-ring absolute inset-0 rounded-full border border-blue/20" />
          <span className="site-ring site-ring-2 absolute inset-[60px] rounded-full border border-blue/25" />
          <span className="site-live absolute inset-[150px] rounded-full border-2 border-blue/60" />
          <span className="site-glow absolute inset-[110px] rounded-full bg-blue/20 blur-2xl" />
          <span className="site-orb absolute inset-[150px] flex items-center justify-center">
            <Logo variant="mark" size={120} label="" />
          </span>
          <span className="site-sat absolute start-[60px] top-[150px] size-2.5 rounded-full bg-[#f5a524]" />
          <span className="site-sat site-sat-2 absolute end-[70px] top-[110px] size-2.5 rounded-full bg-[#7fd8ff]" />
        </div>
        <div className="site-card site-card-1 absolute start-0 top-4 w-[290px]">{voice}</div>
        <div className="site-card site-card-2 absolute end-0 top-0 w-[236px]">{record}</div>
        <div className="site-card site-card-3 absolute end-0 bottom-[70px] w-[250px]">{flag}</div>
        <div className="site-card site-card-4 absolute start-0 bottom-[34px] w-[300px]">
          {whatsapp}
        </div>
      </div>
      <figcaption className="text-center text-web-small text-white/60">
        {t('landing.hero.sample')}
      </figcaption>
    </figure>
  );
}
