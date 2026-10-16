'use client';

import { useEffect, useRef } from 'react';
import type { ExpressionSpecification, Map as LMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapConfig } from './config';

export interface LibrePin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  state?: 'open' | 'waitlist';
  selected?: boolean;
  onSelect?: () => void;
}

export interface LibreMapProps {
  config: MapConfig;
  centre: { lat: number; lng: number };
  pins?: LibrePin[];
  /** Group pins that sit closer than this on screen into one numbered button (P03). */
  cluster?: boolean;
  /** The "you are here" dot (P03: the parent's area or tapped location; never stored). */
  showCentre?: boolean;
  /** The C02 picker: one draggable pin; a click on the map moves it too. */
  draggable?: { lat: number; lng: number; onChange: (p: { lat: number; lng: number }) => void };
  zoom?: number;
  /** Frame every pin (and the centre dot) on screen; with one pin or none, `centre` and `zoom` win. */
  fitPins?: boolean;
  interactive?: boolean;
  label: string;
  className?: string;
  testId?: string;
}

const CLUSTER_PX = 44;

/** MapLibre labels in the page language: Arabic names first in Arabic, the local name otherwise. */
function relabel(map: LMap, lang: 'ar' | 'en') {
  const field: ExpressionSpecification =
    lang === 'ar'
      ? ['coalesce', ['get', 'name:ar'], ['get', 'name']]
      : ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== 'symbol') continue;
    if (map.getLayoutProperty(layer.id, 'text-field') === undefined) continue;
    map.setLayoutProperty(layer.id, 'text-field', field);
  }
}

let rtlRequested = false;

/**
 * The MapLibre side of the map components (provider `maplibre`). Pins are HTML buttons (our
 * fonts, Arabic shaping and digits, keyboard focus), grouped on screen when `cluster` is on. The
 * map canvas is north-up and never mirrored; the page around it follows the language.
 */
