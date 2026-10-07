import type { Locale } from '@link/i18n';
import { FaqList, WebArrow, cn, webButtonClass } from '@link/ui';
import { getT } from '../../i18n';
import { JOIN_FORM_KEYS, pick } from '../strings';
import { TrackedLink } from '../Tracked';
import { emailLine } from '../contact';
import { LazyJoinForm } from './LazyJoinForm';
import { Decor, Heading, Icon, IconBox, iconSrc, pad, wrap } from './parts';

type T = ReturnType<typeof getT>;

/** Section 9, "Free to join. We earn when you do." (Figma 68:626, three plans). */
export function Pricing({ t, locale }: { t: T; locale: Locale }) {
  const plans = [
    {
      role: 'centre',
      dark: true,
      icon: 'price-building.svg',
      label: 'site.market.centresLabel',
      badge: 'site.pricing.centresBadge',
      title: 'site.pricing.centresTitle',
      unit: 'site.pricing.centresUnit',
      body: 'site.pricing.centresBody',
      items: [
        'site.pricing.centres1',
        'site.pricing.centres2',
        'site.pricing.centres3',
        'site.pricing.centres4',
        'site.pricing.centres5',
        'site.pricing.centres6',
      ],
      cta: 'site.pricing.centresTitle',
    },
    {
      role: 'teacher',
      dark: false,
      icon: 'price-star.svg',
      label: 'site.market.teachersLabel',
      badge: null,
      title: 'site.pricing.teachersTitle',
      unit: 'site.pricing.teachersUnit',
      body: 'site.pricing.teachersBody',
      items: [
        'site.pricing.teachers1',
        'site.pricing.teachers2',
        'site.pricing.teachers3',
        'site.pricing.teachers4',
      ],
      cta: 'site.pricing.teachersCta',
    },
    {
      role: 'parent',
      dark: false,
      icon: 'price-users.svg',
      label: 'site.market.parentsLabel',
      badge: null,
      title: 'site.pricing.parentsTitle',
      unit: null,
      body: 'site.pricing.parentsBody',
      items: [
        'site.pricing.parents1',
        'site.pricing.parents2',
        'site.pricing.parents3',
        'site.pricing.parents4',
      ],
      cta: 'site.pricing.parentsCta',
    },
  ] as const;
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      className={`site-lazy scroll-mt-4 bg-bg ${pad}`}
    >
      <div className={`${wrap} flex flex-col items-center gap-14`}>
        <Heading
          id="pricing-title"
          eyebrow={t('site.pricing.eyebrow')}
          title={t('site.pricing.title')}
          lead={t('site.pricing.lead')}
          titleClass="max-w-[860px]"
          leadClass="max-w-[680px]"
        />
        <ul className="grid w-full gap-6 lg:grid-cols-3">
          {plans.map((p) => (
            <li
              key={p.role}
              className={cn(
                'flex flex-col gap-5 rounded-[28px] p-9 lg:h-[673px]',
                p.dark
                  ? 'lp-plan-bg shadow-[0_30px_70px_rgba(10,24,36,0.25)]'
                  : 'border border-border bg-white shadow-[0_10px_30px_rgba(10,24,36,0.05)]',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <p
                  className={cn(
                    'flex items-center gap-3 text-[12px] font-bold',
                    p.dark ? 'text-[#7ee0ff]' : 'text-blueText',
                  )}
                >
                  <IconBox
                    name={p.icon}
                    box={40}
                    icon={18}
                    radius={12}
                    className={p.dark ? 'bg-blue/18' : 'bg-blueSoft'}
                  />
                  {t(p.label)}
                </p>
                {p.badge ? (
                  <span className="rounded-full bg-blue px-2.5 py-1 text-[11px] font-bold text-navy">
                    {t(p.badge)}
                  </span>
                ) : null}
              </div>
              <h3 className={cn('text-web-h3', p.dark ? 'text-white' : 'text-navy')}>
                {t(p.title)}
              </h3>
              <p className="flex items-baseline gap-2">
                <span
                  className={cn(
                    'text-[44px] font-extrabold [font-family:var(--site-heading),var(--font-ui-stack)]',
                    p.dark ? 'text-white' : 'text-navy',
                  )}
                >
                  {t('site.pricing.free')}
                </span>
                {p.unit ? (
                  <span
                    className={cn(
                      'text-[16px] font-medium',
                      p.dark ? 'text-white/60' : 'text-muted',
                    )}
                  >
                    {t(p.unit)}
                  </span>
                ) : null}
              </p>
              <p className={cn('text-[14px]', p.dark ? 'text-white/65' : 'text-muted')}>
                {t(p.body)}
              </p>
              <hr className={cn('m-0 h-px border-0', p.dark ? 'bg-white/14' : 'bg-border')} />
              <ul className="flex flex-col gap-3">
                {p.items.map((k) => (
                  <li
                    key={k}
                    className={cn(
                      'flex items-center gap-2.5 text-[14px] font-medium',
                      p.dark ? 'text-white/88' : 'text-navy',
                    )}
                  >
                    <Icon name={p.dark ? 'price-tick-dark.svg' : 'price-tick.svg'} size={20} />
                    {t(k)}
                  </li>
                ))}
              </ul>
              <span className="flex-1" />
              <TrackedLink
                prefetch={false}
                href={`/${locale}/try?role=${p.role}`}
                event="landing_try_click"
                lang={locale}
                placement={`pricing-${p.role}`}
                className={webButtonClass(p.dark ? 'primary' : 'outline', 'w-full')}
              >
                {t(p.cta)}
                <WebArrow />
              </TrackedLink>
            </li>
          ))}
        </ul>
        <p className="max-w-[1113px] text-center text-[13px] font-medium text-muted">
          {t('site.pricing.note')}
        </p>
      </div>
    </section>
  );
}

/** Section 10, "Questions centres ask us" (Figma 68:627, FAQ item component). */
export function Faq({ t }: { t: T }) {
  const items = ([1, 2, 3, 4, 5, 6] as const).map((n) => ({
    q: t(`site.faq.q${n}`),
    a: t(`site.faq.a${n}`),
  }));
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className={`site-lazy scroll-mt-4 bg-white ${pad}`}
    >
      <div className={`${wrap} flex flex-col gap-10 lg:flex-row lg:gap-20`}>
        <div className="flex flex-col items-start gap-5 lg:w-[420px] lg:shrink-0">
          <Heading
            id="faq-title"
            eyebrow={t('site.faq.eyebrow')}
            title={t('site.faq.title')}
            center={false}
          />
          <p className="max-w-[400px] text-[17px] leading-[1.62] text-muted">
            {t('site.faq.body')}
          </p>
          <a href="#join" className={webButtonClass('outline')}>
            {t('site.faq.talk')}
            <WebArrow />
          </a>
        </div>
        <div className="min-w-0 flex-1">
          <FaqList name="landing-faq" items={items} />
        </div>
      </div>
    </section>
  );
}

