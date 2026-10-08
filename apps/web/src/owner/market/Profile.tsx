'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, marketApi, type CentreProfileEdit, type Hall } from '@link/api-client';
import { Button, Callout, Card, Chip, Switch, Textarea, useToast } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { QueryState } from '../../parent/QueryState';
import { OwnerPageHeader, num, useCentre, useIsOwner } from '../common';
import { facilityLabel, ruleText } from './shared';

/** The photo tiles are sample gradients in the demo (no uploads, no real photos). */
const PHOTO_TONES = [
  'from-blue to-navy',
  'from-green to-navy',
  'from-[#7c4dcc] to-navy',
  'from-amber to-navy',
];
const MAX_PHOTOS = 12;

/**
 * C02 · Public profile editor (MKT-CEN-02): what parents and teachers see on the Link map. The
 * owner edits photos, the about text and which rooms are listed; badges are earned from Link's data
 * and can't be typed in (BR-TRUST). Rent and capacity are edited on Rooms & rent (C05).
 */
export function PublicProfile() {
  const { locale, t } = useI18n();
  const { centreId, base } = useCentre();
  const q = useQuery({
    queryKey: ['centre-profile', centreId, locale],
    queryFn: () => marketApi.centreProfile(centreId),
  });
  return (
    <QueryState query={q} loadingRows={4}>
      {(d) => (
        <>
          <OwnerPageHeader
            title={t('centre.profile.title')}
            subtitle={t('centre.profile.subtitle')}
            actions={
              <Link
                href={`/${locale}/centres/${d.slug}`}
                data-testid="view-as-parent"
                className="inline-flex min-h-11 items-center rounded-12 border border-border bg-white px-5 text-label text-navy"
              >
                {t('centre.profile.viewAsParent')}
              </Link>
            }
          />
          <div className="flex flex-wrap items-center gap-3">
            {d.liveOnMap ? (
              <Chip tone="success">{t('centre.profile.live')}</Chip>
            ) : (
              <Chip tone="warning">{t('centre.profile.notLive')}</Chip>
            )}
            {d.verified ? <Chip tone="info">{t('centre.profile.verified')}</Chip> : null}
            <span className="flex items-center gap-2 text-caption text-muted">
              {t('centre.profile.complete', { pct: num(d.completeness, locale) })}
              <span
                role="progressbar"
                aria-valuenow={d.completeness}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('centre.profile.completeLabel')}
                className="h-1.5 w-32 overflow-hidden rounded-full bg-border"
                data-testid="completeness"
              >
                <span className="block h-full bg-green" style={{ width: `${d.completeness}%` }} />
              </span>
            </span>
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_300px]">
            <div className="flex flex-col gap-6">
              <PhotosAbout d={d} />
              <RoomsTable halls={d.halls} roomsHref={`${base}/rooms`} />
              <Card className="flex flex-col gap-4">
                <h2 className="text-heading text-navy">{t('centre.profile.location')}</h2>
                <div className="flex flex-wrap gap-5">
                  <div
                    aria-hidden
                    className="relative h-28 w-full max-w-64 overflow-hidden rounded-12 bg-soft"
                  >
                    <span className="absolute inset-y-0 start-1/3 w-2 bg-white" />
                    <span className="absolute inset-x-0 top-1/2 h-2 bg-white" />
                    <span className="absolute inset-y-0 end-12 w-10 -skew-x-12 bg-blueSoft" />
                    <span className="absolute start-1/3 top-1/2 size-3.5 -translate-y-1/4 rounded-full border-2 border-white bg-blue" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-label text-navy" data-testid="profile-address">
                      {d.address}
                    </p>
                    <p className="text-caption text-muted">{d.hours}</p>
                    <p className="text-caption text-muted">{t('centre.profile.pinNote')}</p>
                  </div>
                </div>
              </Card>
            </div>
            <div className="flex flex-col gap-4">
              <p className="text-caption uppercase text-muted">{t('centre.profile.preview')}</p>
              <Card padding="none" className="overflow-hidden" data-testid="profile-preview">
                <div className={`h-24 bg-gradient-to-br ${PHOTO_TONES[0]}`} />
                <div className="flex flex-col gap-2 p-4">
                  <h2 className="text-heading text-navy">{d.name}</h2>
                  <p className="text-caption text-amber">
                    ★ {num(d.rating.avg, locale)} •{' '}
                    {t('centre.profile.verifiedReviews', {
                      count: d.rating.count,
                      n: num(d.rating.count, locale),
                    })}
                  </p>
                  <p className="text-caption text-muted">
                    {t('centre.profile.previewLine', {
                      area: d.area,
                      km: num(d.distanceKm, locale),
                      teachers: d.teachers,
                      t: num(d.teachers, locale),
                      rooms: d.halls.filter((h) => h.listed).length,
                      r: num(d.halls.filter((h) => h.listed).length, locale),
                    })}
                  </p>
                  {d.badges.includes('progress_updates') ? (
                    <Chip tone="success" className="self-start">
                      {t('centre.profile.badgeProgress')}
                    </Chip>
                  ) : null}
                  <span className="mt-1 inline-flex min-h-11 items-center justify-center rounded-12 bg-blue text-label text-navy">
                    {t('centre.profile.seeTeachers')}
                  </span>
                </div>
              </Card>
              <div className="flex flex-col gap-1 rounded-16 bg-blueSoft p-4">
                <h2 className="text-label text-blueText">{t('centre.profile.trustTitle')}</h2>
                <p className="text-caption text-blueText">{t('centre.profile.trustBody')}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </QueryState>
  );
}

