import { useEffect, useRef } from 'react';
import { color } from '@link/tokens';
import { MAP_STYLE_URL } from '@/api-mode';

export interface WebMapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- MapLibre is loaded at run time, untyped. */
declare global {
  interface Window {
    __linkMaplibre?: Promise<any>;
    __linkMaplibreModule?: any;
  }
}

/**
 * MapLibre from public/maplibre/ as a module script (scripts/vendor-maplibre.mjs): Metro never
 * bundles it, and its worker and Arabic text plugin come from this origin.
 */
function loadMaplibre(): Promise<any> {
  if (!window.__linkMaplibre)
    window.__linkMaplibre = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/maplibre/maplibre-gl.css';
      document.head.appendChild(css);
      window.addEventListener('link-maplibre', () => resolve(window.__linkMaplibreModule), {
        once: true,
      });
      const s = document.createElement('script');
      s.type = 'module';
      s.textContent =
        "import * as m from '/maplibre/maplibre-gl.mjs'; m.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');" +
        " if (m.getRTLTextPluginStatus() === 'unavailable') m.setRTLTextPlugin('/maplibre/mapbox-gl-rtl-text.js', true).catch(() => {});" +
        " window.__linkMaplibreModule = m; window.dispatchEvent(new Event('link-maplibre'));";
      s.onerror = reject;
      document.head.appendChild(s);
    });
  return window.__linkMaplibre;
}

/**
 * J01 on the web build: the centres with free rooms on a real map (Part B). Pins are buttons in
 * the page font; north up, never mirrored. Native keeps the drawn map (WebMap.tsx).
 */
export function WebMap({
  pins,
  label,
  lang,
}: {
  pins: WebMapPin[];
  label: string;
  lang: 'ar' | 'en';
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: any = null;
    let alive = true;
    void loadMaplibre().then((ml) => {
      if (!alive || !box.current || !pins.length) return;
      const lat = pins.reduce((a, p) => a + p.lat, 0) / pins.length;
      const lng = pins.reduce((a, p) => a + p.lng, 0) / pins.length;
      map = new ml.Map({
        container: box.current,
        style: MAP_STYLE_URL,
        center: [lng, lat],
        zoom: 12,
      });
      map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      map.on('style.load', () => {
        const field =
          lang === 'ar'
            ? ['coalesce', ['get', 'name:ar'], ['get', 'name']]
            : ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
        for (const l of map.getStyle().layers ?? [])
          if (l.type === 'symbol' && map.getLayoutProperty(l.id, 'text-field') !== undefined)
            map.setLayoutProperty(l.id, 'text-field', field);
      });
      const bounds = new ml.LngLatBounds();
      for (const p of pins) {
        const el = document.createElement('div');
        el.textContent = p.label;
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', p.label);
        Object.assign(el.style, {
          background: color.white,
          color: color.navy,
          borderRadius: '999px',
          padding: '4px 10px',
          font: '600 12px Cairo, "Plus Jakarta Sans", sans-serif',
          boxShadow: '0 2px 6px rgba(10,24,36,.15)',
          whiteSpace: 'nowrap',
        });
        new ml.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
        bounds.extend([p.lng, p.lat]);
      }
      if (pins.length > 1) map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
    });
    return () => {
      alive = false;
      map?.remove();
    };
  }, [pins, lang]);
  return (
    <div
      ref={box}
      role="group"
      aria-label={label}
      dir="ltr"
      data-testid="j01-map"
      style={{ height: 240, borderRadius: 16, overflow: 'hidden' }}
    />
  );
}
