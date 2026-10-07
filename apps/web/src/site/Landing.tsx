import {
  BellRing,
  CalendarClock,
  Check,
  ClipboardCheck,
  Eye,
  FileBarChart,
  Flag,
  ListChecks,
  MessageCircle,
  Mic,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserRoundX,
  Users,
  X,
} from 'lucide-react';
import { FaqList, WebArrow, webButtonClass } from '@link/ui';
import type { Locale } from '@link/i18n';
import { getT } from '../i18n';
import { heroAr, heroEn } from './fonts';
import { HeroVisual } from './HeroVisual';
import { LazyPilotForm } from './LazyPilotForm';
import { PILOT_FORM_KEYS, pick } from './strings';
import { TrackedLink } from './Tracked';
import { BrowserFrame, PhoneFrame } from './DeviceFrame';

type T = ReturnType<typeof getT>;

const wrap = 'mx-auto max-w-[1200px] px-4 sm:px-6';
const eyebrow = 'text-web-eyebrow text-blueText';
const iconTile =
  'flex size-11 shrink-0 items-center justify-center rounded-12 bg-blueSoft text-blueText [&>svg]:size-5';

function Ctas({ locale, t, placement }: { locale: Locale; t: T; placement: string }) {
  return (
    <div className="flex flex-wrap gap-3">
      <TrackedLink
        prefetch={false}
        href={`/${locale}/try`}
        event="landing_try_click"
        lang={locale}
        placement={placement}
        className={webButtonClass('primary')}
        data-testid={`cta-try-${placement}`}
      >
        {t('landing.cta.try')}
        <WebArrow />
      </TrackedLink>
      <TrackedLink
        prefetch={false}
        href={`/${locale}/pilot`}
        event="landing_pilot_click"
        lang={locale}
        placement={placement}
        className={webButtonClass('onDark')}
        data-testid={`cta-pilot-${placement}`}
      >
        {t('landing.cta.pilot')}
      </TrackedLink>
    </div>
  );
}

function Hero({ locale, t }: { locale: Locale; t: T }) {
  return (
    <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1fr_600px] lg:pt-16">
      <div className="flex flex-col gap-6">
        <p className="flex w-fit items-center gap-2 rounded-full border border-blue/40 bg-blue/10 px-4 py-1.5 text-web-eyebrow text-[#7fd8ff]">
          <span aria-hidden className="size-2 rounded-full bg-blue" />
          {t('landing.hero.eyebrow')}
        </p>
        <h1
          id="hero-title"
          className={`text-web-hero text-white ${(locale === 'ar' ? heroAr : heroEn).className}`}
        >
          {t('landing.hero.titleA')} <span className="text-blue">{t('landing.hero.titleB')}</span>
        </h1>
        <p className="max-w-[560px] text-web-lead text-white/75">{t('landing.hero.lead')}</p>
        <Ctas locale={locale} t={t} placement="hero" />
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {(['landing.hero.check1', 'landing.hero.check2', 'landing.hero.check3'] as const).map(
            (k) => (
              <li key={k} className="flex items-center gap-2 text-web-small text-white/75">
                <span
                  aria-hidden
                  className="flex size-5 items-center justify-center rounded-full bg-blue/20 text-blue"
                >
                  <Check className="size-3" />
                </span>
                {t(k)}
              </li>
            ),
          )}
        </ul>
      </div>
      <HeroVisual locale={locale} />
    </div>
  );
}