function PhotosAbout({ d }: { d: CentreProfileEdit }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const { centreId } = useCentre();
  const [about, setAbout] = useState(d.about);
  const owner = useIsOwner();
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: { about?: string; photos?: number }) =>
      marketApi.updateCentreProfile(centreId, body),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['centre-profile', centreId] });
      toast(t('centre.profile.saved'));
    },
    onError: (e) =>
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : t('states.error.title')),
  });
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-heading text-navy">{t('centre.profile.photosAbout')}</h2>
      <ul className="flex flex-wrap gap-3" aria-label={t('centre.profile.photos')}>
        {Array.from({ length: d.photos }, (_, i) => (
          <li
            key={i}
            data-testid="profile-photo"
            className={`h-20 w-28 rounded-12 bg-gradient-to-br ${PHOTO_TONES[i % PHOTO_TONES.length]}`}
          >
            <span className="sr-only">{t('centre.profile.photoN', { n: i + 1 })}</span>
          </li>
        ))}
        {owner && d.photos < MAX_PHOTOS ? (
          <li>
            <button
              type="button"
              data-testid="add-photo"
              onClick={() => save.mutate({ photos: d.photos + 1 })}
              disabled={save.isPending}
              className="flex h-20 w-28 items-center justify-center rounded-12 border-2 border-dashed border-blue/60 text-caption text-blueText"
            >
              {t('centre.profile.addPhoto')}
            </button>
          </li>
        ) : null}
      </ul>
      <Textarea
        label={t('centre.profile.about')}
        value={about}
        onChange={(e) => setAbout(e.target.value)}
        readOnly={!owner}
        maxLength={600}
        counter={(n, max) => t('common.counter', { n, max })}
        rows={3}
      />
      {!owner ? (
        <Callout tone="info" data-testid="owner-only">
          {t('centre.ownerOnly.edit')}
        </Callout>
      ) : null}
      <div className={owner ? 'flex items-center gap-3' : 'hidden'}>
        <Button
          variant="secondary"
          onClick={() => save.mutate({ about })}
          disabled={save.isPending || about === d.about}
          data-testid="save-about"
        >
          {t('centre.profile.saveAbout')}
        </Button>
        <p className="text-caption text-muted">{t('centre.profile.goLive')}</p>
      </div>
      {error ? (
        <p role="alert" className="text-caption text-red">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

function RoomsTable({ halls, roomsHref }: { halls: Hall[]; roomsHref: string }) {
  const { locale, t } = useI18n();
  const qc = useQueryClient();
  const { centreId } = useCentre();
  const owner = useIsOwner();
  const list = useMutation({
    mutationFn: ({ id, listed }: { id: string; listed: boolean }) =>
      marketApi.updateHall(id, { listed }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['centre-profile', centreId] });
      void qc.invalidateQueries({ queryKey: ['halls', centreId] });
      void qc.invalidateQueries({ queryKey: ['schedule', centreId] });
    },
  });
  return (
    <Card padding="none" className="overflow-x-auto">
      <div className="flex items-center justify-between gap-3 p-5">
        <h2 className="text-heading text-navy">{t('centre.profile.rooms')}</h2>
        <Link
          href={roomsHref}
          className="inline-flex min-h-11 items-center text-label text-blueText"
        >
          {t('centre.profile.editRooms')}
        </Link>
      </div>
      <table className="w-full min-w-[720px] text-caption">
        <thead className="bg-soft text-muted">
          <tr>
            {(['room', 'capacity', 'facilities', 'rent', 'free', 'listed'] as const).map((c) => (
              <th key={c} scope="col" className="px-4 py-2 text-start font-semibold">
                {t(`centre.profile.col.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {halls.map((h) => (
            <tr key={h.id} className="border-b border-border" data-testid={`profile-hall-${h.id}`}>
              <th scope="row" className="px-4 py-3 text-start text-label text-navy">
                {h.name}
              </th>
              <td className="px-4 py-3 text-navy">
                {t('centre.schedule.seats', { count: h.capacity, n: num(h.capacity, locale) })}
              </td>
              <td className="px-4 py-3 text-navy">
                {h.facilities.map((f) => facilityLabel(f, t)).join(' • ')}
              </td>
              <td className="px-4 py-3 font-semibold text-blueText">
                {ruleText(h.rentRule, t, locale)}
              </td>
              <td className="px-4 py-3 text-green">
                {t('centre.rooms.freeSlots', {
                  count: h.freeSlotsPerWeek,
                  n: num(h.freeSlotsPerWeek, locale),
                })}
              </td>
              <td className="px-4 py-1">
                <Switch
                  checked={h.listed}
                  onCheckedChange={(listed) => list.mutate({ id: h.id, listed })}
                  label={t('centre.profile.listedLabel', { name: h.name })}
                  disabled={list.isPending || !owner}
                  testId={`listed-${h.id}`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-5 text-caption text-muted">{t('centre.profile.rentNote')}</p>
    </Card>
  );
}
