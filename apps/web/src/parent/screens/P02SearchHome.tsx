'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCurricula,
  useDefaultSubjectId,
  useMe,
  useSearchCentres,
  useSearchTeachers,
  useSubjects,
  type SearchQuery,
} from '@link/api-client';
import { formatKm, formatNumber } from '@link/i18n';
import {
  Avatar,
  Button,
  Callout,
  Card,
  Chip,
  EmptyState,
  FilterChip,
  PageTitle,
  Rating,
  SectionHeader,
  Select,
  Sheet,
} from '@link/ui';
import { useI18n } from '../../i18n-client';
import { ChildSheet } from '../ChildSheet';
import { QueryState } from '../QueryState';
import { useSelectedChild } from '../search-context';
import { money } from '../format';
import { CentreCover } from '../CentreCover';

const YEAR_KEY = 'link.search.year';

/** P02 · Search home (MKT-DSC-01, MKT-ACC-05). */
export function P02SearchHome() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const { child, children, setChildId, signedIn } = useSelectedChild();
  const me = useMe({ enabled: signedIn });
  const subjects = useSubjects();
  const defaultSubjectId = useDefaultSubjectId();
  const [picked, setSubjectId] = useState<string | null>(null);
  const subjectId = picked ?? defaultSubjectId ?? '';
  const [q, setQ] = useState('');
  const [childOpen, setChildOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [yearOpen, setYearOpen] = useState(false);
  const [visitorYear, setVisitorYear] = useState<{
    curriculumId: string;
    schoolYearId: string;
  } | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(YEAR_KEY);
      if (v) setVisitorYear(JSON.parse(v));
    } catch {
      /* ignore */
    }
  }, []);

  const scope = child
    ? { curriculumId: child.curriculum.id, schoolYearId: child.schoolYear.id }
    : (visitorYear ?? { curriculumId: undefined, schoolYearId: undefined });
  const query: SearchQuery = { ...scope, subjectId, radiusKm: 5 };
  const centres = useSearchCentres(query);
  const teachers = useSearchTeachers(query);
  const subjectName = subjects.data?.find((s) => s.id === subjectId)?.name ?? '';
  const resultsHref = (extra: Record<string, string> = {}) =>
    `/${locale}/search/results?${new URLSearchParams({
      subjectId,
      ...(scope.curriculumId ? { curriculumId: scope.curriculumId } : {}),
      ...(scope.schoolYearId ? { schoolYearId: scope.schoolYearId } : {}),
      ...(q ? { q } : {}),
      ...extra,
    })}`;

  const firstName = me.data?.name?.split(' ')[0];

  return (
    <>
      <PageTitle
        context={t('parent.search.area')}
        title={
          signedIn && firstName
            ? t('parent.search.hi', { name: firstName })
            : t('parent.search.titleVisitor')
        }
        subtitle={
          child
            ? t('parent.search.needHelpWith', { name: child.displayName.split(' ')[0] ?? '' })
            : t('parent.search.needHelpGeneric')
        }
      />

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(resultsHref());
        }}
        className="flex items-center gap-3 rounded-12 border border-border bg-white px-4 py-2 shadow-card"
      >
        <span aria-hidden className="size-3.5 shrink-0 rounded-full border-2 border-muted" />
        <label htmlFor="q" className="sr-only">
          {t('parent.search.placeholder')}
        </label>
        <input
          id="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('parent.search.placeholder')}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-body text-navy outline-none placeholder:text-muted"
        />
        <Link
          href={resultsHref()}
          className="inline-flex min-h-9 items-center rounded-8 bg-navy px-3 text-caption text-white"
        >
          {t('parent.search.filters')}
        </Link>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-muted">{t('parent.search.for')}</span>
        {child ? (
          <button
            type="button"
            onClick={() => setChildOpen(true)}
            className="inline-flex min-h-11 items-center"
          >
            <Chip tone="info">
              <bdi>{child.displayName.split(' ')[0]}</bdi> • {child.curriculum.name} •{' '}
              {child.schoolYear.name}
            </Chip>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setYearOpen(true)}
            className="inline-flex min-h-11 items-center"
          >
            <Chip tone={visitorYear ? 'info' : 'neutral'}>{t('parent.search.chooseYear')}</Chip>
          </button>
        )}
        {signedIn ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex min-h-11 items-center"
          >
            <Chip>+ {t('parent.child.add')}</Chip>
          </button>
        ) : null}
      </div>

      <div role="group" aria-label={t('parent.search.subjects')} className="flex flex-wrap gap-2">
        {(subjects.data ?? []).map((s) => (
          <FilterChip
            key={s.id}
            variant="solid"
            pressed={s.id === subjectId}
            onPressedChange={() => setSubjectId(s.id)}
          >
            {s.name}
          </FilterChip>
        ))}
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="centres-h">
        <SectionHeader
          title={
            <span id="centres-h">{t('parent.search.centresNear', { subject: subjectName })}</span>
          }
          action={
            <Link
              href={resultsHref()}
              className="inline-flex min-h-11 items-center text-label text-blueText"
            >
              {t('parent.search.map')}{' '}
              <span aria-hidden className="ms-1 rtl:-scale-x-100">
                ›
              </span>
            </Link>
          }
        />
        <QueryState
          query={centres}
          loadingRows={1}
          isEmpty={(d) => d.data.length === 0}
          empty={
            <EmptyState
              title={t('parent.search.emptyTitle', { subject: subjectName })}
              body={t('parent.search.emptyBody')}
              action={
                <Link href={resultsHref({ radiusKm: '10' })} className="text-label text-blueText">
                  {t('parent.search.widen')}
                </Link>
              }
            />
          }
        >
          {(d) => (
            <ul
              className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none]"
              aria-label={t('parent.search.centresNear', { subject: subjectName })}
            >
              {d.data.map((c, i) => (
                <li key={c.id} className="w-60 shrink-0 snap-start">
                  <Link
                    href={`/${locale}/centres/${c.slug}`}
                    className="block overflow-hidden rounded-16 border border-border bg-white shadow-card"
                  >
                    <CentreCover index={i} className="h-24" />
                    <div className="flex flex-col gap-1 p-3">
                      <div className="flex items-start gap-2">
                        <h3 className="min-w-0 flex-1 text-label text-navy">
                          <bdi>{c.name}</bdi>
                        </h3>
                        {c.rating ? (
                          <Rating
                            value={formatNumber(Number(c.rating.avg), locale)}
                            label={t('parent.rating.label', {
                              avg: formatNumber(Number(c.rating.avg), locale),
                              count: c.rating.count,
                            })}
                          />
                        ) : null}
                      </div>
                      <p className="text-caption text-muted">
                        {c.area} • {t('parent.km', { km: formatKm(c.distanceKm ?? 0, locale) })} •{' '}
                        {t('parent.verifiedReviews', { count: c.rating?.count ?? 0 })}
                      </p>
                      <p className="text-label text-blueText">
                        {t('parent.search.teachersFrom', {
                          count: c.teacherCount,
                          subject: subjectName,
                          fee: money(c.fromSessionFee, locale),
                        })}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="teachers-h">
        <SectionHeader
          title={
            <span id="teachers-h">{t('parent.search.topTeachers', { subject: subjectName })}</span>
          }
          action={
            <Link
              href={resultsHref({ view: 'list' })}
              className="inline-flex min-h-11 items-center text-label text-blueText"
            >
              {t('parent.search.seeAll')}
            </Link>
          }
        />
        <QueryState
          query={teachers}
          loadingRows={2}
          isEmpty={(d) => d.data.length === 0}
          empty={<EmptyState title={t('parent.search.noTeachers')} />}
        >
          {(d) => (
            <Card padding="none" className="py-1">
              <ul>
                {d.data.slice(0, 3).map((tc) => (
                  <li key={tc.id}>
                    <Link
                      href={`/${locale}/teachers/${tc.slug}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-soft"
                    >
                      <Avatar name={tc.displayName} />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-label text-navy">
                          <bdi>{tc.displayName}</bdi>
                        </span>
                        <span className="text-caption text-muted">
                          {t('parent.search.teacherLine', {
                            fee: money(tc.fromSessionFee, locale),
                            centres: new Intl.ListFormat(locale === 'ar' ? 'ar-EG' : 'en', {
                              type: 'conjunction',
                            }).format(tc.centreNames),
                          })}
                        </span>
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
            </Card>
          )}
        </QueryState>
      </section>

      <Callout tone="info">{t('parent.search.ratingsNote')}</Callout>

      <ChildSheet
        open={childOpen}
        onOpenChange={setChildOpen}
        children={children}
        selectedId={child?.id ?? null}
        onSelect={setChildId}
      />
      <ChildSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        children={children}
        selectedId={child?.id ?? null}
        onSelect={setChildId}
        startWithAdd
      />
      <YearSheet
        open={yearOpen}
        onOpenChange={setYearOpen}
        value={visitorYear}
        onSave={(v) => {
          setVisitorYear(v);
          try {
            localStorage.setItem(YEAR_KEY, JSON.stringify(v));
          } catch {
            /* ignore */
          }
        }}
      />
    </>
  );
}

/** Signed-out visitors choose a curriculum and year without creating a child. */
function YearSheet({
  open,
  onOpenChange,
  value,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: { curriculumId: string; schoolYearId: string } | null;
  onSave: (v: { curriculumId: string; schoolYearId: string }) => void;
}) {
  const { t } = useI18n();
  const curricula = useCurricula();
  const [c, setC] = useState(value?.curriculumId ?? '');
  const [y, setY] = useState(value?.schoolYearId ?? '');
  const years = curricula.data?.find((x) => x.id === c)?.schoolYears ?? [];
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('parent.search.chooseYear')}
      closeLabel={t('common.close')}
    >
      <Select
        label={t('parent.child.curriculum')}
        value={c}
        placeholder={t('parent.child.choose')}
        onChange={(e) => {
          setC(e.target.value);
          setY('');
        }}
        options={(curricula.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
      />
      <Select
        label={t('parent.child.year')}
        value={y}
        placeholder={t('parent.child.choose')}
        disabled={!c}
        onChange={(e) => setY(e.target.value)}
        options={years.map((x) => ({ value: x.id, label: x.name }))}
      />
      <Button
        block
        disabled={!c || !y}
        onClick={() => {
          onSave({ curriculumId: c, schoolYearId: y });
          onOpenChange(false);
        }}
      >
        {t('common.apply')}
      </Button>
    </Sheet>
  );
}
