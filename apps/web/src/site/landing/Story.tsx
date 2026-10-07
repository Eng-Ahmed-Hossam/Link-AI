import Image from 'next/image';
import type { Locale } from '@link/i18n';
import { getT } from '../../i18n';
import { Decor, FIGMA, Heading, Icon, IconBox, pad, wrap } from './parts';

type T = ReturnType<typeof getT>;

/** Section 2, the proof row under the hero (Figma 68:619, "Principles"). */
export function Principles({ t }: { t: T }) {
  const items = [
    ['principle-mic.svg', 'site.principles.arabicTitle', 'site.principles.arabicBody'],
    ['principle-shield.svg', 'site.principles.peopleTitle', 'site.principles.peopleBody'],
    ['principle-rules.svg', 'site.principles.rulesTitle', 'site.principles.rulesBody'],
    ['principle-chat.svg', 'site.principles.whatsappTitle', 'site.principles.whatsappBody'],
  ] as const;
  return (
    <section className="border-b border-border bg-white px-4 py-11 sm:px-6 lg:px-8 xl:px-0">
      <ul className={`${wrap} grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4`}>
        {items.map(([icon, title, body]) => (
          <li key={title} className="flex items-start gap-3.5">
            <IconBox name={icon} box={44} icon={20} radius={12} className="bg-blueSoft" />
            <div className="flex flex-col gap-1">
              <p className="text-[15px] font-bold text-navy">{t(title)}</p>
              <p className="text-[13px] text-muted">{t(body)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Section 3, "A concern is noticed. Then nobody follows up." (Figma 68:620). */
export function Problem({ t }: { t: T }) {
  const chips = [
    'site.problem.chipPaper',
    'site.problem.chipWhatsApp',
    'site.problem.chipSheets',
    'site.problem.chipMemory',
  ] as const;
  const weeks = [
    [
      'problem-dot-blue.svg',
      'site.problem.week1',
      'site.problem.step1Title',
      'site.problem.step1Body',
      'text-navy',
    ],
    [
      'problem-dot-amber.svg',
      'site.problem.week2',
      'site.problem.step2Title',
      'site.problem.step2Body',
      'text-navy',
    ],
    [
      'problem-dot-amber.svg',
      'site.problem.week3',
      'site.problem.step3Title',
      'site.problem.step3Body',
      'text-navy',
    ],
    [
      'problem-dot-red.svg',
      'site.problem.week4',
      'site.problem.step4Title',
      'site.problem.step4Body',
      'text-red',
    ],
  ] as const;
  return (
    <section aria-labelledby="problem-title" className={`site-lazy bg-bg ${pad}`}>
      <div
        className={`${wrap} flex flex-col items-center gap-12 lg:flex-row lg:justify-between lg:gap-10`}
      >
        <div className="flex w-full max-w-[540px] flex-col items-start gap-[22px]">
          <Heading
            id="problem-title"
            eyebrow={t('site.problem.eyebrow')}
            title={t('site.problem.title')}
            center={false}
          />
          <p className="max-w-[480px] text-[17px] leading-[1.62] text-muted">
            {t('site.problem.body')}
          </p>
          <ul aria-label={t('site.problem.lostLabel')} className="flex flex-wrap gap-2">
            {chips.map((k) => (
              <li
                key={k}
                className="flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-[7px] text-[13px] font-semibold text-muted"
              >
                <Icon name="problem-x.svg" size={12} />
                {t(k)}
              </li>
            ))}
          </ul>
          <p className="flex items-center gap-2.5 text-[16px] font-bold text-blueText">
            <Icon name="problem-arrow.svg" size={18} className="rtl:-scale-x-100" />
            {t('site.problem.answer')}
          </p>
        </div>
        <div className="flex w-full max-w-[620px] flex-col gap-[22px] rounded-24 border border-border bg-white p-6 shadow-[0_2px_6px_rgba(10,24,36,0.04),0_24px_60px_rgba(10,24,36,0.08)] sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[20px] leading-[1.32] font-bold tracking-[-0.01em] text-navy rtl:tracking-normal">
              {t('site.problem.cardTitle')}
            </h3>
            <span className="rounded-full bg-soft px-2.5 py-[5px] text-[12px] font-semibold text-muted">
              {t('site.problem.cardPill')}
            </span>
          </div>
          <ol className="flex flex-col">
            {weeks.map(([dot, week, title, body, color], i) => (
              <li key={week} className="flex items-stretch gap-[18px]">
                <span aria-hidden className="flex w-4 shrink-0 flex-col items-center gap-1">
                  <span className="relative size-3.5 shrink-0">
                    <Icon name={dot} size={22} className="absolute -top-1 -start-1 max-w-none" />
                  </span>
                  {i < weeks.length - 1 ? <span className="w-0.5 flex-1 bg-border" /> : null}
                </span>
                <div className="flex flex-1 flex-col gap-1 pb-[22px]">
                  <p className="text-[11px] font-bold text-muted">{t(week)}</p>
                  <p className={`text-[16px] font-bold ${color}`}>{t(title)}</p>
                  <p className="text-[14px] text-muted">{t(body)}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="flex items-start gap-3.5 rounded-16 bg-greenSoft p-[18px] text-[14px] font-medium text-green">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white"
            >
              <Icon name="problem-check.svg" size={16} />
            </span>
            <span className="flex-1">{t('site.problem.withLink')}</span>
          </p>
        </div>
      </div>
    </section>
  );
}

/** Section 4, "From a voice note to a parent update, in four steps" (Figma 68:621). */
export function HowItWorks({ t, locale }: { t: T; locale: Locale }) {
  const fmt = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en', { minimumIntegerDigits: 2 });
  const steps = [
    [
      'how-mic.svg',
      'site.how.speakTitle',
      'site.how.speakBody',
      'step-speak',
      'site.how.speakAlt',
      88,
    ],
    [
      'how-check.svg',
      'site.how.confirmTitle',
      'site.how.confirmBody',
      'step-confirm',
      'site.how.confirmAlt',
      102,
    ],
    [
      'how-flag.svg',
      'site.how.flagTitle',
      'site.how.flagBody',
      'step-flag',
      'site.how.flagAlt',
      101,
    ],
    [
      'how-task.svg',
      'site.how.followTitle',
      'site.how.followBody',
      'step-followup',
      'site.how.followAlt',
      105,
    ],
  ] as const;
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-title"
      className={`site-lazy scroll-mt-4 bg-white ${pad}`}
    >
      <div className={`${wrap} flex flex-col items-center gap-12`}>
        <Heading
          id="how-title"
          eyebrow={t('site.how.eyebrow')}
          title={t('site.how.title')}
          lead={t('site.how.lead')}
          titleClass="max-w-[780px]"
          leadClass="max-w-[680px]"
        />
        {/* The step track (Figma 72:619): badges over the card centres, a dot travels along. */}
        <div
          aria-hidden
          className="relative hidden h-12 w-full [container-type:inline-size] lg:block"
        >
          {/* Card centres: (width − 3 gaps of 24) / 8 × (2i + 1) + 24 × i. */}
          <span className="absolute top-6 h-0.5" style={{ insetInline: 'calc((100% - 72px) / 8)' }}>
            <Decor name="how-track.svg" className="block h-0.5 w-full" />
          </span>
          <span
            className="lp-traveler absolute top-[2px] size-11 [--lp-track:calc(75cqw+18px)] rtl:[--lp-track:calc(-75cqw-18px)]"
            style={{ insetInlineStart: 'calc((100% - 72px) / 8 - 22px)' }}
          >
            <Decor name="how-traveler.svg" className="block size-11" />
          </span>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`lp-badge lp-badge-${i + 1} absolute top-0 flex size-12 [font-family:var(--site-heading),var(--font-ui-stack)] items-center justify-center rounded-full border-[6px] border-blue/28 bg-navy text-[15px] font-extrabold text-white`}
              style={{
                insetInlineStart: `calc((100% - 72px) / 8 * ${2 * i + 1} + ${24 * i - 24}px)`,
              }}
            >
              {fmt.format(i + 1)}
            </span>
          ))}
        </div>
        <ol className="grid w-full gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([icon, title, body, img, alt, h], i) => (
            <li
              key={title}
              className="flex flex-col gap-3.5 rounded-[20px] border border-border bg-bg p-7 lg:h-[382px]"
            >
              <span className="sr-only">{fmt.format(i + 1)}</span>
              <IconBox name={icon} className="bg-blueSoft" />
              <h3 className="text-web-h3 text-navy">{t(title)}</h3>
              <p className="text-[15px] leading-[1.62] text-muted">{t(body)}</p>
              <span className="flex-1" />
              {/* Figma's own mini UI; the export is padded 16/10 for its shadow. */}
              <span className="-mx-4 -mt-2.5 -mb-[22px] block">
                <Image
                  src={`${FIGMA}/${img}.webp`}
                  alt={t(alt)}
                  width={512}
                  height={h * 2}
                  sizes="256px"
                  className="h-auto w-full"
                />
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
