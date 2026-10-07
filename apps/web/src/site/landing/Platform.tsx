import Image from 'next/image';
import { getT } from '../../i18n';
import { Decor, FIGMA, Heading, IconBox, pad, wrap } from './parts';

type T = ReturnType<typeof getT>;

// The approval mock's export is padded for its shadow (40 left, 32 right, 24 top, 56 bottom of 396).
// The picture is not mirrored in Arabic, so its padding stays on the same physical sides.
const APPROVAL_PAD = '-mt-[6.06%] -mr-[8.08%] -mb-[14.14%] -ml-[10.1%]'; // rtl-ignore
const card = 'flex flex-col gap-3.5 rounded-24 border border-border bg-bg p-8';
const h3 = 'text-web-h3 text-navy';
const body = 'text-[15px] leading-[1.62] text-muted';

/** Section 6, "Everything a centre needs to act early" (Figma 68:623, the bento). */
export function Features({ t }: { t: T }) {
  const small = [
    ['how-check.svg', 'site.features.recordsTitle', 'site.features.recordsBody'],
    ['how-task.svg', 'site.features.ownerTitle', 'site.features.ownerBody'],
    ['feat-chart.svg', 'site.features.dashboardTitle', 'site.features.dashboardBody'],
  ] as const;
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className={`site-lazy scroll-mt-4 bg-white ${pad}`}
    >
      <div className={`${wrap} flex flex-col items-center gap-14`}>
        <Heading
          id="features-title"
          eyebrow={t('site.features.eyebrow')}
          title={t('site.features.title')}
          lead={t('site.features.lead')}
          titleClass="max-w-[760px]"
          leadClass="max-w-[680px]"
        />
        <div className="grid w-full gap-6 lg:grid-cols-3">
          {/* Row 1: the dark rules card (2 columns) and voice notes. */}
          <div className="lp-rules-bg flex flex-col gap-8 rounded-24 p-8 md:flex-row md:items-center lg:col-span-2 lg:h-[321px]">
            <div className="flex flex-col gap-3.5 md:w-[300px] md:shrink-0">
              <IconBox name="feat-rules.svg" className="bg-blue/16" />
              <h3 className="text-web-h3 text-white">{t('site.features.rulesTitle')}</h3>
              <p className="text-[15px] leading-[1.62] text-white/72">
                {t('site.features.rulesBody')}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <Image
                src={`${FIGMA}/feature-rules.webp`}
                alt={t('site.features.rulesAlt')}
                width={792}
                height={514}
                sizes="396px"
                className="h-auto w-full"
              />
            </div>
          </div>
          <div className={`${card} lg:h-[321px]`}>
            <IconBox name="how-mic.svg" className="bg-blueSoft" />
            <h3 className={h3}>{t('site.features.voiceTitle')}</h3>
            <p className={body}>{t('site.features.voiceBody')}</p>
          </div>
          {/* Row 2: three cards. */}
          {small.map(([icon, title, text]) => (
            <div key={title} className={`${card} lg:h-[243px]`}>
              <IconBox name={icon} className="bg-blueSoft" />
              <h3 className={h3}>{t(title)}</h3>
              <p className={body}>{t(text)}</p>
            </div>
          ))}
          {/* Row 3: approved WhatsApp updates (2 columns) and Arabic and English. */}
          <div className="lp-updates-bg flex flex-col gap-8 rounded-24 p-8 md:flex-row md:items-center lg:col-span-2 lg:h-[294px]">
            <div className="flex flex-col gap-3.5 md:w-[300px] md:shrink-0">
              <IconBox name="feat-chat.svg" className="bg-white" />
              <h3 className={h3}>{t('site.features.updatesTitle')}</h3>
              <p className={body}>{t('site.features.updatesBody')}</p>
            </div>
            {/* Figma's approval mock; the export is padded 40 / 24 / 56 for its shadow. */}
            <div className="min-w-0 flex-1">
              <div className={APPROVAL_PAD}>
                <Image
                  src={`${FIGMA}/feature-approval.webp`}
                  alt={t('site.features.updatesAlt')}
                  width={936}
                  height={512}
                  sizes="468px"
                  className="h-auto w-full"
                />
              </div>
            </div>
          </div>
          <div className={`${card} lg:h-[294px]`}>
            <IconBox name="feat-globe.svg" className="bg-blueSoft" />
            <h3 className={h3}>{t('site.features.bilingualTitle')}</h3>
            <p className={body}>{t('site.features.bilingualBody')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Section 7, "Parents find teachers. Teachers find rooms." (Figma 68:624). */
export function Marketplace({ t }: { t: T }) {
  const roles = [
    [
      'mkt-users.svg',
      'site.market.parentsLabel',
      'site.market.parentsTitle',
      'site.market.parentsBody',
    ],
    [
      'mkt-star.svg',
      'site.market.teachersLabel',
      'site.market.teachersTitle',
      'site.market.teachersBody',
    ],
    [
      'mkt-door.svg',
      'site.market.centresLabel',
      'site.market.centresTitle',
      'site.market.centresBody',
    ],
  ] as const;
  const pays = ['site.market.payCards', 'site.market.payFawry', 'site.market.payWallets'] as const;
  return (
    <section
      id="marketplace"
      aria-labelledby="market-title"
      className={`site-lazy scroll-mt-4 bg-bg ${pad}`}
    >
      <div className={`${wrap} flex flex-col items-center gap-14`}>
        <Heading
          id="market-title"
          eyebrow={t('site.market.eyebrow')}
          title={t('site.market.title')}
          lead={t('site.market.lead')}
          titleClass="max-w-[760px]"
          leadClass="max-w-[700px]"
        />
        <div className="flex w-full flex-col items-center gap-10 lg:flex-row">
          <div className="w-full max-w-[640px] shrink-0 lg:w-[53.3%]">
            <Image
              src={`${FIGMA}/market-map.webp`}
              alt={t('site.market.mapAlt')}
              width={1280}
              height={1120}
              sizes="(min-width: 1024px) 640px, 100vw"
              className="h-auto w-full"
            />
          </div>
          <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
            {roles.map(([icon, label, title, text]) => (
              <div
                key={title}
                className="flex items-start gap-[18px] rounded-[20px] border border-border bg-white p-6 shadow-[0_10px_30px_rgba(10,24,36,0.05)]"
              >
                <IconBox name={icon} className="bg-blueSoft" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <p className="text-[11px] font-bold text-blueText">{t(label)}</p>
                  <h3 className="text-[18px] font-bold text-navy">{t(title)}</h3>
                  <p className="text-[14px] text-muted">{t(text)}</p>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] font-semibold text-muted">{t('site.market.payments')}</p>
              {pays.map((k) => (
                <span
                  key={k}
                  className="rounded-full border border-border bg-white px-[11px] py-[5px] text-[12px] font-semibold text-navy"
                >
                  {t(k)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Section 8, "AI that drafts. People who decide." (Figma 68:625, dark). */
export function TrustControl({ t }: { t: T }) {
  const flow = [
    ['trust-spark.svg', 'site.trust.draftTitle', 'site.trust.draftBody', false],
    ['trust-check.svg', 'site.trust.confirmTitle', 'site.trust.confirmBody', true],
    ['trust-shield.svg', 'site.trust.approveTitle', 'site.trust.approveBody', true],
    ['trust-chat.svg', 'site.trust.receiveTitle', 'site.trust.receiveBody', false],
  ] as const;
  const cards = [
    ['trust-lock.svg', 'site.trust.separateTitle', 'site.trust.separateBody'],
    ['trust-eye.svg', 'site.trust.loggedTitle', 'site.trust.loggedBody'],
    ['trust-bell.svg', 'site.trust.optInTitle', 'site.trust.optInBody'],
  ] as const;
  return (
    <section aria-labelledby="trust-title" className={`site-lazy lp-trust-bg ${pad}`}>
      <div className={`${wrap} flex flex-col items-center gap-14`}>
        <Heading
          id="trust-title"
          eyebrow={t('site.trust.eyebrow')}
          title={t('site.trust.title')}
          lead={t('site.trust.lead')}
          dark
          titleClass="max-w-[760px]"
          leadClass="max-w-[700px]"
        />
        <ol className="flex flex-col items-center lg:flex-row">
          {flow.map(([icon, title, text, human], i) => (
            <li key={title} className="flex flex-col items-center lg:flex-row">
              {i > 0 ? (
                <Decor
                  name="trust-connector.svg"
                  className="h-4 w-[70px] rotate-90 my-7 lg:my-0 lg:rotate-0 lg:rtl:-scale-x-100"
                />
              ) : null}
              <div
                className={`flex w-[220px] flex-col items-center gap-2.5 rounded-[20px] border px-5 py-[22px] text-center ${
                  human ? 'border-blue/60 bg-white/10' : 'border-white/14 bg-white/5'
                }`}
              >
                <IconBox
                  name={icon}
                  box={44}
                  icon={20}
                  radius={999}
                  className={human ? 'bg-blue' : 'bg-white/8'}
                />
                <h3 className="text-[16px] font-bold text-white">{t(title)}</h3>
                <p className="w-[180px] text-[13px] text-white/62">{t(text)}</p>
                {human ? (
                  <span className="rounded-full bg-blue/16 px-[9px] py-[3px] text-[11px] font-semibold text-[#7ee0ff]">
                    {t('site.trust.human')}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        <ul className="grid w-full gap-6 md:grid-cols-3">
          {cards.map(([icon, title, text]) => (
            <li
              key={title}
              className="flex items-start gap-4 rounded-[20px] border border-white/10 bg-white/4 p-6 md:min-h-[130px]"
            >
              <IconBox name={icon} box={40} icon={18} radius={12} className="bg-blue/14" />
              <div className="flex flex-1 flex-col gap-1.5">
                <h3 className="text-[16px] font-bold text-white">{t(title)}</h3>
                <p className="text-[14px] text-white/62">{t(text)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
