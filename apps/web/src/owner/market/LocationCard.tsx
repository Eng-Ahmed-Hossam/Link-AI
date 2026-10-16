'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, marketApi, type CentreProfileEdit, type Place } from '@link/api-client';
import { Button, Card, Chip, Input, PinPicker } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { useCentre, useIsOwner } from '../common';

/** One nudge moves the pin about 50 m (keyboard alternative to dragging). */
const STEP = 0.0005;
const NUDGES = [
  ['north', 1, 0],
  ['south', -1, 0],
  ['east', 0, 1],
  ['west', 0, -1],
] as const;
/** Where a centre with no pin yet starts (Maadi, the sample district). */
const START = { lat: 29.9602, lng: 31.2569 };

type Fields = {
  address: string;
  governorate: string;
  area: string;
  street: string;
  landmark: string;
};

/**
 * C02 · Location (Part B; CF-44, decided 2026-10-08): the owner searches the address, drags the
 * pin to the exact door (or taps the map, or nudges it), may use the device location when they
 * ask, and fills the structured address. The new location waits for Link ops: parents keep the
 * approved one until then, and both are shown here side by side.
 */
export function LocationCard({ d }: { d: CentreProfileEdit }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const owner = useIsOwner();
  const { centreId } = useCentre();
  const live = d.location;
  const pending = live.pending;
  const base = pending ?? live;
  const hasPin = (p: { lat: number; lng: number }) => p.lat !== 0 || p.lng !== 0;
  const startPin = hasPin(base) ? { lat: base.lat, lng: base.lng } : START;

  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState(startPin);
  const [origin, setOrigin] = useState(startPin);
  const [f, setF] = useState<Fields>({
    address: base.address,
    governorate: base.governorate,
    area: base.area,
    street: base.street,
    landmark: base.landmark,
  });
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Fields) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const problemText = (e: unknown) =>
    e instanceof ApiError ? (e.problem.detail ?? e.message) : t('states.error.body');

  const save = useMutation({
    mutationFn: () => marketApi.moveCentrePin(centreId, { ...pin, ...f }),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      void qc.invalidateQueries({ queryKey: ['centre-profile', centreId] });
    },
    onError: (e) => setError(problemText(e)),
  });

  const search = useMutation({
    mutationFn: (text: string) => marketApi.searchPlaces(text),
    onSuccess: (r) => {
      setResults(r.items);
      setNote(r.items.length ? null : t('centre.location.searchNone'));
    },
    onError: () => {
      setResults(null);
      setNote(t('centre.location.searchDown'));
    },
  });

  /** A place from search or the device: move the pin there and fill the empty fields. */
  const goTo = (p: { lat: number; lng: number }, place?: Place | null) => {
    setPin({ lat: p.lat, lng: p.lng });
    setOrigin({ lat: p.lat, lng: p.lng });
    if (place)
      setF((x) => ({
        ...x,
        address: place.label || x.address,
        governorate: place.governorate || x.governorate,
        area: place.area || x.area,
        street: place.street || x.street,
      }));
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim().length >= 2) search.mutate(q.trim());
  };

  // "Use my current location": asked only when the owner taps it (never stored for parents).
  const useMine = () => {
    if (!navigator.geolocation) return setNote(t('centre.location.useMineDenied'));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        goTo(p);
        void marketApi
          .lookupPlace(p.lat, p.lng)
          .then((r) => r.place && goTo(p, r.place))
          .catch(() => undefined);
      },
      () => setNote(t('centre.location.useMineDenied')),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const cancel = () => {
    setEditing(false);
    setPin(startPin);
    setOrigin(startPin);
    setF({
      address: base.address,
      governorate: base.governorate,
      area: base.area,
      street: base.street,
      landmark: base.landmark,
    });
    setResults(null);
    setNote(null);
    setError(null);
  };

  const addressLines = (x: Fields) => (
    <>
      <p className="text-label text-navy">{x.address}</p>
      <p className="text-caption text-muted">
        {[x.street, x.area, x.governorate].filter(Boolean).join('، ')}
      </p>
      {x.landmark ? (
        <p className="text-caption text-muted">
          {t('centre.location.landmark')}: {x.landmark}
        </p>
      ) : null}
    </>
  );

  return (
    <Card className="flex flex-col gap-4" data-testid="location-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-heading text-navy">{t('centre.profile.location')}</h2>
        {live.underReview ? (
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

      {editing ? (
        <div className="flex flex-col gap-4">
          <p className="text-caption text-muted">{t('centre.location.howTo')}</p>
          <form onSubmit={onSearch} className="flex flex-wrap items-end gap-2" role="search">
            <div className="min-w-60 flex-1">
              <Input
                label={t('centre.location.searchLabel')}
                help={t('centre.location.searchHint')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                data-testid="location-search"
              />
            </div>
            <Button type="submit" disabled={search.isPending} data-testid="location-search-button">
              {t('centre.location.searchButton')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={useMine}
              data-testid="use-my-location"
            >
              {t('centre.location.useMine')}
            </Button>
          </form>
          {results?.length ? (
            <ul aria-label={t('centre.location.searchResults')} className="flex flex-col gap-1">
              {results.map((r) => (
                <li key={`${r.lat},${r.lng}`}>
                  <button
                    type="button"
                    onClick={() => {
                      goTo(r, r);
                      setResults(null);
                    }}
                    className="min-h-11 w-full rounded-8 px-3 py-2 text-start text-label text-navy hover:bg-soft"
                    data-testid="place-result"
                  >
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {note ? (
            <p role="status" className="text-caption text-muted" data-testid="location-note">
              {note}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-5">
            <PinPicker
              value={pin}
              onChange={setPin}
              origin={origin}
              editable
              label={t('centre.location.mapLabel')}
              className="h-64 max-w-[28rem] flex-1 basis-72"
            />
            <div className="flex min-w-60 flex-1 flex-col gap-3">
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
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label={t('centre.location.governorate')}
                  value={f.governorate}
                  onChange={(e) => set('governorate')(e.target.value)}
                  data-testid="location-governorate"
                />
                <Input
                  label={t('centre.location.area')}
                  value={f.area}
                  onChange={(e) => set('area')(e.target.value)}
                  data-testid="location-area"
                />
                <Input
                  label={t('centre.location.street')}
                  value={f.street}
                  onChange={(e) => set('street')(e.target.value)}
                  data-testid="location-street"
                />
                <Input
                  label={t('centre.location.landmark')}
                  help={t('centre.location.landmarkHint')}
                  value={f.landmark}
                  onChange={(e) => set('landmark')(e.target.value)}
                  data-testid="location-landmark"
                />
              </div>
              <Input
                label={t('centre.location.address')}
                value={f.address}
                onChange={(e) => set('address')(e.target.value)}
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
                <Button variant="quiet" onClick={cancel}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-5">
          <div className="flex min-w-60 flex-1 basis-72 flex-col gap-2">
            {pending ? (
              <h3 className="text-label text-muted">{t('centre.location.liveTitle')}</h3>
            ) : null}
            {hasPin(live) ? (
              <PinPicker
                value={live}
                origin={live}
                editable={false}
                label={t('centre.location.mapLabel')}
                className="h-48 max-w-80"
              />
            ) : null}
            <div data-testid="profile-address">{addressLines(live)}</div>
            <p className="text-caption text-muted">{d.hours}</p>
          </div>
          {pending ? (
            <div
              className="flex min-w-60 flex-1 basis-72 flex-col gap-2"
              data-testid="location-pending"
            >
              <h3 className="text-label text-amber">{t('centre.location.pendingTitle')}</h3>
              <PinPicker
                value={pending}
                origin={pending}
                editable={false}
                label={t('centre.location.mapLabel')}
                className="h-48 max-w-80"
              />
              {addressLines(pending)}
              <p className="text-caption text-amber">{t('centre.location.reviewNote')}</p>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
