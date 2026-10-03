'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useCentre,
  type CentreProfile,
  type GroupSummary,
  type PublicReview,
} from '@link/api-client';
import { formatClock, formatDate, formatKm, formatNumber, formatWeekday } from '@link/i18n';
import {
  Avatar,
  Button,
  Callout,
  Card,
  Chip,
  EmptyState,
  ProgressBar,
  Rating,
  SectionHeader,
  StatusBadge,
  Stars,
  Tabs,
} from '@link/ui';
import { useI18n } from '../../i18n-client';
import { QueryState } from '../QueryState';
import { CentreCover } from '../CentreCover';
import { money, scheduleLabel, seatsInfo } from '../format';
import { useSelectedChild } from '../search-context';

const sep = (locale: 'ar' | 'en') => (locale === 'ar' ? '، ' : ', ');

/** "Sat–Thu, 2–9 PM" when every open day has the same hours. */
function hoursLabel(c: CentreProfile, locale: 'ar' | 'en') {
  if (!c.hours.length) return '';
  const first = c.hours[0]!;
  const same = c.hours.every((h) => h.opens === first.opens && h.closes === first.closes);
  const days = `${formatWeekday(first.weekday, locale)}–${formatWeekday(c.hours[c.hours.length - 1]!.weekday, locale)}`;
  return same
    ? `${days}${sep(locale)}${formatClock(first.opens, locale)}–${formatClock(first.closes, locale)}`
    : days;
}

export function BackLink({ href, label }: { href?: string; label: string }) {
  const router = useRouter();
  const cls =
    'inline-flex min-h-11 items-center gap-1 self-start text-caption text-muted hover:text-navy';
  const inner = (
    <>
      <span aria-hidden className="rtl:-scale-x-100">
        ‹
      </span>
      {label}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={() => router.back()} className={cls}>
      {inner}
    </button>
  );
}

export function ReviewItem({ r }: { r: PublicReview }) {
  const { locale, t } = useI18n();
  return (
    <li className="flex flex-col gap-1 rounded-12 bg-soft p-3">
      <Stars value={r.stars} label={t('parent.review.stars', { count: r.stars })} />
      <p className="text-body text-navy" dir="auto">
        {r.body}
      </p>
      <p className="text-caption text-muted">
        {t('parent.review.byline', {
          year: r.schoolYearName,
          date: formatDate(r.publishedAt, locale, { month: 'short', year: 'numeric' }),
        })}
      </p>
      {r.reply ? (
        <p className="mt-1 rounded-8 bg-blueSoft px-3 py-2 text-caption text-blueText" dir="auto">
          {t('parent.review.reply', { name: r.reply.authorName })} “{r.reply.body}”
        </p>
      ) : null}
    </li>
  );
}

function GroupRow({ g }: { g: GroupSummary }) {
  const { locale, t } = useI18n();
  const seats = seatsInfo(g, t, locale);
  return (
    <li>
      <Link
        href={`/${locale}/teachers/${g.teacher.slug}/reserve?group=${g.id}&centre=${g.centre.slug}`}
        className="flex items-center gap-3 rounded-12 bg-soft p-3 hover:bg-blueSoft"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-label text-navy">
            <bdi>{g.teacher.displayName}</bdi>
            {g.teacher.rating ? ` • ★ ${formatNumber(Number(g.teacher.rating.avg), locale)}` : ''}
          </span>
          <span className="text-caption text-muted">
            {scheduleLabel(g, locale)} • {g.room.name}
          </span>
          <StatusBadge tone={seats.tone}>{seats.label}</StatusBadge>
        </div>
        <span className="text-label text-blueText">
          {t('parent.perSession', { fee: money(g.sessionFee, locale) })}
        </span>
      </Link>
    </li>
  );
}

