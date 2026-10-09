'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useCurricula,
  useMe,
  useSearchCentres,
  useSubjects,
  type SearchQuery,
} from '@link/api-client';
import { formatKm, formatMoney, formatNumber } from '@link/i18n';
import {
  Button,
  EmptyState,
  FilterChip,
  MapView,
  PageTitle,
  Rating,
  RadioCards,
  Segmented,
  Select,
  Sheet,
  StatusBadge,
} from '@link/ui';
import { useI18n } from '../../i18n-client';
import { QueryState } from '../QueryState';
import { CentreCover } from '../CentreCover';
import { money, seatStateTone } from '../format';
import { forgetLocation, shareLocation, useNearPoint } from '../near';
import { useSession } from '../../session';

const MAADI = { lat: 29.9602 - 0.004, lng: 31.2569 + 0.002 }; // the parent's chosen area (fixture)
const DISTANCES = [2, 5, 10];
const FEES = [12000, 15000, 20000];

/** P03 · Map & results (MKT-DSC-02, MKT-DSC-03). Filters live in the URL so results can be shared. */
export function P03Results() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const curricula = useCurricula();
  const subjects = useSubjects();
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'distance' | 'curriculum' | 'fee'>(null);

  const get = (k: string) => sp.get(k) ?? undefined;
  const query: SearchQuery = {
    subjectId: get('subjectId'),
    curriculumId: get('curriculumId'),
    schoolYearId: get('schoolYearId'),
    radiusKm: Number(get('radiusKm') ?? 5), // default ≤ 5 km
    minRating: get('minRating') ? Number(get('minRating')) : undefined,
    maxFeePt: get('maxFeePt') ? Number(get('maxFeePt')) : undefined,
    seatsOpen: get('seatsOpen') === 'true' || undefined,
    verifiedOnly: get('verifiedOnly') === 'true' || undefined,
    sort: (get('sort') as SearchQuery['sort']) ?? 'best_match',
    q: get('q'),
  };
  const near = useNearPoint();
  const [locationNote, setLocationNote] = useState<null | 'denied' | 'unavailable'>(null);
  const { session } = useSession();
  const me = useMe({ enabled: !!session });
  const view = get('view') ?? 'map';
  const res = useSearchCentres(near ? { ...query, ...near } : query);
  const area = near ? t('parent.results.nearYou') : (me.data?.homeArea ?? t('parent.search.area'));

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  const subject = subjects.data?.find((s) => s.id === query.subjectId);
  const cur = curricula.data?.find((c) => c.id === query.curriculumId);
  const year = cur?.schoolYears.find((y) => y.id === query.schoolYearId);
  const title =
    [subject?.name, cur?.name, year?.shortName].filter(Boolean).join(' • ') ||
    t('parent.results.titleAll');

  return (
    <>
      <PageTitle
        context={area}
        title={title}
        subtitle={
          res.data
            ? t('parent.results.totals', {
                centres: res.data.totals.centres,
                teachers: res.data.totals.teachers,
                subject: subject?.name ?? '',
                km: formatNumber(query.radiusKm!, locale),
              })
            : ' '
        }
      />

      <div
        role="group"
        aria-label={t('parent.results.filters')}
        className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]"
      >
        <FilterChip
          pressed={!!near}
          onPressedChange={async (on) => {
            setLocationNote(null);
            if (!on) return forgetLocation();
            const r = await shareLocation();
            if (r !== 'ok') setLocationNote(r);
          }}
        >
          {t(near ? 'parent.results.usingMyLocation' : 'parent.results.useMyLocation')}
        </FilterChip>
        <FilterChip pressed onPressedChange={() => setSheet('distance')} aria-haspopup="dialog">
          {t('parent.results.within', { km: formatNumber(query.radiusKm!, locale) })}
        </FilterChip>
        <FilterChip
          pressed={query.minRating === 4}
          onPressedChange={(p) => set({ minRating: p ? '4' : null })}
        >
          {t('parent.results.fourPlus')}
        </FilterChip>
        <FilterChip
          pressed={!!query.curriculumId}
          onPressedChange={() => setSheet('curriculum')}
          aria-haspopup="dialog"
        >
          {cur?.name ?? t('parent.results.curriculum')} <span aria-hidden>▾</span>
        </FilterChip>
        <FilterChip
          pressed={!!query.maxFeePt}
          onPressedChange={() => setSheet('fee')}
          aria-haspopup="dialog"
        >
          {query.maxFeePt
            ? t('parent.results.feeUpTo', { fee: formatMoney(query.maxFeePt, locale) })
            : t('parent.results.fee')}{' '}
          <span aria-hidden>▾</span>
        </FilterChip>
        <FilterChip
          pressed={!!query.seatsOpen}
          onPressedChange={(p) => set({ seatsOpen: p ? 'true' : null })}
        >
          {t('parent.results.seatsOpen')}
        </FilterChip>
        <FilterChip
          pressed={!!query.verifiedOnly}
          onPressedChange={(p) => set({ verifiedOnly: p ? 'true' : null })}
        >
          {t('parent.results.verified')}
        </FilterChip>
      </div>
      {locationNote ? (
        <p role="status" className="text-caption text-muted">
          {t('parent.results.locationOff')}
        </p>
      ) : null}

      <QueryState
        query={res}
        loadingRows={3}
        isEmpty={(d) => d.data.length === 0}
        empty={
          <EmptyState
            title={t('parent.results.emptyTitle')}
            body={t('parent.results.emptyBody')}
            action={
              <Button
                variant="secondary"
                onClick={() =>
                  set({ radiusKm: '10', minRating: null, seatsOpen: null, maxFeePt: null })
                }
              >
                {t('parent.results.clear')}
              </Button>
            }
          />
        }
      >
        {(d) => (
          <>
            {view === 'map' ? (
              <MapView
                label={t('parent.results.mapLabel', { count: d.data.length })}
                centre={MAADI}
                pins={d.data.map((c) => ({
                  id: c.id,
                  lat: c.lat,
                  lng: c.lng,
                  state: c.seatState,
                  selected: selected === c.id,
                  onSelect: () => setSelected(c.id),
                  label:
                    c.seatState === 'waitlist'
                      ? t('parent.results.pinWaitlist')
                      : selected === c.id
                        ? `${c.name} • ${t('parent.results.teachersCount', { count: c.teacherCount })}`
                        : t('parent.results.teachersCount', { count: c.teacherCount }),
                }))}
              />
            ) : null}

            <div className="flex items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-1 text-caption text-muted">
                <span className="sr-only">{t('parent.results.sortLabel')}</span>
                <select
                  value={query.sort}
                  onChange={(e) => set({ sort: e.target.value })}
                  className="min-h-11 cursor-pointer bg-transparent text-caption text-muted outline-none"
                >
                  {(['best_match', 'distance', 'rating', 'fee'] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`parent.results.sort.${s}`)}
                    </option>
                  ))}
                </select>
              </label>
              <Segmented
                label={t('parent.results.viewLabel')}
                value={view}
                onValueChange={(v) => set({ view: v })}
                options={[
                  { value: 'map', label: t('parent.results.map') },
                  { value: 'list', label: t('parent.results.list') },
                ]}
              />
            </div>

            <ul className="flex flex-col gap-3">
              {d.data.map((c, i) => (
                <li key={c.id}>
                  <Link
                    href={`/${locale}/centres/${c.slug}?${new URLSearchParams({ ...(query.schoolYearId ? { schoolYearId: query.schoolYearId } : {}), ...(query.subjectId ? { subjectId: query.subjectId } : {}) })}`}
                    onFocus={() => setSelected(c.id)}
                    className={`flex items-start gap-3 rounded-16 border bg-white p-3 shadow-card ${selected === c.id ? 'border-blue ring-1 ring-blue' : 'border-border'}`}
                  >
                    <CentreCover index={i} className="size-18 shrink-0 rounded-12" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-start gap-2">
                        <h2 className="min-w-0 flex-1 text-label text-navy">
                          <bdi>{c.name}</bdi>
                        </h2>
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
                        {t('parent.km', { km: formatKm(c.distanceKm ?? 0, locale) })} •{' '}
                        {t('parent.verifiedReviews', { count: c.rating?.count ?? 0 })} •{' '}
                        {t('parent.results.subjectTeachers', {
                          count: c.teacherCount,
                          subject: subject?.name ?? '',
                        })}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 text-label text-blueText">
                          {t('parent.results.from', { fee: money(c.fromSessionFee, locale) })}
                        </span>
                        <StatusBadge tone={seatStateTone[c.seatState]}>
                          {c.seatState === 'open'
                            ? t('parent.results.seatsOpen')
                            : t('parent.results.pinWaitlist')}
                        </StatusBadge>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </QueryState>

      <Sheet
        open={sheet === 'distance'}
        onOpenChange={(o) => !o && setSheet(null)}
        title={t('parent.results.distance')}
        closeLabel={t('common.close')}
      >
        <RadioCards
          label={t('parent.results.distance')}
          value={String(query.radiusKm)}
          onValueChange={(v) => {
            set({ radiusKm: v });
            setSheet(null);
          }}
          options={DISTANCES.map((km) => ({
            value: String(km),
            title: t('parent.results.within', { km: formatNumber(km, locale) }),
          }))}
        />
      </Sheet>
      <Sheet
        open={sheet === 'curriculum'}
        onOpenChange={(o) => !o && setSheet(null)}
        title={t('parent.results.curriculum')}
        closeLabel={t('common.close')}
      >
        <Select
          label={t('parent.child.curriculum')}
          value={query.curriculumId ?? ''}
          placeholder={t('parent.child.choose')}
          onChange={(e) => set({ curriculumId: e.target.value, schoolYearId: null })}
          options={(curricula.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          label={t('parent.child.year')}
          value={query.schoolYearId ?? ''}
          placeholder={t('parent.child.choose')}
          disabled={!query.curriculumId}
          onChange={(e) => {
            set({ schoolYearId: e.target.value });
            setSheet(null);
          }}
          options={(cur?.schoolYears ?? []).map((y) => ({ value: y.id, label: y.name }))}
        />
      </Sheet>
      <Sheet
        open={sheet === 'fee'}
        onOpenChange={(o) => !o && setSheet(null)}
        title={t('parent.results.fee')}
        closeLabel={t('common.close')}
      >
        <RadioCards
          label={t('parent.results.fee')}
          value={String(query.maxFeePt ?? 'any')}
          onValueChange={(v) => {
            set({ maxFeePt: v === 'any' ? null : v });
            setSheet(null);
          }}
          options={[
            { value: 'any', title: t('parent.results.feeAny') },
            ...FEES.map((f) => ({
              value: String(f),
              title: t('parent.results.feeUpTo', { fee: formatMoney(f, locale) }),
            })),
          ]}
        />
      </Sheet>
    </>
  );
}