export function LibreMap(props: LibreMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const dragMarker = useRef<Marker | null>(null);
  const latest = useRef(props);
  latest.current = props;

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let map: LMap | null = null;
    void import('maplibre-gl').then((ml) => {
      if (cancelled || !box.current) return;
      const p = latest.current;
      if (ml.getWorkerUrl?.() !== p.config.workerUrl) ml.setWorkerUrl(p.config.workerUrl);
      if (!rtlRequested && ml.getRTLTextPluginStatus() === 'unavailable') {
        rtlRequested = true;
        void ml.setRTLTextPlugin(p.config.rtlPluginUrl, true).catch(() => undefined);
      }
      map = new ml.Map({
        container: box.current,
        style: p.config.styleUrl,
        center: [p.centre.lng, p.centre.lat],
        zoom: p.zoom ?? 14,
        interactive: p.interactive ?? true,
        attributionControl: { compact: true },
        cooperativeGestures: false,
      });
      if (p.interactive !== false)
        map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      map.on('style.load', () => relabel(map!, latest.current.config.lang));
      map.on('click', (e) => {
        const d = latest.current.draggable;
        if (!d) return;
        d.onChange({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });
      map.on('moveend', () => draw());
      map.on('load', () => fit());
      mapRef.current = map;
      draw();
    });

    function fit() {
      const m = mapRef.current;
      const p = latest.current;
      const pts = [...(p.pins ?? []), ...(p.showCentre ? [p.centre] : [])];
      if (!m || !p.fitPins || (p.pins ?? []).length < 2) return;
      const lats = pts.map((x) => x.lat);
      const lngs = pts.map((x) => x.lng);
      m.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 48, maxZoom: 15, duration: 0 },
      );
    }

    function clear() {
      for (const m of markers.current) m.remove();
      markers.current = [];
    }

    function button(text: string, cls: string, onClick?: () => void, pressed?: boolean) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = cls;
      el.textContent = text;
      if (pressed !== undefined) el.setAttribute('aria-pressed', String(pressed));
      if (onClick)
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onClick();
        });
      return el;
    }

    function draw() {
      const m = mapRef.current;
      if (!m) return;
      void import('maplibre-gl').then((ml) => {
        const p = latest.current;
        clear();
        if (p.showCentre) {
          const dot = document.createElement('span');
          dot.className =
            'block size-4 rounded-full border-2 border-white bg-blue shadow-card ring-8 ring-blue/20';
          dot.setAttribute('aria-hidden', 'true');
          markers.current.push(
            new ml.Marker({ element: dot }).setLngLat([p.centre.lng, p.centre.lat]).addTo(m),
          );
        }
        const pins = p.pins ?? [];
        // Greedy screen-space clusters: a pin joins the first group within CLUSTER_PX of it.
        const groups: { x: number; y: number; pins: LibrePin[] }[] = [];
        for (const pin of pins) {
          const pt = m.project([pin.lng, pin.lat]);
          const g = p.cluster
            ? groups.find((x) => Math.hypot(x.x - pt.x, x.y - pt.y) < CLUSTER_PX)
            : undefined;
          if (g) g.pins.push(pin);
          else groups.push({ x: pt.x, y: pt.y, pins: [pin] });
        }
        const fmt = new Intl.NumberFormat(p.config.lang === 'ar' ? 'ar-EG' : 'en-EG');
        for (const g of groups) {
          if (g.pins.length > 1) {
            const lat = g.pins.reduce((s, x) => s + x.lat, 0) / g.pins.length;
            const lng = g.pins.reduce((s, x) => s + x.lng, 0) / g.pins.length;
            const el = button(
              fmt.format(g.pins.length),
              'flex size-10 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-navy text-label text-white shadow-card',
              () => m.easeTo({ center: [lng, lat], zoom: m.getZoom() + 2 }),
            );
            el.setAttribute('aria-label', g.pins.map((x) => x.label).join('، '));
            el.dataset.testid = 'map-cluster';
            markers.current.push(new ml.Marker({ element: el }).setLngLat([lng, lat]).addTo(m));
          } else if (!g.pins[0]!.label) {
            // A bare pin (a centre's own small map): a dot, not a button.
            const pin = g.pins[0]!;
            const dot = document.createElement('span');
            dot.setAttribute('aria-hidden', 'true');
            dot.className = 'block size-5 rounded-full border-4 border-white bg-blue shadow-card';
            markers.current.push(
              new ml.Marker({ element: dot }).setLngLat([pin.lng, pin.lat]).addTo(m),
            );
          } else {
            const pin = g.pins[0]!;
            const el = button(
              pin.label,
              `flex min-h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-caption shadow-card ${
                pin.selected ? 'bg-navy text-white' : 'bg-white text-navy'
              }`,
              pin.onSelect,
              pin.selected,
            );
            const dot = document.createElement('span');
            dot.setAttribute('aria-hidden', 'true');
            dot.className = `size-2 rounded-full ${pin.state === 'waitlist' ? 'bg-amber' : 'bg-blue'}`;
            el.prepend(dot);
            el.dataset.testid = 'map-pin';
            markers.current.push(
              new ml.Marker({ element: el }).setLngLat([pin.lng, pin.lat]).addTo(m),
            );
          }
        }
      });
    }

    return () => {
      cancelled = true;
      clear();
      dragMarker.current?.remove();
      map?.remove();
      mapRef.current = null;
    };
    // The map is created once; prop changes are applied by the effects below.
  }, []);

  // Pins and centre: redraw when they change.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    m.fire('moveend');
  }, [props.pins, props.showCentre, props.centre.lat, props.centre.lng]);

  // The picker's draggable pin follows the value; dragging reports the new point.
  const d = props.draggable;
  useEffect(() => {
    const m = mapRef.current;
    if (!d) return;
    let stop = false;
    void import('maplibre-gl').then((ml) => {
      if (stop || !mapRef.current) return;
      const map = mapRef.current;
      if (!dragMarker.current) {
        const el = document.createElement('span');
        el.className =
          'block size-6 cursor-grab rounded-full border-4 border-white bg-blue shadow-card';
        el.setAttribute('aria-hidden', 'true');
        el.dataset.testid = 'picker-pin';
        dragMarker.current = new ml.Marker({ element: el, draggable: true })
          .setLngLat([d.lng, d.lat])
          .addTo(map);
        dragMarker.current.on('dragend', () => {
          const ll = dragMarker.current!.getLngLat();
          latest.current.draggable?.onChange({ lat: ll.lat, lng: ll.lng });
        });
      } else dragMarker.current.setLngLat([d.lng, d.lat]);
      const c = map.getCenter();
      if (Math.abs(c.lat - d.lat) > 0.02 || Math.abs(c.lng - d.lng) > 0.02)
        map.easeTo({ center: [d.lng, d.lat] });
    });
    void m;
    return () => {
      stop = true;
    };
  }, [d?.lat, d?.lng, d]);

  return (
    <div
      ref={box}
      role="group"
      aria-label={props.label}
      dir="ltr"
      data-testid={props.testId}
      className={props.className}
    />
  );
}