function Strip({ t }: { t: T }) {
  const items = [
    [Mic, 'landing.strip.arabicTitle', 'landing.strip.arabicBody'],
    [ShieldCheck, 'landing.strip.peopleTitle', 'landing.strip.peopleBody'],
    [ListChecks, 'landing.strip.rulesTitle', 'landing.strip.rulesBody'],
    [MessageCircle, 'landing.strip.waTitle', 'landing.strip.waBody'],
  ] as const;
  return (
    <section className="border-b border-border bg-white">
      <ul className={`${wrap} grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4`}>
        {items.map(([Icon, title, body]) => (
          <li key={title} className="flex gap-4">
            <span aria-hidden className={iconTile}>
              <Icon />
            </span>
            <div>
              <h2 className="text-[17px] font-bold text-navy">{t(title)}</h2>
              <p className="text-web-small text-muted">{t(body)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Problem({ t }: { t: T }) {
  const weeks = [
    ['landing.problem.w1', 'landing.problem.w1Title', 'landing.problem.w1Body', 'bg-blue'],
    ['landing.problem.w2', 'landing.problem.w2Title', 'landing.problem.w2Body', 'bg-[#f5a524]'],
    ['landing.problem.w3', 'landing.problem.w3Title', 'landing.problem.w3Body', 'bg-[#f5a524]'],
    ['landing.problem.w4', 'landing.problem.w4Title', 'landing.problem.w4Body', 'bg-red'],
  ] as const;
  return (
    <section aria-labelledby="problem-title" className="site-lazy bg-bg py-20">
      <div className={`${wrap} grid items-center gap-12 lg:grid-cols-2`}>
        <div className="flex flex-col gap-5">
          <p className={eyebrow}>{t('landing.problem.eyebrow')}</p>
          <h2 id="problem-title" className="text-web-h2 text-navy">
            {t('landing.problem.title')}
          </h2>
          <p className="text-web-body text-muted">{t('landing.problem.body')}</p>
          <ul className="flex flex-wrap gap-2">
            {(
              [
                'landing.problem.tag1',
                'landing.problem.tag2',
                'landing.problem.tag3',
                'landing.problem.tag4',
              ] as const
            ).map((k) => (
              <li
                key={k}
                className="flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-web-small text-navy"
              >
                <X aria-hidden className="size-3.5 text-red" />
                {t(k)}
              </li>
            ))}
          </ul>
          <p className="flex items-center gap-2 text-web-body font-bold text-blueText">
            <WebArrow />
            {t('landing.problem.link')}
          </p>
        </div>
        <div className="rounded-[24px] border border-border bg-white p-6 shadow-card sm:p-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-web-h3 text-navy">{t('landing.problem.cardTitle')}</h3>
            <span className="rounded-full bg-soft px-3 py-1 text-caption text-muted">
              {t('landing.problem.cardTag')}
            </span>
          </div>
          <ol className="relative flex flex-col gap-5 border-s-2 border-border ps-6">
            {weeks.map(([week, title, body, dot], i) => (
              <li key={week} className="relative">
                <span
                  aria-hidden
                  className={`absolute -start-[33px] top-1 size-4 rounded-full border-2 border-white ${dot}`}
                />
                <p className="text-caption font-bold text-muted">{t(week)}</p>
                <p className={`text-[17px] font-bold ${i === 3 ? 'text-red' : 'text-navy'}`}>
                  {t(title)}
                </p>
                <p className="text-web-small text-muted">{t(body)}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 flex gap-3 rounded-16 bg-greenSoft p-4 text-web-small text-green">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t('landing.problem.withLink')}
          </p>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: 'landing.how.s1Title',
    body: 'landing.how.s1Body',
    alt: 'landing.how.shotAlt1',
    img: 'step1-voice',
    icon: Mic,
    phone: true,
  },
  {
    title: 'landing.how.s2Title',
    body: 'landing.how.s2Body',
    alt: 'landing.how.shotAlt2',
    img: 'step2-understood',
    icon: ClipboardCheck,
    phone: true,
  },
  {
    title: 'landing.how.s3Title',
    body: 'landing.how.s3Body',
    alt: 'landing.how.shotAlt3',
    img: 'step3-why',
    icon: Flag,
    phone: false,
  },
  {
    title: 'landing.how.s4Title',
    body: 'landing.how.s4Body',
    alt: 'landing.how.shotAlt4',
    img: 'step4-follow-ups',
    icon: UserCheck,
    phone: false,
  },
  {
    title: 'landing.how.s5Title',
    body: 'landing.how.s5Body',
    alt: 'landing.how.shotAlt5',
    img: 'step5-message',
    icon: MessageCircle,
    phone: false,
  },
  {
    title: 'landing.how.s6Title',
    body: 'landing.how.s6Body',
    alt: 'landing.how.shotAlt6',
    img: 'step6-outcome',
    icon: CalendarClock,
    phone: false,
  },
] as const;

function How({ t, locale }: { t: T; locale: Locale }) {
  // "01"… in English; Arabic shows ١…٦ (a padded Arabic zero reads as a dot).
  const num = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    minimumIntegerDigits: locale === 'ar' ? 1 : 2,
  });
  return (
    <section id="how" aria-labelledby="how-title" className="site-lazy scroll-mt-4 bg-white py-20">
      <div className={wrap}>
        <div className="mx-auto mb-14 flex max-w-[720px] flex-col items-center gap-4 text-center">
          <p className={eyebrow}>{t('landing.how.eyebrow')}</p>
          <h2 id="how-title" className="text-web-h2 text-navy">
            {t('landing.how.title')}
          </h2>
          <p className="text-web-lead text-muted">{t('landing.how.lead')}</p>
        </div>
        <ol className="flex flex-col gap-16">
          {STEPS.map((s, i) => (
            <li
              key={s.img}
              className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16"
              data-testid={`how-step-${i + 1}`}
            >
              <div className={`flex flex-col gap-4 ${i % 2 ? 'lg:order-2' : ''}`}>
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex size-12 items-center justify-center rounded-full bg-navy text-[15px] font-bold text-white ring-4 ring-blueSoft"
                  >
                    {num.format(i + 1)}
                  </span>
                  <span aria-hidden className={iconTile}>
                    <s.icon />
                  </span>
                </div>
                <h3 className="text-web-h3 text-navy">{t(s.title)}</h3>
                <p className="max-w-[480px] text-web-body text-muted">{t(s.body)}</p>
              </div>
              <div className="flex justify-center">
                {s.phone ? (
                  <PhoneFrame src={`/landing/${s.img}.png`} alt={t(s.alt)} />
                ) : (
                  <BrowserFrame src={`/landing/${s.img}.png`} alt={t(s.alt)} />
                )}
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-12 text-center text-web-small text-muted">{t('landing.how.sample')}</p>
      </div>
    </section>
  );
}

function Trust({ t }: { t: T }) {
  const flow = [
    [Sparkles, 'landing.trust.flow1', 'landing.trust.flow1Body', false],
    [UserCheck, 'landing.trust.flow2', 'landing.trust.flow2Body', true],
    [ShieldCheck, 'landing.trust.flow3', 'landing.trust.flow3Body', true],
    [MessageCircle, 'landing.trust.flow4', 'landing.trust.flow4Body', false],
  ] as const;
  const cards = [
    [ClipboardCheck, 'landing.trust.c1Title', 'landing.trust.c1Body'],
    [BellRing, 'landing.trust.c2Title', 'landing.trust.c2Body'],
    [UserRoundX, 'landing.trust.c3Title', 'landing.trust.c3Body'],
    [Eye, 'landing.trust.c4Title', 'landing.trust.c4Body'],
  ] as const;
  return (
    <section
      id="trust"
      aria-labelledby="trust-title"
      className="site-lazy scroll-mt-4 bg-[radial-gradient(ellipse_at_top,#0b3a5c_0%,#0a1824_60%)] py-20 text-white"
    >
      <div className={wrap}>
        <div className="mx-auto mb-12 flex max-w-[720px] flex-col items-center gap-4 text-center">
          <p className="text-web-eyebrow text-[#7fd8ff]">{t('landing.trust.eyebrow')}</p>
          <h2 id="trust-title" className="text-web-h2">
            {t('landing.trust.title')}
          </h2>
          <p className="text-web-lead text-white/75">{t('landing.trust.lead')}</p>
        </div>
        <ol className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {flow.map(([Icon, title, body, human]) => (
            <li
              key={title}
              className={`flex flex-col items-center gap-2 rounded-16 border p-5 text-center ${
                human ? 'border-blue/60 bg-white/[0.06]' : 'border-white/15 bg-white/[0.03]'
              }`}
            >
              <span
                aria-hidden
                className={`flex size-11 items-center justify-center rounded-full [&>svg]:size-5 ${
                  human ? 'bg-blue text-navy' : 'bg-white/10 text-[#7fd8ff]'
                }`}
              >
                <Icon />
              </span>
              <p className="text-[17px] font-bold">{t(title)}</p>
              <p className="text-web-small text-white/70">{t(body)}</p>
              {human ? (
                <span className="rounded-full bg-blue/20 px-3 py-0.5 text-caption font-semibold text-[#7fd8ff]">
                  {t('landing.trust.human')}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
        <ul className="grid gap-4 md:grid-cols-2">
          {cards.map(([Icon, title, body]) => (
            <li
              key={title}
              className="flex gap-4 rounded-16 border border-white/15 bg-white/[0.04] p-6"
            >
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-12 bg-blue/15 text-[#7fd8ff] [&>svg]:size-5"
              >
                <Icon />
              </span>
              <div>
                <h3 className="text-[17px] font-bold">{t(title)}</h3>
                <p className="mt-1 text-web-small text-white/75">{t(body)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Pilot({ t }: { t: T }) {
  const steps = [
    [Users, 'landing.pilot.d0Title', 'landing.pilot.d0Body'],
    [CalendarClock, 'landing.pilot.dayTitle', 'landing.pilot.dayBody'],
    [FileBarChart, 'landing.pilot.endTitle', 'landing.pilot.endBody'],
  ] as const;
  return (
    <section
      id="pilot"
      aria-labelledby="pilot-title"
      className="site-lazy scroll-mt-4 bg-[linear-gradient(180deg,#e8f7fe_0%,#fafdff_100%)] py-20"
    >
      <div className={wrap}>
        <div className="mx-auto mb-12 flex max-w-[720px] flex-col items-center gap-4 text-center">
          <p className={eyebrow}>{t('landing.pilot.eyebrow')}</p>
          <h2 id="pilot-title" className="text-web-h2 text-navy">
            {t('landing.pilot.title')}
          </h2>
          <p className="text-web-lead text-muted">{t('landing.pilot.lead')}</p>
          <ul className="flex flex-wrap justify-center gap-2">
            {(['landing.pilot.free', 'landing.pilot.days'] as const).map((k) => (
              <li
                key={k}
                className="rounded-full bg-white px-4 py-1.5 text-label text-navy shadow-subtle"
              >
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
        <ol className="grid gap-5 md:grid-cols-3">
          {steps.map(([Icon, title, body]) => (
            <li
              key={title}
              className="flex flex-col gap-3 rounded-[20px] border border-border bg-white p-6 shadow-card"
            >
              <span aria-hidden className={iconTile}>
                <Icon />
              </span>
              <h3 className="text-web-h3 text-navy">{t(title)}</h3>
              <p className="text-web-body text-muted">{t(body)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function FaqSection({ t, locale }: { t: T; locale: Locale }) {
  const items = ([1, 2, 3, 4, 5, 6] as const).map((n) => ({
    q: t(`landing.faq.q${n}`),
    a: t(`landing.faq.a${n}`),
  }));
  return (
    <section id="faq" aria-labelledby="faq-title" className="site-lazy scroll-mt-4 bg-white py-20">
      <div className={`${wrap} grid gap-10 lg:grid-cols-[400px_1fr] lg:gap-16`}>
        <div className="flex flex-col items-start gap-4">
          <p className={eyebrow}>{t('landing.faq.eyebrow')}</p>
          <h2 id="faq-title" className="text-web-h2 text-navy">
            {t('landing.faq.title')}
          </h2>
          <p className="text-web-body text-muted">{t('landing.faq.lead')}</p>
          <TrackedLink
            prefetch={false}
            href={`/${locale}/pilot`}
            event="landing_pilot_click"
            lang={locale}
            placement="faq"
            className={webButtonClass('outline')}
          >
            {t('landing.cta.pilot')}
            <WebArrow />
          </TrackedLink>
        </div>
        <FaqList name="faq" items={items} />
      </div>
    </section>
  );
}

function Join({ t, locale }: { t: T; locale: Locale }) {
  return (
    <section
      id="request"
      aria-labelledby="join-title"
      className="site-lazy scroll-mt-4 bg-white pb-20"
    >
      <div className={wrap}>
        <div className="grid items-center gap-10 overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#065a96_0%,#0a7cc4_55%,#16a6ec_100%)] p-6 text-white shadow-raised sm:p-12 lg:grid-cols-[1fr_440px]">
          <div className="flex flex-col gap-5">
            <p className="text-web-eyebrow text-white/80">{t('landing.join.eyebrow')}</p>
            <h2 id="join-title" className="text-web-h2">
              {t('landing.join.title')}
            </h2>
            <p className="text-web-lead text-white/85">{t('landing.join.lead')}</p>
          </div>
          <div className="rounded-24 bg-white p-6 text-navy shadow-raised sm:p-7">
            <LazyPilotForm locale={locale} s={pick(t, PILOT_FORM_KEYS)} />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Optional promo video: shown only once `public/landing/promo.mp4` exists. */
function Video({ t, src }: { t: T; src: string | null }) {
  if (!src) return null;
  return (
    <section aria-labelledby="video-title" className="bg-white pb-20" data-testid="promo-video">
      <div className={`${wrap} flex flex-col items-center gap-6`}>
        <h2 id="video-title" className="text-web-h2 text-navy">
          {t('landing.video.title')}
        </h2>
        <video
          controls
          preload="metadata"
          poster="/landing/promo-poster.jpg"
          className="w-full max-w-[960px] rounded-24 border border-border shadow-raised"
        >
          <source src={src} type="video/mp4" />
        </video>
      </div>
    </section>
  );
}

/**
 * The landing page (Figma page 68:605, frame 68:616), led by follow-up (OD-48, CF-19 decided
 * 2026-10-07). Marketplace and pricing sections are not shown while `marketplace.enabled` is off.
 */
export function Landing({ locale, video }: { locale: Locale; video: string | null }) {
  const t = getT(locale);
  const hero = locale === 'ar' ? heroAr : heroEn;
  return (
    // Section headings share the hero's preloaded ExtraBold font (one download, not two).
    <div className="site-root" style={{ ['--site-heading' as string]: hero.style.fontFamily }}>
      <section
        aria-labelledby="hero-title"
        className="bg-[radial-gradient(ellipse_at_80%_20%,#0b4a73_0%,#0a1824_55%)] text-white"
      >
        <Hero locale={locale} t={t} />
      </section>
      <Strip t={t} />
      <Problem t={t} />
      <How t={t} locale={locale} />
      <Video t={t} src={video} />
      <Trust t={t} />
      <Pilot t={t} />
      <FaqSection t={t} locale={locale} />
      <Join t={t} locale={locale} />
    </div>
  );
}
