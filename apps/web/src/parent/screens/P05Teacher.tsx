'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTeacher } from '@link/api-client';
import { formatMoney, formatNumber, formatPercent } from '@link/i18n';
import { Avatar, Card, Chip, EmptyState, SectionHeader, StatTile, StatusBadge } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { useFlag } from '../../flags';
import { QueryState } from '../QueryState';
import { money, scheduleLabel, seatsInfo } from '../format';
import { BackLink, ReviewItem } from './P04Centre';

/**
 * P05 · Teacher profile (MKT-DSC-05, MKT-WEB-03). Fees are per group (06 groups.*_fee_pt), so the
 * page shows them per group; Figma's single fee "same at every centre" is CF-22.
 */
export function P05Teacher({ slug }: { slug: string }) {
  const { locale, t } = useI18n();
  const sp = useSearchParams();
  const from = sp.get('from');
  const q = useTeacher(slug);
  const showRecorded = useFlag('teacher.recorded_badge'); // Phase 2 badge

  return (
    <>
      <BackLink href={from ? `/${locale}/centres/${from}` : undefined} label={t('common.back')} />
      <QueryState query={q} loadingRows={4}>
        {(tc) => {
          const minSession = Math.min(...tc.groups.map((g) => g.sessionFee.amountPt));
          const minMonth = Math.min(...tc.groups.map((g) => g.monthlyFee.amountPt));
          return (
            <>
              <Card className="flex flex-col items-center gap-3 p-5 text-center">
                <Avatar name={tc.displayName} size="xl" />
                <h1 className="text-title text-navy">
                  <bdi>{tc.displayName}</bdi>
                </h1>
                <p className="text-caption text-muted">
                  {[
                    tc.subjects.map((s) => s.name).join(' • '),
                    new Intl.ListFormat(locale === 'ar' ? 'ar-EG' : 'en', {
                      type: 'conjunction',
                    }).format(tc.curricula.map((c) => c.name)),
                    tc.yearsExperience != null
                      ? t('parent.teacher.years', { count: tc.yearsExperience })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' • ')}
                </p>
                <div className="flex w-full gap-2">
                  {tc.rating ? (
                    <StatTile
                      tone="amber"
                      value={`★ ${formatNumber(Number(tc.rating.avg), locale)}`}
                      label={t('parent.reviewsCount', { count: tc.rating.count })}
                    />
                  ) : null}
                  <StatTile
                    value={formatNumber(tc.centreCount, locale)}
                    label={t('parent.teacher.centres', { count: tc.centreCount })}
                  />
                  {showRecorded && tc.recordedPct != null ? (
                    <StatTile
                      value={formatPercent(tc.recordedPct / 100, locale)}
                      label={t('parent.teacher.recorded')}
                    />
                  ) : null}
                </div>
              </Card>

              {tc.tagCounts.length ? (
                <section className="flex flex-col gap-2" aria-labelledby="mention">
                  <h2 id="mention" className="text-label text-navy">
                    {t('parent.teacher.mentions')}
                  </h2>
                  <ul className="flex flex-wrap gap-2">
                    {tc.tagCounts.map((x) => (
                      <li key={x.tag}>
                        <Chip tone="info">
                          {t(`parent.tag.${x.tag}`)}{' '}
                          <span className="text-muted">{formatNumber(x.count, locale)}</span>
                        </Chip>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <Card className="flex flex-col gap-2">
                <SectionHeader level={2} title={t('parent.teacher.aboutFees')} />
                {tc.bio ? (
                  <p className="text-body text-navy" dir="auto">
                    {tc.bio}
                  </p>
                ) : null}
                <div className="flex gap-3 rounded-12 bg-blueSoft px-3 py-3">
                  <div className="flex flex-1 flex-col">
                    <span className="text-heading text-blueText">
                      {t('parent.fromFee', { fee: formatMoney(minSession, locale) })}
                    </span>
                    <span className="text-caption text-muted">
                      {t('parent.teacher.perSession')}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col">
                    <span className="text-heading text-blueText">
                      {t('parent.fromFee', { fee: formatMoney(minMonth, locale) })}
                    </span>
                    <span className="text-caption text-muted">{t('parent.teacher.perMonth')}</span>
                  </div>
                </div>
                <p className="text-caption text-muted">{t('parent.teacher.feesPerGroup')}</p>
              </Card>

              <Card className="flex flex-col gap-2">
                <SectionHeader level={2} title={t('parent.teacher.teachesAt')} />
                {tc.groups.length ? (
                  <ul className="flex flex-col gap-2">
                    {tc.groups.map((g) => {
                      const seats = seatsInfo(g, t, locale);
                      return (
                        <li key={g.id}>
                          <Link
                            href={`/${locale}/teachers/${tc.slug}/reserve?group=${g.id}`}
                            className="flex items-center gap-3 rounded-12 bg-soft p-3 hover:bg-blueSoft"
                          >
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <span className="text-label text-navy">
                                <bdi>{g.centre.name}</bdi> • {g.centre.area} • {g.room.name}
                              </span>
                              <span className="text-caption text-muted">
                                {g.schoolYear.shortName} • {scheduleLabel(g, locale)}
                              </span>
                              <span className="text-caption text-navy">
                                {t('parent.perSession', { fee: money(g.sessionFee, locale) })} •{' '}
                                {t('parent.perMonth', { fee: money(g.monthlyFee, locale) })}
                              </span>
                              <StatusBadge tone={seats.tone} className="self-start">
                                {seats.label}
                              </StatusBadge>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <EmptyState title={t('parent.teacher.noGroups')} />
                )}
              </Card>

              <Card className="flex flex-col gap-3">
                <SectionHeader level={2} title={t('parent.teacher.reviews')} />
                {tc.reviews.length ? (
                  <ul className="flex flex-col gap-2">
                    {tc.reviews.map((r) => (
                      <ReviewItem key={r.id} r={r} />
                    ))}
                  </ul>
                ) : (
                  <EmptyState title={t('parent.centre.noReviews')} />
                )}
              </Card>

              <Link
                href={`/${locale}/teachers/${tc.slug}/reserve`}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-12 bg-blue px-5 text-label text-navy shadow-glow"
              >
                {t('parent.teacher.enrol', { name: tc.displayName })}
              </Link>
            </>
          );
        }}
      </QueryState>
    </>
  );
}