/** P04 · Centre profile (MKT-DSC-04, MKT-WEB-02). Public page. */
export function P04Centre({ slug }: { slug: string }) {
  const { locale, t } = useI18n();
  const sp = useSearchParams();
  const { child } = useSelectedChild();
  const schoolYearId = sp.get('schoolYearId') ?? child?.schoolYear.id;
  const subjectId = sp.get('subjectId') ?? 'sub-math';
  const q = useCentre(slug, { schoolYearId, subjectId });
  const [tab, setTab] = useState('overview');

  return (
    <>
      <BackLink label={t('parent.centre.back')} />
      <QueryState query={q} loadingRows={4}>
        {(c) => {
          const subjectName = c.groupsForChild[0]?.subject.name ?? '';
          const teacherCount = new Set(c.groupsForChild.map((g) => g.teacher.id)).size;
          const totalReviews = c.ratingDistribution.reduce((a, b) => a + b.count, 0);
          return (
            <>
              <CentreCover index={0} className="h-36 overflow-hidden rounded-24">
                {c.verified ? (
                  <span className="absolute start-3 top-3 rounded-full bg-white">
                    <StatusBadge tone="success">{t('parent.centre.verified')}</StatusBadge>
                  </span>
                ) : null}
              </CentreCover>

              <div className="flex items-center gap-3">
                <Avatar name={c.name} tone="navy" size="lg" square />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <h1 className="text-title text-navy">
                    <bdi>{c.name}</bdi>
                  </h1>
                  <p className="text-caption text-muted">
                    {c.area}
                    {sep(locale)}
                    {c.governorate} • {t('parent.km', { km: formatKm(c.distanceKm ?? 0, locale) })}{' '}
                    • {hoursLabel(c, locale)}
                  </p>
                </div>
              </div>

              {c.rating ? (
                <Rating
                  value={formatNumber(Number(c.rating.avg), locale)}
                  count={`(${t('parent.verifiedReviews', { count: c.rating.count })})`}
                  label={t('parent.rating.label', {
                    avg: formatNumber(Number(c.rating.avg), locale),
                    count: c.rating.count,
                  })}
                />
              ) : (
                <p className="text-caption text-muted">{t('parent.centre.noReviews')}</p>
              )}

              <Tabs
                label={t('parent.centre.tabsLabel')}
                value={tab}
                onValueChange={setTab}
                items={[
                  {
                    value: 'overview',
                    label: t('parent.centre.tab.overview'),
                    content: (
                      <div className="flex flex-col gap-4">
                        <Card className="flex flex-col gap-3">
                          <SectionHeader level={3} title={t('parent.centre.subjects')} />
                          <ul className="flex flex-wrap gap-2">
                            {c.subjects.map((s) => (
                              <li key={`${s.subject.id}-${s.curriculum.id}`}>
                                <Chip>
                                  {s.subject.name} • {s.curriculum.name} {s.yearsLabel}
                                </Chip>
                              </li>
                            ))}
                          </ul>
                        </Card>

                        <Card className="flex flex-col gap-1">
                          <SectionHeader
                            level={3}
                            title={t('parent.centre.teachers')}
                            action={
                              <button
                                type="button"
                                onClick={() => setTab('teachers')}
                                className="min-h-11 text-caption text-blueText"
                              >
                                {t('parent.centre.seeAll', { count: c.teachers.length })}
                              </button>
                            }
                          />
                          <TeacherRows c={c} max={3} />
                        </Card>

                        <Card className="flex flex-col gap-2">
                          <SectionHeader
                            level={3}
                            title={
                              child
                                ? t('parent.centre.groupsFor', {
                                    subject: subjectName,
                                    year: child.schoolYear.name,
                                  })
                                : t('parent.centre.groupsHere', { subject: subjectName })
                            }
                          />
                          {c.groupsForChild.length ? (
                            <ul className="flex flex-col gap-2">
                              {c.groupsForChild.map((g) => (
                                <GroupRow key={g.id} g={g} />
                              ))}
                            </ul>
                          ) : (
                            <EmptyState title={t('parent.centre.noGroups')} />
                          )}
                          <p className="text-caption text-muted">{t('parent.centre.feesNote')}</p>
                        </Card>

                        <ReviewsSummary c={c} total={totalReviews} />
                      </div>
                    ),
                  },
                  {
                    value: 'teachers',
                    label: t('parent.centre.tab.teachers'),
                    content: (
                      <Card padding="none" className="px-4 py-1">
                        <TeacherRows c={c} />
                      </Card>
                    ),
                  },
                  {
                    value: 'timetable',
                    label: t('parent.centre.tab.timetable'),
                    content: c.groupsForChild.length ? (
                      <ul className="flex flex-col gap-2">
                        {c.groupsForChild.map((g) => (
                          <GroupRow key={g.id} g={g} />
                        ))}
                      </ul>
                    ) : (
                      <EmptyState title={t('parent.centre.noGroups')} />
                    ),
                  },
                  {
                    value: 'reviews',
                    label: t('parent.centre.tab.reviews'),
                    content: c.reviews.length ? (
                      <ul className="flex flex-col gap-2">
                        {c.reviews.map((r) => (
                          <ReviewItem key={r.id} r={r} />
                        ))}
                      </ul>
                    ) : (
                      <EmptyState title={t('parent.centre.noReviews')} />
                    ),
                  },
                ]}
              />

              <Callout tone="info">{t('parent.search.ratingsNote')}</Callout>

              {/* Sticky call to action (Figma "Sticky CTA"). */}
              <div className="sticky bottom-4 z-10 flex items-center gap-3 rounded-16 bg-navy py-3 pe-3 ps-4 shadow-raised">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-label text-white">
                    {t('parent.centre.ctaCount', { count: teacherCount, subject: subjectName })}
                  </span>
                  <span className="text-caption text-white/70">{t('parent.centre.feesSetBy')}</span>
                </div>
                <Button onClick={() => setTab('teachers')}>
                  {t('parent.centre.chooseTeacher')}
                </Button>
              </div>
            </>
          );
        }}
      </QueryState>
    </>
  );
}

