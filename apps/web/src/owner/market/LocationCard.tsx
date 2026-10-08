'use client';

import { useState, type MouseEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, marketApi, type CentreProfileEdit } from '@link/api-client';
import { Button, Card, Chip, Input } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { useCentre, useIsOwner } from '../common';

/** The drawn map spans about 1 km each way around the first pin (no map provider in the demo). */
const SPAN = 0.01;
const STEP = 0.0005;
const NUDGES = [
  ['north', 1, 0],
  ['south', -1, 0],
  ['east', 0, 1],
  ['west', 0, -1],
] as const;

/**
 * C02 · Location & hours (CF-44, decided 2026-10-08): the owner can move the map pin; the centre
 * then shows "Location under review" — here and on P04 — until Link ops verify it.
 */
export function LocationCard({ d }: { d: CentreProfileEdit }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const owner = useIsOwner();
  const { centreId } = useCentre();
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState({ lat: d.location.lat, lng: d.location.lng });
  const [address, setAddress] = useState(d.location.address);
  const [error, setError] = useState<string | null>(null);
  // The map's frame stays where the pin was when editing started.
  const [origin] = useState({ lat: d.location.lat, lng: d.location.lng });
  const save = useMutation({
    mutationFn: () => marketApi.moveCentrePin(centreId, { ...pin, address }),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      void qc.invalidateQueries({ queryKey: ['centre-profile', centreId] });
    },
    onError: (e) =>
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : t('states.error.body')),
  });
  const shown = editing ? pin : { lat: d.location.lat, lng: d.location.lng };
  // Pin position in the frame, as a percentage (start = west, so the map mirrors in RTL like Figma).
  const x = Math.min(95, Math.max(5, 50 + ((shown.lng - origin.lng) / SPAN) * 50));
  const y = Math.min(95, Math.max(5, 50 - ((shown.lat - origin.lat) / SPAN) * 50));
  const place = (e: MouseEvent<HTMLDivElement>) => {
    if (!editing) return;
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    const east = document.documentElement.dir === 'rtl' ? 1 - fx : fx;
    setPin({
      lat: origin.lat + (0.5 - fy) * 2 * SPAN,
      lng: origin.lng + (east - 0.5) * 2 * SPAN,
    });
  };

  return (
    <Card className="flex flex-col gap-4" data-testid="location-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-heading text-navy">{t('centre.profile.location')}</h2>
        {d.location.underReview ? (
          <span data-testid="location-under-review">
            <Chip tone="warning">{t('centre.location.underReview')}</Chip>
          </span>
        ) : null}
        {owner && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-11 items-center text-label text-blueText"
            data-testid="edit-pin"
          >
            {t('centre.location.editPin')}
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-5">
        <div
          onClick={place}
          aria-hidden
          className={`relative h-40 w-full max-w-80 overflow-hidden rounded-12 bg-soft ${editing ? 'cursor-crosshair ring-2 ring-blue' : ''}`}
          data-testid="location-map"
        >
          <span className="absolute inset-y-0 start-1/3 w-2 bg-white" />
          <span className="absolute inset-x-0 top-1/2 h-2 bg-white" />
          <span className="absolute inset-y-0 end-12 w-10 -skew-x-12 bg-blueSoft" />
          <span
            className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue shadow-card rtl:translate-x-1/2"
            style={{ insetInlineStart: `${x}%`, top: `${y}%` }}
          />
        </div>
        {editing ? (
          <div className="flex min-w-60 flex-1 flex-col gap-3">
            <p className="text-caption text-muted">{t('centre.location.howTo')}</p>
            <div
              role="group"
              aria-label={t('centre.location.move')}
              className="flex flex-wrap gap-2"
            >
              {NUDGES.map(([dir, dLat, dLng]) => (
                <Button
                  key={dir}
                  variant="secondary"
                  onClick={() =>
                    setPin((p) => ({ lat: p.lat + dLat * STEP, lng: p.lng + dLng * STEP }))
                  }
                  data-testid={`nudge-${dir}`}
                >
                  {t(`centre.location.${dir}`)}
                </Button>
              ))}
            </div>
            <Input
              label={t('centre.location.address')}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              data-testid="location-address"
            />
            <p className="text-caption text-muted">{t('centre.location.reviewNote')}</p>
            {error ? (
              <p role="alert" className="text-caption text-red">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending}
                data-testid="save-pin"
              >
                {t('centre.location.save')}
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  setEditing(false);
                  setPin({ lat: d.location.lat, lng: d.location.lng });
                  setAddress(d.location.address);
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="text-label text-navy" data-testid="profile-address">
              {d.location.address}
            </p>
            <p className="text-caption text-muted">{d.hours}</p>
            {d.location.underReview ? (
              <p className="text-caption text-amber">{t('centre.location.reviewNote')}</p>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}
