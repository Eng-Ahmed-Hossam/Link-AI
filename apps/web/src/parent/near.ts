'use client';

import { useSyncExternalStore } from 'react';

/**
 * Where search measures distance from (decided 2026-10-09): the browser's location once the parent
 * taps "Use my location" and the browser asks them, else the home area on their profile, else the
 * Maadi sample point (both server side). The location lives in memory only: never in storage, the
 * URL or the server; it is rounded to about 100 m before it is sent with a search.
 */
type Point = { lat: number; lng: number };
let point: Point | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const round = (v: number) => Math.round(v * 1000) / 1000;

export function useNearPoint(): Point | null {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => point,
    () => null,
  );
}

export function shareLocation(): Promise<'ok' | 'denied' | 'unavailable'> {
  if (typeof navigator === 'undefined' || !navigator.geolocation)
    return Promise.resolve('unavailable');
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        point = { lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) };
        emit();
        resolve('ok');
      },
      (err) => resolve(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { maximumAge: 300_000, timeout: 10_000 },
    ),
  );
}

export function forgetLocation() {
  point = null;
  emit();
}