/** Section 11, "Give every concern an owner before a student drifts away" (Figma 68:628). */
export function Join({ t, locale, whatsapp }: { t: T; locale: Locale; whatsapp: string | null }) {
  return (
    <section
      id="join"
      aria-labelledby="join-title"
      className="site-lazy scroll-mt-4 bg-white px-4 pt-10 pb-16 sm:px-6 lg:px-8 lg:pb-[120px] xl:px-0"
    >
      <div
        className={`${wrap} lp-cta-bg relative flex flex-col gap-10 overflow-hidden rounded-[36px] p-6 shadow-[0_40px_90px_rgba(0,111,163,0.22)] sm:p-10 lg:flex-row lg:items-center lg:gap-14 lg:p-[72px]`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -top-[175px] -end-[170px] size-[420px]"
        >
          <Decor name="cta-ring1.svg" className="lp-ring-1 absolute inset-0 size-full" />
          <Decor
            name="cta-ring2.svg"
            className="lp-ring-2 absolute top-[60px] start-[60px] size-[300px]"
          />
          <img
            src={iconSrc('cta-orb.webp')}
            alt=""
            loading="lazy"
            className="lp-float-9 absolute top-[142.8px] start-[142.8px] size-[134.4px] rounded-[48px]"
          />
        </span>
        <div className="relative flex flex-col items-start gap-6 lg:w-[560px] lg:shrink-0">
          <p className="text-web-eyebrow text-white/80">{t('site.nav.join')}</p>
          <h2 id="join-title" className="text-web-h2 text-white">
            {t('site.join.title')}
          </h2>
          <p className="max-w-[520px] text-[18px] leading-[1.6] font-medium text-white/86">
            {t('site.join.body')}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <TrackedLink
              prefetch={false}
              href={`/${locale}/try`}
              event="landing_try_click"
              lang={locale}
              placement="join"
              className={webButtonClass('dark')}
            >
              {t('site.join.getStarted')}
              <WebArrow />
            </TrackedLink>
            {/* The WhatsApp number is not set yet (Figma note 80:691, item 5): until it is, this
                goes to the form beside it. */}
            {whatsapp ? (
              <a
                href={whatsapp}
                className={webButtonClass('onDark')}
                rel="noopener"
                target="_blank"
              >
                {t('site.join.whatsapp')}
              </a>
            ) : (
              <a href="#join-form" className={webButtonClass('onDark')}>
                {t('site.join.whatsapp')}
              </a>
            )}
          </div>
        </div>
        <div
          id="join-form"
          className="relative min-w-0 flex-1 rounded-24 bg-white p-6 shadow-[0_24px_60px_rgba(0,18,31,0.25)] sm:p-7"
        >
          <LazyJoinForm locale={locale} s={pick(t, JOIN_FORM_KEYS)} email={emailLine(t)} />
        </div>
      </div>
    </section>
  );
}