function TeacherRows({ c, max }: { c: CentreProfile; max?: number }) {
  const { locale, t } = useI18n();
  return (
    <ul>
      {c.teachers.slice(0, max).map((tc, i) => (
        <li key={tc.id}>
          <Link
            href={`/${locale}/teachers/${tc.slug}?from=${c.slug}`}
            className="flex items-center gap-3 py-2"
          >
            <Avatar name={tc.displayName} size="sm" tone={i % 2 ? 'amber' : 'blue'} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-label text-navy">
                <bdi>{tc.displayName}</bdi>
              </span>
              <span className="text-caption text-muted">{tc.subjectLabel}</span>
            </div>
            {tc.rating ? (
              <Rating
                value={formatNumber(Number(tc.rating.avg), locale)}
                count={`(${formatNumber(tc.rating.count, locale)})`}
                label={t('parent.rating.label', {
                  avg: formatNumber(Number(tc.rating.avg), locale),
                  count: tc.rating.count,
                })}
              />
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ReviewsSummary({ c, total }: { c: CentreProfile; total: number }) {
  const { locale, t } = useI18n();
  if (!c.rating) return null;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center">
          <span className="text-title text-navy">{formatNumber(Number(c.rating.avg), locale)}</span>
          <span className="text-caption text-muted">
            {t('parent.reviewsCount', { count: c.rating.count })}
          </span>
        </div>
        <ul className="flex min-w-0 flex-1 flex-col gap-1">
          {c.ratingDistribution.map((d) => (
            <li key={d.stars} className="flex items-center gap-2">
              <span className="w-3 text-caption text-muted">{formatNumber(d.stars, locale)}</span>
              <ProgressBar
                value={d.count}
                max={total}
                label={t('parent.centre.distLabel', { stars: d.stars, count: d.count })}
              />
            </li>
          ))}
        </ul>
      </div>
      {c.reviews[0] ? (
        <ul>
          <ReviewItem r={c.reviews[0]} />
        </ul>
      ) : null}
    </Card>
  );
}
